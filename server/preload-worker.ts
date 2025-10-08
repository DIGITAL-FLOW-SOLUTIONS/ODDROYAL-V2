import { oddsApiClient } from './odds-api-client';
import { apiFootballClient } from './api-football-client';
import { redisCache } from './redis-cache';
import {
  PRIORITY_SPORTS,
  ODDS_API_SPORT_KEYS,
  normalizeOddsEvent,
  groupMatchesByLeague,
  normalizeMarkets,
  generateMatchId,
  isMatchStartingSoon,
} from './match-utils';
import pLimit from 'p-limit';

const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '6');
const limit = pLimit(CONCURRENCY_LIMIT);

interface PreloadReport {
  startTime: string;
  endTime?: string;
  duration?: number;
  sports: {
    [sportKey: string]: {
      prematch: {
        leagues: number;
        matches: number;
        success: boolean;
        error?: string;
      };
      live: {
        leagues: number;
        matches: number;
        success: boolean;
        error?: string;
      };
    };
  };
  totalLeagues: number;
  totalMatches: number;
  emptyLeagues: string[];
  failures: string[];
  creditsUsed: any;
}

export class PreloadWorker {
  private report: PreloadReport = {
    startTime: new Date().toISOString(),
    sports: {},
    totalLeagues: 0,
    totalMatches: 0,
    emptyLeagues: [],
    failures: [],
    creditsUsed: {},
  };

  async preloadAll(): Promise<PreloadReport> {
    console.log('🚀 Starting full preload of all sports data...');
    
    try {
      // Connect to Redis
      await redisCache.connect();
      
      // Fetch and cache sports list
      await this.preloadSportsList();

      // Preload each priority sport
      const sportPromises = PRIORITY_SPORTS.map(sport =>
        limit(() => this.preloadSport(sport.key, sport.ourKey))
      );

      await Promise.all(sportPromises);

      // Set cache ready flag
      await redisCache.setCacheReady(true);

      // Finalize report
      this.report.endTime = new Date().toISOString();
      this.report.duration = new Date(this.report.endTime).getTime() - 
                             new Date(this.report.startTime).getTime();
      this.report.creditsUsed = oddsApiClient.getMetrics();

      // Save report
      await redisCache.setCacheReport(this.report);

      console.log('✅ Preload completed successfully');
      console.log(`📊 Total leagues: ${this.report.totalLeagues}`);
      console.log(`📊 Total matches: ${this.report.totalMatches}`);
      console.log(`⏱️  Duration: ${(this.report.duration / 1000).toFixed(2)}s`);

      return this.report;
    } catch (error) {
      console.error('❌ Preload failed:', error);
      this.report.failures.push(`Global error: ${(error as Error).message}`);
      throw error;
    }
  }

  private async preloadSportsList(): Promise<void> {
    try {
      const sports = await oddsApiClient.getSports();
      
      // Filter to only priority sports
      const prioritySports = sports.filter(sport =>
        PRIORITY_SPORTS.some(ps => ps.key === sport.key)
      );

      await redisCache.setSportsList(prioritySports, 3600); // 1 hour TTL
      console.log(`✅ Cached ${prioritySports.length} sports`);
    } catch (error) {
      console.error('Failed to preload sports list:', error);
      this.report.failures.push(`Sports list: ${(error as Error).message}`);
    }
  }

  private async preloadSport(sportKey: string, ourSportKey: string): Promise<void> {
    console.log(`📥 Preloading ${ourSportKey} (${sportKey})...`);

    this.report.sports[ourSportKey] = {
      prematch: { leagues: 0, matches: 0, success: false },
      live: { leagues: 0, matches: 0, success: false },
    };

    // Preload prematch and live in parallel
    await Promise.all([
      this.preloadPrematch(sportKey, ourSportKey),
      this.preloadLive(sportKey, ourSportKey),
    ]);
  }

  private async preloadPrematch(sportKey: string, ourSportKey: string): Promise<void> {
    try {
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: 'uk,eu,us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'decimal',
        dateFormat: 'iso',
      });

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);

      // Filter out empty leagues
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      // Cache leagues
      const leaguesForCache = nonEmptyLeagues.map(lg => ({
        league_id: lg.league_id,
        league_name: lg.league_name,
        match_count: lg.match_count,
      }));

      await redisCache.setPrematchLeagues(ourSportKey, leaguesForCache, 900); // 15 min TTL

      // Cache matches for each league
      for (const league of nonEmptyLeagues) {
        await redisCache.setPrematchMatches(
          ourSportKey,
          league.league_id,
          league.matches,
          600 // 10 min TTL
        );

        // Prefetch markets for each match
        for (const match of league.matches) {
          await this.prefetchMatchMarkets(match, false);
        }
      }

      // Prefetch logos for football
      if (ourSportKey === 'football') {
        await this.prefetchFootballLogos(normalizedMatches);
      }

      this.report.sports[ourSportKey].prematch = {
        leagues: nonEmptyLeagues.length,
        matches: normalizedMatches.length,
        success: true,
      };

      this.report.totalLeagues += nonEmptyLeagues.length;
      this.report.totalMatches += normalizedMatches.length;

      console.log(`  ✅ Prematch: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`  ❌ Prematch failed for ${ourSportKey}:`, errorMsg);
      this.report.sports[ourSportKey].prematch = {
        leagues: 0,
        matches: 0,
        success: false,
        error: errorMsg,
      };
      this.report.failures.push(`${ourSportKey} prematch: ${errorMsg}`);
    }
  }

  private async preloadLive(sportKey: string, ourSportKey: string): Promise<void> {
    try {
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: 'uk,eu,us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'decimal',
        dateFormat: 'iso',
        status: 'live',
      });

      if (events.length === 0) {
        console.log(`  ℹ️  No live matches for ${ourSportKey}`);
        this.report.sports[ourSportKey].live = {
          leagues: 0,
          matches: 0,
          success: true,
        };
        return;
      }

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);

      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      // Cache leagues
      const leaguesForCache = nonEmptyLeagues.map(lg => ({
        league_id: lg.league_id,
        league_name: lg.league_name,
        match_count: lg.match_count,
      }));

      await redisCache.setLiveLeagues(ourSportKey, leaguesForCache, 90); // 90s TTL

      // Cache matches for each league
      for (const league of nonEmptyLeagues) {
        await redisCache.setLiveMatches(
          ourSportKey,
          league.league_id,
          league.matches,
          60 // 60s TTL
        );

        // Prefetch markets for each match
        for (const match of league.matches) {
          await this.prefetchMatchMarkets(match, true);
        }
      }

      this.report.sports[ourSportKey].live = {
        leagues: nonEmptyLeagues.length,
        matches: normalizedMatches.length,
        success: true,
      };

      this.report.totalLeagues += nonEmptyLeagues.length;
      this.report.totalMatches += normalizedMatches.length;

      console.log(`  ✅ Live: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`  ❌ Live failed for ${ourSportKey}:`, errorMsg);
      this.report.sports[ourSportKey].live = {
        leagues: 0,
        matches: 0,
        success: false,
        error: errorMsg,
      };
      this.report.failures.push(`${ourSportKey} live: ${errorMsg}`);
    }
  }

  private async prefetchMatchMarkets(match: any, isLive: boolean): Promise<void> {
    try {
      const markets = normalizeMarkets(match.bookmakers || []);
      const ttl = isLive ? 120 : 300; // 2 min for live, 5 min for prematch
      
      await redisCache.setMatchMarkets(match.match_id, {
        match_id: match.match_id,
        markets,
        last_update: new Date().toISOString(),
      }, ttl);
    } catch (error) {
      console.warn(`Failed to prefetch markets for match ${match.match_id}:`, error);
    }
  }

  private async prefetchFootballLogos(matches: any[]): Promise<void> {
    const teams = new Set<string>();
    
    matches.forEach(match => {
      teams.add(match.home_team);
      teams.add(match.away_team);
    });

    const logoPromises = Array.from(teams).map(teamName =>
      limit(async () => {
        try {
          // Check if already cached
          const cached = await redisCache.getTeamLogo('football', teamName);
          if (cached) return;

          // Fetch from API-Football
          const logo = await apiFootballClient.getTeamLogo(teamName);
          
          if (logo) {
            await redisCache.setTeamLogo('football', teamName, logo, 604800); // 7 days
          }
        } catch (error) {
          console.warn(`Failed to fetch logo for ${teamName}:`, error);
        }
      })
    );

    await Promise.all(logoPromises);
  }

  async validateCache(): Promise<void> {
    console.log('🔍 Validating cache...');

    for (const sport of PRIORITY_SPORTS) {
      const prematchLeagues = await redisCache.getPrematchLeagues(sport.ourKey);
      const liveLeagues = await redisCache.getLiveLeagues(sport.ourKey);

      if (prematchLeagues) {
        for (const league of prematchLeagues) {
          const matches = await redisCache.getPrematchMatches(sport.ourKey, league.league_id);
          if (!matches || matches.length === 0) {
            this.report.emptyLeagues.push(`${sport.ourKey}:prematch:${league.league_id}`);
          }
        }
      }

      if (liveLeagues) {
        for (const league of liveLeagues) {
          const matches = await redisCache.getLiveMatches(sport.ourKey, league.league_id);
          if (!matches || matches.length === 0) {
            this.report.emptyLeagues.push(`${sport.ourKey}:live:${league.league_id}`);
          }
        }
      }
    }

    if (this.report.emptyLeagues.length > 0) {
      console.warn(`⚠️  Found ${this.report.emptyLeagues.length} empty leagues`);
    } else {
      console.log('✅ Cache validation passed - no empty leagues');
    }
  }
}

export const preloadWorker = new PreloadWorker();
