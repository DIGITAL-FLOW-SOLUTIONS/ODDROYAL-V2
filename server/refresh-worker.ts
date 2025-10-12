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
  applyLeagueLimits,
  ApiSport,
  GroupedSport,
  FOOTBALL_LEAGUE_PRIORITY,
} from './match-utils';
import pLimit from 'p-limit';
import { logger } from './logger';

const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '6');
const limit = pLimit(CONCURRENCY_LIMIT);

// Professional betting site intervals
const REFRESH_INTERVALS = {
  live: {
    football_top: 45000,      // 45s for top football leagues
    football_other: 90000,    // 90s for other football
    other_sports: 120000,     // 2min for other sports
  },
  prematch: {
    starting_soon: 300000,    // 5min for matches < 1hr away
    starting_medium: 600000,  // 10min for matches 1-6hr away  
    starting_late: 900000,    // 15min for matches > 6hr away
  },
  settlement: 300000,         // 5min for score checks
};

// Top priority football leagues
const TOP_FOOTBALL_LEAGUES = [
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
];

export class RefreshWorker {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private running: boolean = false;
  private groupedSports: GroupedSport[] = [];

  async start(): Promise<void> {
    if (this.running) {
      logger.info('Refresh worker already running');
      return;
    }

    logger.info('🔄 Starting refresh worker...');
    this.running = true;

    // Wait for cache to be ready
    let attempts = 0;
    while (!(await redisCache.isCacheReady()) && attempts < 30) {
      logger.info('Waiting for cache to be ready...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!await redisCache.isCacheReady()) {
      logger.error('Cache not ready after 60 seconds, starting refresh anyway');
    }

    // Fetch and group sports dynamically with league limits applied
    await this.fetchAndGroupSports();

    // Start refresh loops PER SPORT CATEGORY (not per league!)
    for (const sportGroup of this.groupedSports) {
      this.startSportRefresh(sportGroup);
    }

    // Start global housekeeping tasks
    this.startHousekeeping();

    logger.success('✅ Refresh worker started');
    logger.info(`📊 Monitoring ${this.groupedSports.length} sport categories`);
    logger.info(`⚽ Football: ${this.groupedSports.find(s => s.ourKey === 'football')?.leagues.length || 0} leagues`);
  }

  private async fetchAndGroupSports(): Promise<void> {
    try {
      const allSports = await oddsApiClient.getSports();
      const grouped = groupSportsByCategory(allSports as ApiSport[]);
      
      // Apply league limits for API efficiency
      this.groupedSports = applyLeagueLimits(grouped);
      
      logger.info(`📡 Refresh worker loaded ${this.groupedSports.length} sport categories (with limits applied)`);
      this.groupedSports.forEach(group => {
        logger.info(`  - ${group.title}: ${group.leagues.length} leagues`);
      });
    } catch (error) {
      logger.error('Failed to fetch sports for refresh worker:', error);
      this.groupedSports = [];
    }
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping refresh worker...');
    this.running = false;

    this.intervals.forEach((interval, key) => {
      clearInterval(interval);
      logger.info(`Stopped refresh for ${key}`);
    });

    this.intervals.clear();
    logger.success('✅ Refresh worker stopped');
  }

  private startSportRefresh(sportGroup: GroupedSport): void {
    const { ourKey: sportKey, leagues, priority } = sportGroup;
    
    // Determine if this is top priority football
    const isTopFootball = sportKey === 'football' && 
      leagues.some(l => TOP_FOOTBALL_LEAGUES.includes(l.key));
    
    // Set intervals based on sport priority
    const liveInterval = sportKey === 'football' 
      ? (isTopFootball ? REFRESH_INTERVALS.live.football_top : REFRESH_INTERVALS.live.football_other)
      : REFRESH_INTERVALS.live.other_sports;
    
    // Live matches refresh - ONE call per sport category
    const liveKey = `live:${sportKey}`;
    const liveRefresh = setInterval(async () => {
      await this.refreshLiveSport(sportGroup);
    }, liveInterval);
    this.intervals.set(liveKey, liveRefresh);

    // Prematch refresh - ONE fetch per sport at 5-minute interval
    // This ensures matches starting soon (<1hr) get fresh updates every 5min
    // while keeping API usage minimal (single fetch per sport)
    const prematchKey = `prematch:${sportKey}`;
    const prematchRefresh = setInterval(async () => {
      await this.refreshPrematchSport(sportGroup);
    }, REFRESH_INTERVALS.prematch.starting_soon); // 5 minutes - most frequent cadence
    this.intervals.set(prematchKey, prematchRefresh);

    logger.info(`  📡 Started refresh for ${sportKey} (live: ${liveInterval/1000}s, prematch: 5min)`);
  }

  private async refreshLiveSport(sportGroup: GroupedSport): Promise<void> {
    const { ourKey: sportKey, leagues } = sportGroup;
    
    try {
      // CRITICAL OPTIMIZATION: Fetch ONCE for entire sport category
      // The API returns all leagues anyway, so we just filter after
      const sportKeys = leagues.map(l => l.key);
      
      // Aggregate all events from all leagues in this sport
      const allEvents: any[] = [];
      
      // Fetch in parallel with concurrency limit
      const fetchPromises = sportKeys.map(key => 
        limit(async () => {
          try {
            const events = await oddsApiClient.getOdds(key, {
              regions: 'uk,eu,us',
              markets: 'h2h,spreads,totals',
              oddsFormat: 'decimal',
              dateFormat: 'iso',
              status: 'live',
            });
            return events;
          } catch (err) {
            logger.warn(`Failed to fetch live ${key}:`, err);
            return [];
          }
        })
      );
      
      const results = await Promise.all(fetchPromises);
      results.forEach(events => allEvents.push(...events));

      // Handle empty responses gracefully
      if (allEvents.length === 0) {
        const existingLeagues = await redisCache.getLiveLeagues(sportKey);
        
        if (existingLeagues && existingLeagues.length > 0) {
          const currentTtl = await redisCache.ttl(`live:leagues:${sportKey}`);
          if (currentTtl > 0 && currentTtl < 60) {
            await redisCache.expire(`live:leagues:${sportKey}`, 90);
            logger.info(`  ⏰ No fresh live matches for ${sportKey}, keeping existing ${existingLeagues.length} leagues`);
          }
        }
        return;
      }

      const normalizedMatches = allEvents.map(event => normalizeOddsEvent(event, sportKey, true));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      if (nonEmptyLeagues.length > 0) {
        const leaguesForCache = nonEmptyLeagues.map(lg => ({
          league_id: lg.league_id,
          league_name: lg.league_name,
          match_count: lg.match_count,
        }));

        await redisCache.setLiveLeagues(sportKey, leaguesForCache, 90);

        for (const league of nonEmptyLeagues) {
          await redisCache.setLiveMatches(sportKey, league.league_id, league.matches, 60);

          for (const match of league.matches) {
            const markets = normalizeMarkets(match.bookmakers || []);
            
            const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
            if (h2hMarket?.outcomes) {
              const currentOdds: Record<string, number> = {};
              h2hMarket.outcomes.forEach((outcome: any) => {
                currentOdds[outcome.name] = outcome.price || 0;
              });
              
              await redisCache.calculateOddsDelta(match.match_id, 'h2h', currentOdds);
              
              const hasValidOdds = h2hMarket.outcomes.some((o: any) => o.price > 0);
              const marketStatus = hasValidOdds ? 'open' : 'suspended';
              await redisCache.setMarketStatus(match.match_id, 'h2h', marketStatus, 120);
            }
            
            await redisCache.setMatchMarkets(match.match_id, {
              match_id: match.match_id,
              markets,
              last_update: new Date().toISOString(),
            }, 120);
          }
        }

        logger.success(`  ✅ Refreshed live ${sportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
      }
    } catch (error) {
      logger.error(`❌ Failed to refresh live ${sportKey}:`, error);
      
      try {
        const existingLeagues = await redisCache.getLiveLeagues(sportKey);
        if (existingLeagues && existingLeagues.length > 0) {
          await redisCache.expire(`live:leagues:${sportKey}`, 90);
          logger.info(`  ⚠️  API error for ${sportKey}, extended TTL for ${existingLeagues.length} existing leagues`);
        }
      } catch (cacheError) {
        logger.error(`  ❌ Could not extend TTL during API failure:`, cacheError);
      }
    }
  }

  private async refreshPrematchSport(sportGroup: GroupedSport): Promise<void> {
    const { ourKey: sportKey, leagues } = sportGroup;
    
    try {
      // CRITICAL OPTIMIZATION: Fetch ONCE for entire sport category
      const sportKeys = leagues.map(l => l.key);
      const allEvents: any[] = [];
      
      // Fetch in parallel with concurrency limit
      const fetchPromises = sportKeys.map(key => 
        limit(async () => {
          try {
            const events = await oddsApiClient.getOdds(key, {
              regions: 'uk,eu,us',
              markets: 'h2h,spreads,totals',
              oddsFormat: 'decimal',
              dateFormat: 'iso',
            });
            return events;
          } catch (err) {
            logger.warn(`Failed to fetch prematch ${key}:`, err);
            return [];
          }
        })
      );
      
      const results = await Promise.all(fetchPromises);
      results.forEach(events => allEvents.push(...events));

      if (allEvents.length === 0) {
        const existingLeagues = await redisCache.getPrematchLeagues(sportKey);
        
        if (existingLeagues && existingLeagues.length > 0) {
          const currentTtl = await redisCache.ttl(`prematch:leagues:${sportKey}`);
          if (currentTtl > 0 && currentTtl < 300) {
            await redisCache.expire(`prematch:leagues:${sportKey}`, 900);
            logger.info(`  ⏰ No fresh prematch data for ${sportKey}, keeping existing ${existingLeagues.length} leagues`);
          }
        }
        return;
      }

      const normalizedMatches = allEvents.map(event => normalizeOddsEvent(event, sportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      if (nonEmptyLeagues.length > 0) {
        const leaguesForCache = nonEmptyLeagues.map(lg => ({
          league_id: lg.league_id,
          league_name: lg.league_name,
          match_count: lg.match_count,
        }));

        await redisCache.setPrematchLeagues(sportKey, leaguesForCache, 900);

        for (const league of nonEmptyLeagues) {
          await redisCache.setPrematchMatches(sportKey, league.league_id, league.matches, 600);

          for (const match of league.matches) {
            const startingSoon = isMatchStartingSoon(match.commence_time);
            const markets = normalizeMarkets(match.bookmakers || []);
            const ttl = startingSoon ? 120 : 300;

            await redisCache.setMatchMarkets(match.match_id, {
              match_id: match.match_id,
              markets,
              last_update: new Date().toISOString(),
            }, ttl);
          }
        }

        logger.success(`  ✅ Refreshed prematch ${sportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
      }
    } catch (error) {
      logger.error(`❌ Failed to refresh prematch ${sportKey}:`, error);
      
      try {
        const existingLeagues = await redisCache.getPrematchLeagues(sportKey);
        if (existingLeagues && existingLeagues.length > 0) {
          await redisCache.expire(`prematch:leagues:${sportKey}`, 900);
          logger.info(`  ⚠️  API error for ${sportKey}, extended TTL for ${existingLeagues.length} existing leagues`);
        }
      } catch (cacheError) {
        logger.error(`  ❌ Could not extend TTL during API failure:`, cacheError);
      }
    }
  }

  private startHousekeeping(): void {
    // Logo refresh daily (reduced from multiple times)
    const logoInterval = setInterval(async () => {
      await this.refreshLogos();
    }, 86400000); // 24 hours
    this.intervals.set('housekeeping:logos', logoInterval);

    logger.info('  🏠 Started housekeeping tasks');
  }

  private async refreshLogos(): Promise<void> {
    logger.info('🖼️  Refreshing team logos...');
    
    try {
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
            logger.warn(`Failed to refresh logo for ${teamName}`);
          }
        })
      );

      await Promise.all(logoPromises);
      logger.success(`✅ Refreshed logos for ${teams.size} teams`);
    } catch (error) {
      logger.error('Failed to refresh logos:', error);
    }
  }
}

export const refreshWorker = new RefreshWorker();
