import { Express, Request, Response } from 'express';
import { redisCache } from './redis-cache';
import { memoryCache } from './memory-cache';
import { cacheMonitor } from './cache-monitor';
import { oddsApiClient, oddsApiMetrics } from './odds-api-client';
import { getSportIcon, FOOTBALL_LEAGUE_PRIORITY } from './match-utils';
import { unifiedMatchService } from './unified-match-service';
import { storage } from './storage';

export function registerOddsApiRoutes(app: Express): void {
  // NEW: Aggregated live matches endpoint - all live matches in one call (UNIFIED: API + Manual)
  app.get('/api/live/matches', async (req: Request, res: Response) => {
    try {
      const cacheKey = 'aggregated:live:all';
      
      // PROFESSIONAL MULTI-LAYER CACHING: Memory → Redis computation
      // Layer 1: Try memory cache first (ultra-fast)
      let aggregatedData = memoryCache.get<any>(cacheKey);
      let cacheSource = 'memory';
      
      if (!aggregatedData) {
        cacheMonitor.recordMiss('memory');
        
        // Layer 2: Get unified matches (API + Manual) from unified service
        const allLiveMatches = await unifiedMatchService.getAllLiveMatches();
        cacheMonitor.recordHit('redis');
        cacheSource = 'unified';
        
        // Group by sport and league
        const sportGroups: any[] = [];
        const sportMap = new Map<string, any>();
        
        for (const match of allLiveMatches) {
          // Ensure we only show truly live matches
          if (match.status !== 'live') continue;
          
          // Get or create sport group
          let sportGroup = sportMap.get(match.sport_key);
          if (!sportGroup) {
            sportGroup = {
              sport_key: match.sport_key,
              sport_title: match.sport_key.charAt(0).toUpperCase() + match.sport_key.slice(1),
              sport_icon: match.sport_icon,
              leagues: new Map<string, any>(),
            };
            sportMap.set(match.sport_key, sportGroup);
          }
          
          // Get or create league within sport
          let league = sportGroup.leagues.get(match.league_id);
          if (!league) {
            league = {
              league_id: match.league_id,
              league_name: match.league_name,
              matches: [],
            };
            sportGroup.leagues.set(match.league_id, league);
          }
          
          // Add match to league
          league.matches.push(match);
        }
        
        // Convert maps to arrays
        sportMap.forEach(sportGroup => {
          const leagues = Array.from(sportGroup.leagues.values());
          sportGroups.push({
            sport_key: sportGroup.sport_key,
            sport_title: sportGroup.sport_title,
            sport_icon: sportGroup.sport_icon,
            leagues,
            total_matches: leagues.reduce((sum, l: any) => sum + l.matches.length, 0),
          });
        });
        
        // Sort by priority
        sportGroups.sort((a, b) => {
          const priorityMap: Record<string, number> = {
            football: 1,
            basketball: 2,
            americanfootball: 3,
            baseball: 4,
            icehockey: 5,
            cricket: 6,
            mma: 7,
          };
          return (priorityMap[a.sport_key] || 99) - (priorityMap[b.sport_key] || 99);
        });
        
        aggregatedData = {
          sports: sportGroups,
          total_sports: sportGroups.length,
          total_matches: sportGroups.reduce((sum, s) => sum + s.total_matches, 0),
        };
        
        // Store in memory cache (5 second TTL for live data)
        if (aggregatedData.total_matches > 0) {
          memoryCache.set(cacheKey, aggregatedData, 5);
        }
      } else {
        cacheMonitor.recordHit('memory');
      }

      res.json({
        success: true,
        data: aggregatedData,
        cache_source: cacheSource,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching aggregated live matches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch live matches',
        details: (error as Error).message,
      });
    }
  });

  // Get menu (sports + leagues) based on mode
  app.get('/api/menu', async (req: Request, res: Response) => {
    try {
      const mode = (req.query.mode as string) || 'prematch';
      
      if (!['prematch', 'live'].includes(mode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid mode. Must be "prematch" or "live"',
        });
      }

      const cacheKey = `menu:${mode}`;
      
      // PROFESSIONAL MULTI-LAYER CACHING: Memory → Redis → Fallback
      // Layer 1: Try memory cache (microsecond-level performance)
      let menuData = memoryCache.get<any>(cacheKey);
      let cacheSource = 'memory';
      
      if (!menuData) {
        cacheMonitor.recordMiss('memory');
        
        // Layer 2: Try Redis cache (millisecond-level performance)
        let sports = await redisCache.getSportsList() || [];
        
        // Layer 3: Wait for preload if Redis is empty
        if (sports.length === 0) {
          cacheMonitor.recordMiss('redis');
          console.log('📡 Redis cache empty - waiting for preload to complete');
          
          // Don't overwrite the sports list - let preload worker handle it
          // Just return empty for now, preload will populate it soon
          sports = [];
          cacheSource = 'preload-pending';
        } else {
          cacheMonitor.recordHit('redis');
          cacheSource = 'redis';
        }
        
        menuData = [];

        // Get manual matches to include in menu
        const manualMatches = mode === 'live' 
          ? await storage.getLiveManualMatches()
          : await storage.getUpcomingManualMatches();

        // Build menu from API sports/leagues
        for (const sport of sports) {
          const leagues = mode === 'live'
            ? await redisCache.getLiveLeagues(sport.key)
            : await redisCache.getPrematchLeagues(sport.key);

          // Only include sports with leagues that have matches
          if (leagues && leagues.length > 0) {
            // Filter leagues with matches
            let filteredLeagues = leagues.filter(l => l.match_count > 0);
            
            // Sort football leagues by priority to ensure EPL and top leagues appear first
            if (sport.key === 'football') {
              filteredLeagues.sort((a, b) => {
                const priorityA = FOOTBALL_LEAGUE_PRIORITY[a.league_id] || 999;
                const priorityB = FOOTBALL_LEAGUE_PRIORITY[b.league_id] || 999;
                return priorityA - priorityB;
              });
            }
            
            menuData.push({
              sport_key: sport.key,
              sport_title: sport.title,
              sport_icon: getSportIcon(sport.key),
              leagues: filteredLeagues,
              total_matches: leagues.reduce((sum, l) => sum + l.match_count, 0),
            });
          }
        }

        // Add manual matches to menu
        for (const match of manualMatches) {
          const sportKey = match.sport || 'football';
          
          // Find or create sport in menu
          let sportGroup = menuData.find((s: any) => s.sport_key === sportKey);
          if (!sportGroup) {
            sportGroup = {
              sport_key: sportKey,
              sport_title: sportKey.charAt(0).toUpperCase() + sportKey.slice(1),
              sport_icon: getSportIcon(sportKey),
              leagues: [],
              total_matches: 0,
            };
            menuData.push(sportGroup);
          }
          
          // Find or create league in sport
          let league = sportGroup.leagues.find((l: any) => l.league_id === match.leagueId);
          if (!league) {
            league = {
              league_id: match.leagueId,
              league_name: match.leagueName,
              match_count: 0,
            };
            sportGroup.leagues.push(league);
          }
          
          // Increment match count
          league.match_count += 1;
          sportGroup.total_matches += 1;
        }
        
        // Store in memory cache for next request (5 second TTL for menu)
        if (menuData && menuData.length > 0) {
          memoryCache.set(cacheKey, menuData, mode === 'live' ? 5 : 30);
        }
      } else {
        cacheMonitor.recordHit('memory');
      }

      res.json({
        success: true,
        data: {
          mode,
          sports: menuData,
          total_sports: menuData.length,
          cache_ready: await redisCache.isCacheReady(),
          cache_source: cacheSource, // Helps track cache efficiency
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching menu:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch menu',
        details: (error as Error).message,
      });
    }
  });

  // Get line (matches) for a specific sport/league
  app.get('/api/line/:sport/:leagueId', async (req: Request, res: Response) => {
    try {
      const { sport, leagueId } = req.params;
      const mode = (req.query.mode as string) || 'prematch';

      if (!['prematch', 'live'].includes(mode)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid mode. Must be "prematch" or "live"',
        });
      }

      const cacheKey = `line:${sport}:${leagueId}:${mode}`;
      
      // PROFESSIONAL MULTI-LAYER CACHING: Memory → Redis
      // Layer 1: Try memory cache first
      let enrichedMatches = memoryCache.get<any[]>(cacheKey);
      let cacheSource = 'memory';
      
      if (!enrichedMatches) {
        cacheMonitor.recordMiss('memory');
        
        // Layer 2: Try Redis cache
        let matches = mode === 'live'
          ? await redisCache.getLiveMatches(sport, leagueId)
          : await redisCache.getPrematchMatches(sport, leagueId);

        // Layer 3: API fallback if Redis miss
        if (!matches || matches.length === 0) {
          cacheMonitor.recordMiss('redis');
          console.log(`📡 Redis cache miss for ${sport}/${leagueId}, falling back to API`);
          
          try {
            // Call API to get fresh odds for this sport
            const apiEvents = await oddsApiClient.getOdds(leagueId, {
              regions: 'uk,eu,us',
              markets: 'h2h,spreads,totals',
              oddsFormat: 'decimal',
              dateFormat: 'iso',
              ...(mode === 'live' ? { status: 'live' } : {}),
            });
            
            cacheMonitor.recordHit('api');
            cacheSource = 'api';
            
            if (apiEvents.length > 0) {
              // Normalize and store in Redis
              const { normalizeOddsEvent, groupMatchesByLeague } = await import('./match-utils');
              const isLive = mode === 'live';
              matches = apiEvents.map(event => normalizeOddsEvent(event, sport, isLive));
              
              // Store in Redis for future requests
              if (isLive) {
                await redisCache.setLiveMatches(sport, leagueId, matches, 60);
              } else {
                await redisCache.setPrematchMatches(sport, leagueId, matches, 600);
              }
            } else {
              matches = [];
            }
          } catch (apiError) {
            cacheMonitor.recordError('api');
            console.error(`Failed to fetch ${leagueId} from API:`, apiError);
            matches = [];
          }
        } else {
          cacheMonitor.recordHit('redis');
          cacheSource = 'redis';
        }

        // Get manual matches for this sport/league
        const allManualMatches = mode === 'live'
          ? await storage.getLiveManualMatches()
          : await storage.getUpcomingManualMatches();
        
        const manualMatchesForLeague = allManualMatches.filter(
          (m: any) => m.sport === sport && m.leagueId === leagueId
        );

        // Transform manual matches to match API format
        const transformedManual = manualMatchesForLeague.map((match: any) => ({
          match_id: match.id,
          sport_key: sport,
          sport_title: sport.charAt(0).toUpperCase() + sport.slice(1),
          commence_time: match.kickoffTime,
          home_team: match.homeTeamName,
          away_team: match.awayTeamName,
          league_id: match.leagueId,
          league_name: match.leagueName,
          status: match.status,
          home_score: match.homeScore || 0,
          away_score: match.awayScore || 0,
          bookmakers: match.markets?.map((market: any) => ({
            key: 'manual',
            title: 'Manual',
            markets: [{
              key: market.key,
              outcomes: market.outcomes?.map((outcome: any) => ({
                name: outcome.label,
                price: parseFloat(outcome.odds) || 1.01
              })) || []
            }]
          })) || [],
          is_manual: true,
          source: 'manual'
        }));

        // Merge API and manual matches
        matches = [...(matches || []), ...transformedManual];

        if (!matches || matches.length === 0) {
          return res.json({
            success: true,
            data: {
              sport,
              league_id: leagueId,
              mode,
              matches: [],
              count: 0,
              cache_source: cacheSource || 'none',
            },
          });
        }

        // Enrich matches with logos
        enrichedMatches = await Promise.all(
          matches.map(async (match) => {
            const homeLogo = await redisCache.getTeamLogo(sport, match.home_team);
            const awayLogo = await redisCache.getTeamLogo(sport, match.away_team);

            return {
              ...match,
              home_team_logo: homeLogo?.logo || null,
              away_team_logo: awayLogo?.logo || null,
            };
          })
        );
        
        // Store in memory cache (3 seconds for live, 15 seconds for prematch)
        memoryCache.set(cacheKey, enrichedMatches, mode === 'live' ? 3 : 15);
      } else {
        cacheMonitor.recordHit('memory');
      }

      res.json({
        success: true,
        data: {
          sport,
          league_id: leagueId,
          league_name: enrichedMatches[0]?.league_name || 'Unknown League',
          mode,
          matches: enrichedMatches,
          count: enrichedMatches.length,
          cache_source: cacheSource,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching line:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch line',
        details: (error as Error).message,
      });
    }
  });

  // Get match markets (UNIFIED: supports both API and manual matches)
  app.get('/api/match/:matchId/markets', async (req: Request, res: Response) => {
    try {
      const { matchId } = req.params;
      const cacheKey = `markets:${matchId}`;
      
      // PROFESSIONAL MULTI-LAYER CACHING: Memory → Unified Service
      // Layer 1: Try memory cache first
      let markets = memoryCache.get<any>(cacheKey);
      let cacheSource = 'memory';
      
      if (!markets) {
        cacheMonitor.recordMiss('memory');
        
        // Layer 2: Use unified match service (handles both API and manual matches)
        const marketsArray = await unifiedMatchService.getMatchMarkets(matchId);
        cacheSource = 'unified';
        
        if (!marketsArray || marketsArray.length === 0) {
          cacheMonitor.recordMiss('redis');
          return res.status(404).json({
            success: false,
            error: 'Markets not found for this match',
          });
        }
        
        // Format markets response
        markets = {
          markets: marketsArray,
          last_update: new Date().toISOString()
        };
        
        cacheMonitor.recordHit('redis');
        // Store in memory cache (2 seconds for fast re-access)
        memoryCache.set(cacheKey, markets, 2);
      } else {
        cacheMonitor.recordHit('memory');
      }

      res.json({
        success: true,
        data: {
          ...markets,
          cache_source: cacheSource,
        },
      });
    } catch (error) {
      console.error('Error fetching match markets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch match markets',
        details: (error as Error).message,
      });
    }
  });

  // Get match details (UNIFIED: supports both API and manual matches)
  app.get('/api/match/:matchId/details', async (req: Request, res: Response) => {
    try {
      const { matchId } = req.params;

      // Use unified match service to get match (works for both API and manual matches)
      const matchData = await unifiedMatchService.getMatchById(matchId);

      if (!matchData) {
        return res.status(404).json({
          success: false,
          error: 'Match not found',
        });
      }

      // Get logos (only for API matches, manual matches don't have logos yet)
      let homeLogo = null;
      let awayLogo = null;
      
      if (matchData.source === 'api') {
        const homeLogoData = await redisCache.getTeamLogo(matchData.sport_key, matchData.home_team);
        const awayLogoData = await redisCache.getTeamLogo(matchData.sport_key, matchData.away_team);
        homeLogo = homeLogoData?.logo || null;
        awayLogo = awayLogoData?.logo || null;
      }

      // Get markets using unified service
      const marketsArray = await unifiedMatchService.getMatchMarkets(matchId);

      res.json({
        success: true,
        data: {
          ...matchData,
          home_team_logo: homeLogo,
          away_team_logo: awayLogo,
          markets: marketsArray || [],
          last_update: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching match details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch match details',
        details: (error as Error).message,
      });
    }
  });

  // Get all markets for localStorage caching
  app.get('/api/markets/all', async (req: Request, res: Response) => {
    try {
      const allMarkets: any[] = [];
      
      // Get all sports
      const sports = await redisCache.getSportsList() || [];
      
      for (const sport of sports) {
        // Get both prematch and live leagues
        const prematchLeagues = await redisCache.getPrematchLeagues(sport.key) || [];
        const liveLeagues = await redisCache.getLiveLeagues(sport.key) || [];
        
        for (const league of [...prematchLeagues, ...liveLeagues]) {
          // Get matches from both prematch and live
          const prematchMatches = await redisCache.getPrematchMatches(sport.key, league.league_id) || [];
          const liveMatches = await redisCache.getLiveMatches(sport.key, league.league_id) || [];
          
          const allLeagueMatches = [...prematchMatches, ...liveMatches];
          
          for (const match of allLeagueMatches) {
            // Get markets for this match
            const marketsData = await redisCache.getMatchMarkets(match.match_id);
            
            if (marketsData && marketsData.markets && marketsData.markets.length > 0) {
              allMarkets.push({
                matchId: match.match_id,
                homeTeam: match.home_team,
                awayTeam: match.away_team,
                league: match.league_name,
                sport: match.sport_key,
                status: match.status,
                kickoffTime: match.commence_time,
                markets: marketsData.markets,
                lastUpdate: marketsData.last_update || new Date().toISOString(),
              });
            }
          }
        }
      }

      res.json({
        success: true,
        data: {
          markets: allMarkets,
          count: allMarkets.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching all markets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch all markets',
        details: (error as Error).message,
      });
    }
  });

  // Cache status endpoint - includes multi-layer cache statistics
  app.get('/api/status/cache', async (req: Request, res: Response) => {
    try {
      const cacheReady = await redisCache.isCacheReady();
      const report = await redisCache.getLatestCacheReport();
      const redisStats = await redisCache.getStats();
      const memoryStats = memoryCache.getStats();
      const monitorStats = cacheMonitor.getStats();
      const apiMetrics = oddsApiMetrics.getStats();

      res.json({
        success: true,
        data: {
          ready: cacheReady,
          last_report: report,
          // Multi-layer cache stats
          cache_layers: {
            memory: {
              ...memoryStats,
              description: 'In-memory cache for ultra-fast reads (microsecond-level)',
            },
            redis: {
              ...redisStats,
              description: 'Redis cache for shared state (millisecond-level)',
            },
          },
          // Performance monitoring
          performance: {
            ...monitorStats,
            summary: cacheMonitor.getSummary(),
          },
          api_metrics: apiMetrics,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching cache status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch cache status',
        details: (error as Error).message,
      });
    }
  });

  // Trigger manual preload (admin only - should add auth)
  app.post('/api/admin/preload', async (req: Request, res: Response) => {
    try {
      const { preloadWorker } = await import('./preload-worker');
      
      // Run preload in background
      preloadWorker.preloadAll()
        .then(report => {
          console.log('Manual preload completed:', report);
        })
        .catch(error => {
          console.error('Manual preload failed:', error);
        });

      res.json({
        success: true,
        message: 'Preload started in background',
      });
    } catch (error) {
      console.error('Error starting preload:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start preload',
        details: (error as Error).message,
      });
    }
  });

  // Get all sports with match counts
  app.get('/api/sports', async (req: Request, res: Response) => {
    try {
      const mode = (req.query.mode as string) || 'prematch';
      const sports = await redisCache.getSportsList() || [];
      
      const sportsWithCounts = await Promise.all(
        sports.map(async (sport) => {
          const leagues = mode === 'live'
            ? await redisCache.getLiveLeagues(sport.key) || []
            : await redisCache.getPrematchLeagues(sport.key) || [];

          const totalMatches = leagues.reduce((sum, l) => sum + l.match_count, 0);

          return {
            key: sport.key,
            title: sport.title,
            icon: getSportIcon(sport.key),
            leagues_count: leagues.length,
            matches_count: totalMatches,
          };
        })
      );

      const filtered = sportsWithCounts.filter(s => s.matches_count > 0);

      res.json({
        success: true,
        data: {
          sports: filtered,
          mode,
          total: filtered.length,
        },
      });
    } catch (error) {
      console.error('Error fetching sports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch sports',
        details: (error as Error).message,
      });
    }
  });

  // Get leagues for a specific sport
  app.get('/api/sports/:sport/leagues', async (req: Request, res: Response) => {
    try {
      const { sport } = req.params;
      const mode = (req.query.mode as string) || 'prematch';

      const leagues = mode === 'live'
        ? await redisCache.getLiveLeagues(sport) || []
        : await redisCache.getPrematchLeagues(sport) || [];

      // Filter leagues with matches
      let filteredLeagues = leagues.filter(l => l.match_count > 0);
      
      // Sort football leagues by priority to ensure EPL and top leagues appear first
      if (sport === 'football') {
        filteredLeagues.sort((a, b) => {
          const priorityA = FOOTBALL_LEAGUE_PRIORITY[a.league_id] || 999;
          const priorityB = FOOTBALL_LEAGUE_PRIORITY[b.league_id] || 999;
          return priorityA - priorityB;
        });
      }

      res.json({
        success: true,
        data: {
          sport,
          mode,
          leagues: filteredLeagues,
          count: filteredLeagues.length,
        },
      });
    } catch (error) {
      console.error('Error fetching leagues:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch leagues',
        details: (error as Error).message,
      });
    }
  });
}
