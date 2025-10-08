import { oddsApiClient } from './odds-api-client';
import { apiFootballClient } from './api-football-client';
import { redisCache } from './redis-cache';
import {
  groupSportsByCategory,
  getSportKeysForCategory,
  normalizeOddsEvent,
  groupMatchesByLeague,
  normalizeMarkets,
  generateMatchId,
  isMatchStartingSoon,
  ApiSport,
  GroupedSport,
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
  
  private groupedSports: GroupedSport[] = [];

  async preloadAll(): Promise<PreloadReport> {
    console.log('🚀 Starting full preload of all sports data (dynamic)...');
    
    try {
      // Connect to Redis
      await redisCache.connect();
      
      // Fetch all available sports from The Odds API and group them
      await this.fetchAndGroupSports();

      // PRIORITY PHASE: Preload only TOP Football leagues (major competitions)
      const footballGroup = this.groupedSports.find(g => g.ourKey === 'football');
      const topFootballLeagues = [
        'soccer_epl',
        'soccer_spain_la_liga',
        'soccer_germany_bundesliga',
        'soccer_italy_serie_a',
        'soccer_france_ligue_one',
        'soccer_uefa_champs_league',
        'soccer_uefa_europa_league'
      ];
      
      if (footballGroup) {
        console.log('⚽ Preloading TOP Football leagues first (priority)...');
        const priorityLeagues = footballGroup.leagues.filter(l => 
          topFootballLeagues.includes(l.key)
        );
        const footballPromises = priorityLeagues.map(league =>
          limit(() => this.preloadSport(league.key, footballGroup.ourKey))
        );
        await Promise.all(footballPromises);
        console.log(`✅ ${priorityLeagues.length} priority Football leagues preloaded`);
      }

      // Set cache ready flag after priority sports are loaded
      await redisCache.setCacheReady(true);
      console.log('✅ Cache ready - app can start serving requests');

      // BACKGROUND PHASE: Load remaining sports (non-blocking)
      const otherSports = this.groupedSports.filter(g => g.ourKey !== 'football');
      if (otherSports.length > 0) {
        console.log(`📥 Loading ${otherSports.length} additional sport categories in background...`);
        
        // Load other sports without waiting (don't await)
        Promise.all(
          otherSports.flatMap(sportGroup =>
            sportGroup.leagues.map(league =>
              limit(() => this.preloadSport(league.key, sportGroup.ourKey))
            )
          )
        ).then(() => {
          console.log('✅ Background sports preload completed');
        }).catch(err => {
          console.error('⚠️  Background preload error:', err);
        });
      }

      // Finalize report (for priority phase only)
      this.report.endTime = new Date().toISOString();
      this.report.duration = new Date(this.report.endTime).getTime() - 
                             new Date(this.report.startTime).getTime();
      this.report.creditsUsed = oddsApiClient.getMetrics();

      // Save report
      await redisCache.setCacheReport(this.report);

      console.log('✅ Priority preload completed');
      console.log(`📊 Total sports categories: ${this.groupedSports.length}`);
      console.log(`📊 Priority leagues loaded: ${this.report.totalLeagues}`);
      console.log(`📊 Priority matches loaded: ${this.report.totalMatches}`);
      console.log(`⏱️  Priority phase duration: ${(this.report.duration / 1000).toFixed(2)}s`);

      return this.report;
    } catch (error) {
      console.error('❌ Preload failed:', error);
      this.report.failures.push(`Global error: ${(error as Error).message}`);
      throw error;
    }
  }

  private async fetchAndGroupSports(): Promise<void> {
    try {
      console.log('📡 Fetching all available sports from The Odds API...');
      
      // Fetch all sports from The Odds API (this is free, no quota cost)
      const allSports = await oddsApiClient.getSports();
      console.log(`📥 Retrieved ${allSports.length} total sports from API`);
      
      // Group sports by category
      this.groupedSports = groupSportsByCategory(allSports as ApiSport[]);
      
      console.log(`✅ Grouped into ${this.groupedSports.length} sport categories:`);
      this.groupedSports.forEach(group => {
        console.log(`  - ${group.title}: ${group.leagues.length} leagues`);
      });

      // Cache the grouped sports list for frontend
      const sportsForCache = this.groupedSports.map(group => ({
        key: group.ourKey,
        title: group.title,
        priority: group.priority,
        league_count: group.leagues.length,
      }));

      await redisCache.setSportsList(sportsForCache, 3600); // 1 hour TTL
    } catch (error) {
      console.error('Failed to fetch and group sports:', error);
      this.report.failures.push(`Sports grouping: ${(error as Error).message}`);
      throw error;
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

    for (const sportGroup of this.groupedSports) {
      const prematchLeagues = await redisCache.getPrematchLeagues(sportGroup.ourKey);
      const liveLeagues = await redisCache.getLiveLeagues(sportGroup.ourKey);

      if (prematchLeagues) {
        for (const league of prematchLeagues) {
          const matches = await redisCache.getPrematchMatches(sportGroup.ourKey, league.league_id);
          if (!matches || matches.length === 0) {
            this.report.emptyLeagues.push(`${sportGroup.ourKey}:prematch:${league.league_id}`);
          }
        }
      }

      if (liveLeagues) {
        for (const league of liveLeagues) {
          const matches = await redisCache.getLiveMatches(sportGroup.ourKey, league.league_id);
          if (!matches || matches.length === 0) {
            this.report.emptyLeagues.push(`${sportGroup.ourKey}:live:${league.league_id}`);
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
