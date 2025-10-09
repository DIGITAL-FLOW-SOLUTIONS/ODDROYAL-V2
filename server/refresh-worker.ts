import { oddsApiClient } from './odds-api-client';
import { apiFootballClient } from './api-football-client';
import { redisCache } from './redis-cache';
import {
  groupSportsByCategory,
  normalizeOddsEvent,
  groupMatchesByLeague,
  normalizeMarkets,
  getRefreshInterval,
  isMatchStartingSoon,
  ApiSport,
  GroupedSport,
} from './match-utils';
import pLimit from 'p-limit';

const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '6');
const limit = pLimit(CONCURRENCY_LIMIT);

export class RefreshWorker {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private running: boolean = false;
  private groupedSports: GroupedSport[] = [];

  async start(): Promise<void> {
    if (this.running) {
      console.log('Refresh worker already running');
      return;
    }

    console.log('🔄 Starting refresh worker...');
    this.running = true;

    // Wait for cache to be ready
    let attempts = 0;
    while (!(await redisCache.isCacheReady()) && attempts < 30) {
      console.log('Waiting for cache to be ready...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!await redisCache.isCacheReady()) {
      console.error('Cache not ready after 60 seconds, starting refresh anyway');
    }

    // Fetch and group sports dynamically
    await this.fetchAndGroupSports();

    // Start refresh loops for each sport league
    for (const sportGroup of this.groupedSports) {
      for (const league of sportGroup.leagues) {
        this.startSportRefresh(league.key, sportGroup.ourKey, sportGroup.priority);
      }
    }

    // Start global housekeeping tasks
    this.startHousekeeping();

    console.log('✅ Refresh worker started');
  }

  private async fetchAndGroupSports(): Promise<void> {
    try {
      const allSports = await oddsApiClient.getSports();
      this.groupedSports = groupSportsByCategory(allSports as ApiSport[]);
      console.log(`📡 Refresh worker loaded ${this.groupedSports.length} sport categories`);
    } catch (error) {
      console.error('Failed to fetch sports for refresh worker:', error);
      this.groupedSports = [];
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping refresh worker...');
    this.running = false;

    this.intervals.forEach((interval, key) => {
      clearInterval(interval);
      console.log(`Stopped refresh for ${key}`);
    });

    this.intervals.clear();
    console.log('✅ Refresh worker stopped');
  }

  private startSportRefresh(sportKey: string, ourSportKey: string, priority: number): void {
    // PRE-EXPIRATION REFRESH STRATEGY
    // Refresh at 80% of TTL instead of fixed intervals
    // This ensures data is always fresh before expiration
    
    // Live: TTL is 90s, so refresh at ~70s (80% of 90)
    const liveInterval = ourSportKey === 'football' ? 15000 : 30000; // Keep aggressive for live
    // Prematch: TTL is 900s (15min), so refresh at ~720s (12min) = 80% of TTL
    const prematchInterval = ourSportKey === 'football' ? 720000 : 720000; // 12min for all (80% of 15min)

    // Live matches refresh with TTL-aware logic
    const liveKey = `live:${ourSportKey}`;
    const liveRefresh = setInterval(async () => {
      // Check if refresh is needed based on TTL (20% threshold, expected TTL: 90s)
      const needsRefresh = await redisCache.needsRefresh(`live:leagues:${ourSportKey}`, 0.2, 90);
      if (needsRefresh) {
        await this.refreshLive(sportKey, ourSportKey);
      }
    }, liveInterval);
    this.intervals.set(liveKey, liveRefresh);

    // Prematch refresh with TTL-aware logic
    const prematchKey = `prematch:${ourSportKey}`;
    const prematchRefresh = setInterval(async () => {
      // Check if refresh is needed based on TTL (20% threshold, expected TTL: 900s)
      const needsRefresh = await redisCache.needsRefresh(`prematch:leagues:${ourSportKey}`, 0.2, 900);
      if (needsRefresh) {
        await this.refreshPrematch(sportKey, ourSportKey);
      }
    }, prematchInterval);
    this.intervals.set(prematchKey, prematchRefresh);

    console.log(`  📡 Started smart refresh for ${ourSportKey} (live: ${liveInterval}ms, prematch: ${prematchInterval}ms with 80% TTL trigger)`);
  }

  private async refreshLive(sportKey: string, ourSportKey: string): Promise<void> {
    try {
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: 'uk,eu,us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'decimal',
        dateFormat: 'iso',
        status: 'live',
      });

      // PROFESSIONAL STRATEGY: Never clear cache on empty responses
      // Keep existing data until fresh data arrives (stale-while-revalidate)
      if (events.length === 0) {
        const existingLeagues = await redisCache.getLiveLeagues(ourSportKey);
        
        if (existingLeagues && existingLeagues.length > 0) {
          // Extend TTL of existing data to prevent expiration
          const currentTtl = await redisCache.ttl(`live:leagues:${ourSportKey}`);
          if (currentTtl > 0 && currentTtl < 60) {
            // If TTL is low, extend it to keep data visible
            await redisCache.expire(`live:leagues:${ourSportKey}`, 90);
            console.log(`  ⏰ No fresh live matches for ${ourSportKey}, keeping existing ${existingLeagues.length} leagues (TTL extended)`);
          } else {
            console.log(`  ⏰ No fresh live matches for ${ourSportKey}, keeping existing ${existingLeagues.length} leagues`);
          }
        } else {
          console.log(`  🔄 No live matches for ${ourSportKey} (and no existing cache)`);
        }
        return;
      }

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey, true));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      // Only update cache if we have actual data
      if (nonEmptyLeagues.length > 0) {
        // Update leagues
        const leaguesForCache = nonEmptyLeagues.map(lg => ({
          league_id: lg.league_id,
          league_name: lg.league_name,
          match_count: lg.match_count,
        }));

        await redisCache.setLiveLeagues(ourSportKey, leaguesForCache, 90);

        // Update matches and markets
        for (const league of nonEmptyLeagues) {
          await redisCache.setLiveMatches(ourSportKey, league.league_id, league.matches, 60);

          // Update markets for each match with odds delta tracking
          for (const match of league.matches) {
            const markets = normalizeMarkets(match.bookmakers || []);
            
            // Track odds changes for h2h market
            const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
            if (h2hMarket?.outcomes) {
              const currentOdds: Record<string, number> = {};
              h2hMarket.outcomes.forEach((outcome: any) => {
                currentOdds[outcome.name] = outcome.price || 0;
              });
              
              // Calculate deltas (this also stores the snapshot)
              await redisCache.calculateOddsDelta(match.match_id, 'h2h', currentOdds);
              
              // Determine market status based on odds availability
              const hasValidOdds = h2hMarket.outcomes.some((o: any) => o.price > 0);
              const marketStatus = hasValidOdds ? 'open' : 'suspended';
              await redisCache.setMarketStatus(match.match_id, 'h2h', marketStatus, 120);
            }
            
            await redisCache.setMatchMarkets(match.match_id, {
              match_id: match.match_id,
              markets,
              last_update: new Date().toISOString(),
            }, 120); // 2 min TTL for live
          }
        }

        console.log(`  ✅ Refreshed live ${ourSportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
      }
    } catch (error) {
      // GRACEFUL DEGRADATION: On API failure, keep existing cache
      console.error(`❌ Failed to refresh live ${ourSportKey}:`, error);
      
      // Extend TTL of existing data to prevent expiration during API issues
      try {
        const existingLeagues = await redisCache.getLiveLeagues(ourSportKey);
        if (existingLeagues && existingLeagues.length > 0) {
          await redisCache.expire(`live:leagues:${ourSportKey}`, 90);
          console.log(`  ⚠️  API error for ${ourSportKey}, extended TTL for ${existingLeagues.length} existing leagues`);
        }
      } catch (cacheError) {
        console.error(`  ❌ Could not extend TTL during API failure:`, cacheError);
      }
    }
  }

  private async refreshPrematch(sportKey: string, ourSportKey: string): Promise<void> {
    try {
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: 'uk,eu,us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'decimal',
        dateFormat: 'iso',
      });

      // PROFESSIONAL STRATEGY: Only update if we have fresh data
      if (events.length === 0) {
        const existingLeagues = await redisCache.getPrematchLeagues(ourSportKey);
        
        if (existingLeagues && existingLeagues.length > 0) {
          // Extend TTL of existing data to prevent expiration
          const currentTtl = await redisCache.ttl(`prematch:leagues:${ourSportKey}`);
          if (currentTtl > 0 && currentTtl < 300) {
            // If TTL is low (< 5 min), extend it
            await redisCache.expire(`prematch:leagues:${ourSportKey}`, 900);
            console.log(`  ⏰ No fresh prematch data for ${ourSportKey}, keeping existing ${existingLeagues.length} leagues (TTL extended)`);
          } else {
            console.log(`  ⏰ No fresh prematch data for ${ourSportKey}, keeping existing ${existingLeagues.length} leagues`);
          }
        } else {
          console.log(`  🔄 No prematch matches for ${ourSportKey} (and no existing cache)`);
        }
        return;
      }

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      // Only update cache if we have actual data
      if (nonEmptyLeagues.length > 0) {
        // Update leagues
        const leaguesForCache = nonEmptyLeagues.map(lg => ({
          league_id: lg.league_id,
          league_name: lg.league_name,
          match_count: lg.match_count,
        }));

        await redisCache.setPrematchLeagues(ourSportKey, leaguesForCache, 900);

        // Update matches and markets
        for (const league of nonEmptyLeagues) {
          await redisCache.setPrematchMatches(ourSportKey, league.league_id, league.matches, 600);

          // Update markets with dynamic TTL based on start time
          for (const match of league.matches) {
            const startingSoon = isMatchStartingSoon(match.commence_time);
            const markets = normalizeMarkets(match.bookmakers || []);
            const ttl = startingSoon ? 120 : 300; // 2 min if starting soon, 5 min otherwise

            await redisCache.setMatchMarkets(match.match_id, {
              match_id: match.match_id,
              markets,
              last_update: new Date().toISOString(),
            }, ttl);
          }
        }

        console.log(`  ✅ Refreshed prematch ${ourSportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
      }
    } catch (error) {
      // GRACEFUL DEGRADATION: On API failure, keep existing cache
      console.error(`❌ Failed to refresh prematch ${ourSportKey}:`, error);
      
      // Extend TTL of existing data to prevent expiration during API issues
      try {
        const existingLeagues = await redisCache.getPrematchLeagues(ourSportKey);
        if (existingLeagues && existingLeagues.length > 0) {
          await redisCache.expire(`prematch:leagues:${ourSportKey}`, 900);
          console.log(`  ⚠️  API error for ${ourSportKey}, extended TTL for ${existingLeagues.length} existing leagues`);
        }
      } catch (cacheError) {
        console.error(`  ❌ Could not extend TTL during API failure:`, cacheError);
      }
    }
  }

  private startHousekeeping(): void {
    // Results check every 90 seconds
    const resultsInterval = setInterval(async () => {
      await this.checkResults();
    }, 90000);
    this.intervals.set('housekeeping:results', resultsInterval);

    // Logo refresh daily
    const logoInterval = setInterval(async () => {
      await this.refreshLogos();
    }, 86400000); // 24 hours
    this.intervals.set('housekeeping:logos', logoInterval);

    console.log('  🏠 Started housekeeping tasks');
  }

  private async checkResults(): Promise<void> {
    try {
      for (const sportGroup of this.groupedSports) {
        for (const league of sportGroup.leagues) {
          const scores = await oddsApiClient.getScores(league.key, 1);
          
          // Update completed matches
          for (const event of scores) {
            if (event.completed) {
              const normalizedMatch = normalizeOddsEvent(event, sportGroup.ourKey);
              // Could trigger settlement here or update match status
              console.log(`Match completed: ${normalizedMatch.home_team} vs ${normalizedMatch.away_team}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to check results:', error);
    }
  }

  private async refreshLogos(): Promise<void> {
    console.log('🖼️  Refreshing team logos...');
    
    try {
      // Get all football matches from cache
      const prematchLeagues = await redisCache.getPrematchLeagues('football') || [];
      
      const teams = new Set<string>();
      
      for (const league of prematchLeagues) {
        const matches = await redisCache.getPrematchMatches('football', league.league_id) || [];
        matches.forEach(match => {
          teams.add(match.home_team);
          teams.add(match.away_team);
        });
      }

      const logoPromises = Array.from(teams).map(teamName =>
        limit(async () => {
          try {
            const logo = await apiFootballClient.getTeamLogo(teamName);
            if (logo) {
              await redisCache.setTeamLogo('football', teamName, logo, 604800);
            }
          } catch (error) {
            console.warn(`Failed to refresh logo for ${teamName}`);
          }
        })
      );

      await Promise.all(logoPromises);
      console.log(`✅ Refreshed logos for ${teams.size} teams`);
    } catch (error) {
      console.error('Failed to refresh logos:', error);
    }
  }
}

export const refreshWorker = new RefreshWorker();
