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
  applyLeagueLimits,
  getSportApiConfig,
  ApiSport,
  GroupedSport,
} from './match-utils';
import pLimit from 'p-limit';
import { logger } from './logger';

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
    logger.info('🚀 Starting full preload of all sports data (dynamic)...');
    
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
        logger.info('⚽ Preloading TOP Football leagues first (priority)...');
        const priorityLeagues = footballGroup.leagues.filter(l => 
          topFootballLeagues.includes(l.key)
        );
        // Aggregate all priority football leagues together
        await this.preloadSportGroup(footballGroup.ourKey, priorityLeagues);
        logger.success(`✅ ${priorityLeagues.length} priority Football leagues preloaded`);
      }

      // Set cache ready flag after priority sports are loaded
      await redisCache.setCacheReady(true);
      logger.success('✅ Cache ready - app can start serving requests');

      // BACKGROUND PHASE: Load remaining sports (non-blocking)
      const backgroundTasks = [];
      
      // Add remaining football leagues
      if (footballGroup) {
        const remainingFootballLeagues = footballGroup.leagues.filter(l => 
          !topFootballLeagues.includes(l.key)
        );
        if (remainingFootballLeagues.length > 0) {
          logger.info(`📥 Loading ${remainingFootballLeagues.length} additional Football leagues in background...`);
          backgroundTasks.push(
            this.preloadSportGroup(footballGroup.ourKey, remainingFootballLeagues, true)
          );
        }
      }
      
      // Add other sports
      const otherSports = this.groupedSports.filter(g => g.ourKey !== 'football');
      for (const sportGroup of otherSports) {
        backgroundTasks.push(
          this.preloadSportGroup(sportGroup.ourKey, sportGroup.leagues, true)
        );
      }
      
      if (backgroundTasks.length > 0) {
        logger.info(`📥 Loading ${otherSports.length} additional sport categories in background...`);
        // Load without waiting (don't await)
        Promise.all(backgroundTasks).then(() => {
          logger.success('✅ Background sports preload completed');
        }).catch(err => {
          logger.error('⚠️  Background preload error:', err);
        });
      }

      // Finalize report (for priority phase only)
      this.report.endTime = new Date().toISOString();
      this.report.duration = new Date(this.report.endTime).getTime() - 
                             new Date(this.report.startTime).getTime();
      this.report.creditsUsed = oddsApiClient.getMetrics();

      // Save report
      await redisCache.setCacheReport(this.report);

      logger.success('✅ Priority preload completed');
      logger.info(`📊 Total sports categories: ${this.groupedSports.length}`);
      logger.info(`📊 Priority leagues loaded: ${this.report.totalLeagues}`);
      logger.info(`📊 Priority matches loaded: ${this.report.totalMatches}`);
      logger.info(`⏱️  Priority phase duration: ${(this.report.duration / 1000).toFixed(2)}s`);

      return this.report;
    } catch (error) {
      logger.error('❌ Preload failed:', error);
      this.report.failures.push(`Global error: ${(error as Error).message}`);
      throw error;
    }
  }

  private async fetchAndGroupSports(): Promise<void> {
    try {
      logger.info('📡 Fetching all available sports from The Odds API...');
      
      // Fetch all sports from The Odds API (this is free, no quota cost)
      const allSports = await oddsApiClient.getSports();
      logger.info(`📥 Retrieved ${allSports.length} total sports from API`);
      
      // Group sports by category and apply league limits for API efficiency
      const grouped = groupSportsByCategory(allSports as ApiSport[]);
      this.groupedSports = applyLeagueLimits(grouped);
      
      logger.success(`✅ Grouped into ${this.groupedSports.length} sport categories (with limits applied):`);
      this.groupedSports.forEach(group => {
        logger.info(`  - ${group.title}: ${group.leagues.length} leagues (limited)`);
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
      logger.error('Failed to fetch and group sports:', error);
      this.report.failures.push(`Sports grouping: ${(error as Error).message}`);
      throw error;
    }
  }

  // Preload multiple leagues for a sport category, aggregating results
  private async preloadSportGroup(
    ourSportKey: string, 
    leagues: Array<{key: string, title: string}>,
    isBackground: boolean = false
  ): Promise<void> {
    if (!leagues || leagues.length === 0) return;

    try {
      // Fetch all leagues in parallel (with concurrency limit)
      const prematchResults = await Promise.all(
        leagues.map(league => 
          limit(() => this.fetchPrematchForLeague(league.key, ourSportKey))
        )
      );
      
      const liveResults = await Promise.all(
        leagues.map(league => 
          limit(() => this.fetchLiveForLeague(league.key, ourSportKey))
        )
      );

      // Aggregate prematch leagues (leagues already contain matches)
      const allPrematchLeagues: any[] = [];
      for (const result of prematchResults) {
        if (result && result.leagues.length > 0) {
          allPrematchLeagues.push(...result.leagues);
        }
      }

      // Aggregate live leagues (leagues already contain matches)
      const allLiveLeagues: any[] = [];
      for (const result of liveResults) {
        if (result && result.leagues.length > 0) {
          allLiveLeagues.push(...result.leagues);
        }
      }

      // Group and cache aggregated results
      await this.cacheAggregatedResults(
        ourSportKey,
        allPrematchLeagues,
        allLiveLeagues
      );

      // Calculate total matches from leagues
      const totalPrematchMatches = allPrematchLeagues.reduce((sum, lg) => sum + lg.match_count, 0);
      const totalLiveMatches = allLiveLeagues.reduce((sum, lg) => sum + lg.match_count, 0);

      if (!isBackground) {
        this.report.sports[ourSportKey] = {
          prematch: { 
            leagues: allPrematchLeagues.length, 
            matches: totalPrematchMatches, 
            success: true 
          },
          live: { 
            leagues: allLiveLeagues.length, 
            matches: totalLiveMatches, 
            success: true 
          },
        };
        this.report.totalLeagues += allPrematchLeagues.length;
        this.report.totalMatches += totalPrematchMatches;
      }

      logger.success(`  ✅ ${ourSportKey}: ${allPrematchLeagues.length} prematch leagues, ${allLiveLeagues.length} live leagues`);
    } catch (error) {
      logger.error(`  ❌ Failed to preload ${ourSportKey}:`, error);
      if (!isBackground) {
        this.report.failures.push(`${ourSportKey}: ${(error as Error).message}`);
      }
    }
  }

  private async preloadSport(sportKey: string, ourSportKey: string): Promise<void> {
    logger.info(`📥 Preloading ${ourSportKey} (${sportKey})...`);

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

  // Fetch prematch data for a single league (returns data without caching)
  private async fetchPrematchForLeague(sportKey: string, ourSportKey: string): Promise<{leagues: any[], matches: any[]} | null> {
    try {
      // Get sport-specific API configuration
      const apiConfig = getSportApiConfig(ourSportKey);
      
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: apiConfig.regions,
        markets: apiConfig.markets,
        oddsFormat: 'decimal',
        dateFormat: 'iso',
        sportCategory: ourSportKey,
      });

      if (events.length === 0) return { leagues: [], matches: [] };

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      return {
        leagues: nonEmptyLeagues,
        matches: normalizedMatches
      };
    } catch (error) {
      logger.error(`  ⚠️  Prematch failed for ${sportKey}:`, (error as Error).message);
      return null;
    }
  }

  // Fetch live data for a single league (returns data without caching)
  private async fetchLiveForLeague(sportKey: string, ourSportKey: string): Promise<{leagues: any[], matches: any[]} | null> {
    try {
      // Get sport-specific API configuration
      const apiConfig = getSportApiConfig(ourSportKey);
      
      const events = await oddsApiClient.getOdds(sportKey, {
        regions: apiConfig.regions,
        markets: apiConfig.markets,
        oddsFormat: 'decimal',
        dateFormat: 'iso',
        status: 'live',
        sportCategory: ourSportKey,
      });

      if (events.length === 0) return { leagues: [], matches: [] };

      const normalizedMatches = events.map(event => normalizeOddsEvent(event, ourSportKey, true));
      const leagueGroups = groupMatchesByLeague(normalizedMatches);
      const nonEmptyLeagues = leagueGroups.filter(lg => lg.match_count > 0);

      return {
        leagues: nonEmptyLeagues,
        matches: normalizedMatches
      };
    } catch (error) {
      logger.error(`  ⚠️  Live failed for ${sportKey}:`, (error as Error).message);
      return null;
    }
  }

  // Cache aggregated results for a sport (MERGE with existing instead of replacing)
  private async cacheAggregatedResults(
    ourSportKey: string,
    prematchLeagues: any[],
    liveLeagues: any[]
  ): Promise<void> {
    // Cache prematch leagues - MERGE with existing to prevent data loss
    if (prematchLeagues.length > 0) {
      // Get existing leagues first
      const existingPrematchLeagues = await redisCache.getPrematchLeagues(ourSportKey) || [];
      
      // Create a map of existing leagues by ID
      const leagueMap = new Map(existingPrematchLeagues.map(lg => [lg.league_id, lg]));
      
      // Add or update new leagues
      const leaguesForCache = prematchLeagues.map(lg => ({
        league_id: lg.league_id,
        league_name: lg.league_name,
        match_count: lg.match_count,
      }));
      
      // Merge: update existing leagues and add new ones
      leaguesForCache.forEach(lg => leagueMap.set(lg.league_id, lg));
      
      // Save merged leagues
      await redisCache.setPrematchLeagues(ourSportKey, Array.from(leagueMap.values()), 900);

      // Cache matches for each league (leagues already contain matches array)
      for (const league of prematchLeagues) {
        if (league.matches && league.matches.length > 0) {
          await redisCache.setPrematchMatches(
            ourSportKey,
            league.league_id,
            league.matches,
            600
          );

          // Prefetch markets
          for (const match of league.matches) {
            await this.prefetchMatchMarkets(match, false);
          }
        }
      }
    }

    // Cache live leagues - MERGE with existing to prevent data loss
    if (liveLeagues.length > 0) {
      // Get existing leagues first
      const existingLiveLeagues = await redisCache.getLiveLeagues(ourSportKey) || [];
      
      // Create a map of existing leagues by ID
      const leagueMap = new Map(existingLiveLeagues.map(lg => [lg.league_id, lg]));
      
      // Add or update new leagues
      const leaguesForCache = liveLeagues.map(lg => ({
        league_id: lg.league_id,
        league_name: lg.league_name,
        match_count: lg.match_count,
      }));
      
      // Merge: update existing leagues and add new ones
      leaguesForCache.forEach(lg => leagueMap.set(lg.league_id, lg));
      
      // Save merged leagues
      await redisCache.setLiveLeagues(ourSportKey, Array.from(leagueMap.values()), 90);

      // Cache matches for each league (leagues already contain matches array)
      for (const league of liveLeagues) {
        if (league.matches && league.matches.length > 0) {
          await redisCache.setLiveMatches(
            ourSportKey,
            league.league_id,
            league.matches,
            60
          );

          // Prefetch markets
          for (const match of league.matches) {
            await this.prefetchMatchMarkets(match, true);
          }
        }
      }
    }

    // Prefetch logos for football
    if (ourSportKey === 'football') {
      const allMatches = [
        ...prematchLeagues.flatMap(lg => lg.matches || []),
        ...liveLeagues.flatMap(lg => lg.matches || [])
      ];
      if (allMatches.length > 0) {
        await this.prefetchFootballLogos(allMatches);
      }
    }
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

      logger.success(`  ✅ Prematch: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`  ❌ Prematch failed for ${ourSportKey}:`, errorMsg);
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
        logger.info(`  ℹ️  No live matches for ${ourSportKey}`);
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

      logger.success(`  ✅ Live: ${nonEmptyLeagues.length} leagues, ${normalizedMatches.length} matches`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`  ❌ Live failed for ${ourSportKey}:`, errorMsg);
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
      logger.warn(`Failed to prefetch markets for match ${match.match_id}:`, error);
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
          logger.warn(`Failed to fetch logo for ${teamName}:`, error);
        }
      })
    );

    await Promise.all(logoPromises);
  }

  async validateCache(): Promise<void> {
    logger.info('🔍 Validating cache...');

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
      logger.warn(`⚠️  Found ${this.report.emptyLeagues.length} empty leagues`);
    } else {
      logger.success('✅ Cache validation passed - no empty leagues');
    }
  }
}

export const preloadWorker = new PreloadWorker();
