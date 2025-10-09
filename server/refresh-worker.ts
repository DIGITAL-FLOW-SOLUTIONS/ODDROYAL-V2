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
    // Determine base refresh intervals based on sport priority
    const liveInterval = ourSportKey === 'football' ? 15000 : 30000; // 15s for football, 30s others
    const prematchInterval = ourSportKey === 'football' ? 180000 : 600000; // 3min for football, 10min others

    // Live matches refresh
    const liveKey = `live:${ourSportKey}`;
    const liveRefresh = setInterval(async () => {
      await this.refreshLive(sportKey, ourSportKey);
    }, liveInterval);
    this.intervals.set(liveKey, liveRefresh);

    // Prematch refresh
    const prematchKey = `prematch:${ourSportKey}`;
    const prematchRefresh = setInterval(async () => {
      await this.refreshPrematch(sportKey, ourSportKey);
    }, prematchInterval);
    this.intervals.set(prematchKey, prematchRefresh);

    console.log(`  📡 Started refresh for ${ourSportKey} (live: ${liveInterval}ms, prematch: ${prematchInterval}ms)`);
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

      if (events.length === 0) {
        // Clear live cache if no matches
        await redisCache.setLiveLeagues(ourSportKey, [], 90);
        console.log(`  🔄 Refreshed live ${ourSportKey}: 0 leagues, 0 matches (no live matches currently)`);
        return;
      }

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

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

        // Update markets for each match
        for (const match of league.matches) {
          const markets = normalizeMarkets(match.bookmakers || []);
          await redisCache.setMatchMarkets(match.match_id, {
            match_id: match.match_id,
            markets,
            last_update: new Date().toISOString(),
          }, 120); // 2 min TTL for live
        }
      }

      console.log(`  🔄 Refreshed live ${ourSportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      console.error(`Failed to refresh live ${ourSportKey}:`, error);
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

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

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

      console.log(`  🔄 Refreshed prematch ${ourSportKey}: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      console.error(`Failed to refresh prematch ${ourSportKey}:`, error);
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
