/**
 * Market Sync Worker
 * 
 * Background worker that periodically syncs markets from The Odds API
 * and persists them to the database to ensure they're always available
 */

import { marketSyncService } from './market-sync-service';
import { redisCache } from './redis-cache';
import { storage } from './storage';

class MarketSyncWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the worker
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Market sync worker already running');
      return;
    }

    console.log('🚀 Starting market sync worker...');
    this.isRunning = true;

    // Run immediately on start
    this.syncAllMarkets();

    // Then run every 2 minutes
    this.intervalId = setInterval(() => {
      this.syncAllMarkets();
    }, 2 * 60 * 1000); // 2 minutes

    console.log('✅ Market sync worker started (runs every 2 minutes)');
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Market sync worker stopped');
  }

  /**
   * Sync markets for all active matches
   */
  private async syncAllMarkets(): Promise<void> {
    try {
      console.log('🔄 Starting market sync cycle...');

      // Get all sports from cache
      const sports = await redisCache.getSportsList() || [];

      const matchesToSync: Array<{
        matchId: string;
        externalId: string;
        sportKey: string;
        sportCategory: string;
      }> = [];

      // Collect matches from all leagues
      for (const sport of sports) {
        // Get both live and prematch leagues
        const liveLeagues = await redisCache.getLiveLeagues(sport.key) || [];
        const prematchLeagues = await redisCache.getPrematchLeagues(sport.key) || [];

        // Process live matches first (they need more frequent updates)
        for (const league of liveLeagues) {
          const matches = await redisCache.getLiveMatches(sport.key, league.league_id) || [];
          
          for (const match of matches) {
            // Only sync if we have an external ID (API matches)
            if (match.id || match.match_id) {
              matchesToSync.push({
                matchId: match.match_id || match.id,
                externalId: match.id || match.match_id, // The Odds API ID
                sportKey: sport.key,
                sportCategory: this.getSportCategory(sport.group || sport.key),
              });
            }
          }
        }

        // Process prematch matches (limit to matches starting within 24 hours)
        for (const league of prematchLeagues) {
          const matches = await redisCache.getPrematchMatches(sport.key, league.league_id) || [];
          
          const now = Date.now();
          const twentyFourHours = 24 * 60 * 60 * 1000;

          for (const match of matches) {
            const commenceTime = new Date(match.commence_time).getTime();
            
            // Only sync matches starting within 24 hours
            if (commenceTime - now <= twentyFourHours && (match.id || match.match_id)) {
              matchesToSync.push({
                matchId: match.match_id || match.id,
                externalId: match.id || match.match_id,
                sportKey: sport.key,
                sportCategory: this.getSportCategory(sport.group || sport.key),
              });
            }
          }
        }
      }

      console.log(`📊 Found ${matchesToSync.length} matches to sync`);

      if (matchesToSync.length > 0) {
        // Batch sync markets (5 at a time to avoid overwhelming the API)
        await marketSyncService.batchSyncMarkets(matchesToSync);
      }

      console.log('✅ Market sync cycle complete');
    } catch (error) {
      console.error('❌ Error in market sync cycle:', error);
      // Don't throw - keep worker running
    }
  }

  /**
   * Map API sport group to our internal category
   */
  private getSportCategory(sportGroup: string): string {
    const mapping: Record<string, string> = {
      'Soccer': 'football',
      'Basketball': 'basketball',
      'American Football': 'americanfootball',
      'Baseball': 'baseball',
      'Ice Hockey': 'icehockey',
      'Cricket': 'cricket',
      'Mixed Martial Arts': 'mma',
    };

    return mapping[sportGroup] || sportGroup.toLowerCase().replace(/\s+/g, '');
  }

  /**
   * Sync markets for a specific match
   */
  async syncMatch(
    matchId: string,
    externalId: string,
    sportKey: string,
    sportCategory: string
  ): Promise<void> {
    try {
      await marketSyncService.syncMarketsForMatch(matchId, externalId, sportKey, sportCategory);
    } catch (error) {
      console.error(`Error syncing match ${matchId}:`, error);
      throw error;
    }
  }
}

export const marketSyncWorker = new MarketSyncWorker();
