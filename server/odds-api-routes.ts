import { Express, Request, Response } from 'express';
import { redisCache } from './redis-cache';
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

      const sports = await redisCache.getSportsList() || [];
      const menuData = [];

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

      res.json({
        success: true,
        data: {
          mode,
          sports: menuData,
          total_sports: menuData.length,
          cache_ready: await redisCache.isCacheReady(),
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

      const matches = mode === 'live'
        ? await redisCache.getLiveMatches(sport, leagueId)
        : await redisCache.getPrematchMatches(sport, leagueId);

      if (!matches) {
        return res.json({
          success: true,
          data: {
            sport,
            league_id: leagueId,
            mode,
            matches: [],
            count: 0,
          },
        });
      }

      // Enrich matches with logos
      const enrichedMatches = await Promise.all(
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

      res.json({
        success: true,
        data: {
          sport,
          league_id: leagueId,
          league_name: matches[0]?.league_name || 'Unknown League',
          mode,
          matches: enrichedMatches,
          count: enrichedMatches.length,
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

      const markets = await redisCache.getMatchMarkets(matchId);

      if (!markets) {
        return res.status(404).json({
          success: false,
          error: 'Markets not found for this match',
        });
      }

      res.json({
        success: true,
        data: markets,
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

  // Cache status endpoint
  app.get('/api/status/cache', async (req: Request, res: Response) => {
    try {
      const cacheReady = await redisCache.isCacheReady();
      const report = await redisCache.getLatestCacheReport();
      const redisStats = await redisCache.getStats();
      const apiMetrics = oddsApiMetrics.getStats();

      res.json({
        success: true,
        data: {
          ready: cacheReady,
          last_report: report,
          redis_stats: redisStats,
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
