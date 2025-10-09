import { Express, Request, Response } from 'express';
import { redisCache } from './redis-cache';
import { memoryCache } from './memory-cache';
import { cacheMonitor } from './cache-monitor';
import { oddsApiClient, oddsApiMetrics } from './odds-api-client';
import { getSportIcon } from './match-utils';

export function registerOddsApiRoutes(app: Express): void {
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
        
        // Layer 3: API fallback if Redis is empty (cache miss or not ready)
        if (sports.length === 0) {
          cacheMonitor.recordMiss('redis');
          console.log('📡 Redis cache empty, falling back to API for sports list');
          
          try {
            sports = await oddsApiClient.getSports();
            cacheMonitor.recordHit('api');
            cacheSource = 'api';
            
            // Store sports in Redis for future requests
            if (sports.length > 0) {
              await redisCache.setSportsList(sports, 3600); // 1 hour TTL
            }
          } catch (apiError) {
            cacheMonitor.recordError('api');
            console.error('Failed to fetch sports from API:', apiError);
            // Return empty if API also fails
            sports = [];
          }
        } else {
          cacheMonitor.recordHit('redis');
          cacheSource = 'redis';
        }
        
        menuData = [];

        for (const sport of sports) {
          const leagues = mode === 'live'
            ? await redisCache.getLiveLeagues(sport.key)
            : await redisCache.getPrematchLeagues(sport.key);

          // Only include sports with leagues that have matches
          if (leagues && leagues.length > 0) {
            menuData.push({
              sport_key: sport.key,
              sport_title: sport.title,
              sport_icon: getSportIcon(sport.key),
              leagues: leagues.filter(l => l.match_count > 0),
              total_matches: leagues.reduce((sum, l) => sum + l.match_count, 0),
            });
          }
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
              matches = apiEvents.map(event => normalizeOddsEvent(event, sport));
              
              // Store in Redis for future requests
              if (mode === 'live') {
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

  // Get match markets
  app.get('/api/match/:matchId/markets', async (req: Request, res: Response) => {
    try {
      const { matchId } = req.params;
      const cacheKey = `markets:${matchId}`;
      
      // PROFESSIONAL MULTI-LAYER CACHING: Memory → Redis
      // Layer 1: Try memory cache first
      let markets = memoryCache.get<any>(cacheKey);
      let cacheSource = 'memory';
      
      if (!markets) {
        cacheMonitor.recordMiss('memory');
        
        // Layer 2: Try Redis cache
        markets = await redisCache.getMatchMarkets(matchId);
        cacheSource = 'redis';
        
        if (!markets) {
          cacheMonitor.recordMiss('redis');
          return res.status(404).json({
            success: false,
            error: 'Markets not found for this match',
          });
        }
        
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

  // Get match details
  app.get('/api/match/:matchId/details', async (req: Request, res: Response) => {
    try {
      const { matchId } = req.params;

      // Find the match in cache
      let matchData = null;
      
      const sports = await redisCache.getSportsList() || [];
      for (const sport of sports) {
        const prematchLeagues = await redisCache.getPrematchLeagues(sport.key) || [];
        const liveLeagues = await redisCache.getLiveLeagues(sport.key) || [];

        for (const league of [...prematchLeagues, ...liveLeagues]) {
          const matches = await redisCache.getPrematchMatches(sport.key, league.league_id) ||
                         await redisCache.getLiveMatches(sport.key, league.league_id) ||
                         [];
          
          const match = matches.find(m => m.match_id === matchId);
          if (match) {
            matchData = match;
            break;
          }
        }

        if (matchData) break;
      }

      if (!matchData) {
        return res.status(404).json({
          success: false,
          error: 'Match not found',
        });
      }

      // Get logos
      const homeLogo = await redisCache.getTeamLogo(matchData.sport_key, matchData.home_team);
      const awayLogo = await redisCache.getTeamLogo(matchData.sport_key, matchData.away_team);

      // Get markets
      const markets = await redisCache.getMatchMarkets(matchId);

      res.json({
        success: true,
        data: {
          ...matchData,
          home_team_logo: homeLogo?.logo || null,
          away_team_logo: awayLogo?.logo || null,
          markets: markets?.markets || [],
          last_update: markets?.last_update || new Date().toISOString(),
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

      res.json({
        success: true,
        data: {
          sport,
          mode,
          leagues: leagues.filter(l => l.match_count > 0),
          count: leagues.length,
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
