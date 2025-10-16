/**
 * Ably Aggregator Worker
 * 
 * Architecture: The Odds API + Manual DB → Aggregator → Redis (canonical state) → Ably Channels → Clients
 * 
 * This worker:
 * 1. Continuously refreshes data from The Odds API (fetches when Redis is empty/stale)
 * 2. Fetches manual matches from Supabase
 * 3. Computes minimal diffs vs previous state in Redis
 * 4. Writes new canonical snapshots to Redis (fixture:<id>)
 * 5. Publishes tiny delta patches to Ably channels
 * 
 * CRITICAL FIX: Unlike old version that only read from Redis, this now actively refetches
 * from The Odds API when cache expires, preventing data loss after 60-90s
 */

import Ably from 'ably';
import { redisCache } from '../server/redis-cache';
import { oddsApiClient } from '../server/odds-api-client';
import { storage } from '../server/storage';
import { unifiedMatchService, UnifiedMatch } from '../server/unified-match-service';
import { logger } from '../server/logger';
import pLimit from 'p-limit';
import {
  groupSportsByCategory,
  normalizeOddsEvent,
  groupMatchesByLeague,
  normalizeMarkets,
  GroupedSport,
} from '../server/match-utils';

const ABLY_API_KEY = process.env.ABLY_API_KEY;
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '6');
const limit = pLimit(CONCURRENCY_LIMIT);

if (!ABLY_API_KEY) {
  throw new Error('ABLY_API_KEY environment variable is required');
}

// Ably client for publishing
const ably = new Ably.Rest({ key: ABLY_API_KEY });

// Polling intervals
const POLL_INTERVALS = {
  live: 5000,        // 5 seconds for live matches (high priority)
  prematch: 60000,   // 60 seconds for upcoming matches
  manual: 10000,     // 10 seconds for manual matches
};

// Batching configuration
const BATCH_CONFIG = {
  windowMs: 300,     // 300ms batching window
  maxBatchSize: 50,  // Max changes per batch
};

interface MatchDiff {
  fixture_id: string;
  sport_key: string;
  changes: Array<{
    path: string;
    value: any;
    oldValue?: any;
  }>;
  timestamp: number;
}

interface AggregatorMetrics {
  totalPolls: number;
  totalDiffsDetected: number;
  totalMessagesPublished: number;
  averageMessageSize: number;
  lastPollTime: Date | null;
  publishLatency: number[];
  redisLatency: number[];
}

export class AblyAggregator {
  private running: boolean = false;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private batchQueue: Map<string, MatchDiff[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private groupedSports: GroupedSport[] = [];
  private metrics: AggregatorMetrics = {
    totalPolls: 0,
    totalDiffsDetected: 0,
    totalMessagesPublished: 0,
    averageMessageSize: 0,
    lastPollTime: null,
    publishLatency: [],
    redisLatency: [],
  };

  async start(): Promise<void> {
    if (this.running) {
      logger.info('Ably aggregator already running');
      return;
    }

    logger.info('🚀 Starting Ably Aggregator Worker...');
    this.running = true;

    // Wait for Redis to be ready
    let attempts = 0;
    while (!(await redisCache.isCacheReady()) && attempts < 30) {
      logger.info('Waiting for Redis to be ready...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!await redisCache.isCacheReady()) {
      logger.error('Redis not ready after 60 seconds, starting anyway');
    }

    // Fetch and group all available sports from The Odds API
    await this.fetchAndGroupSports();

    // Start polling loops with API refresh capability
    this.startLivePolling();
    this.startPrematchPolling();
    this.startManualPolling();

    logger.success('✅ Ably Aggregator started with continuous API refresh');
    logger.info('📡 Publishing to Ably channels: sports:football, sports:basketball, etc.');
  }

  /**
   * Fetch all available sports from The Odds API and group by category
   */
  private async fetchAndGroupSports(): Promise<void> {
    try {
      const apiSports = await oddsApiClient.getSports();
      this.groupedSports = groupSportsByCategory(apiSports);
      logger.info(`📋 Loaded ${this.groupedSports.length} sport categories with ${apiSports.length} total leagues`);
    } catch (error) {
      logger.error('Failed to fetch sports list:', error);
      this.groupedSports = [];
    }
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping Ably Aggregator...');
    this.running = false;

    // Clear all intervals
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();

    // Flush remaining batches
    for (const [channel] of Array.from(this.batchQueue.entries())) {
      await this.flushBatch(channel);
    }

    logger.success('✅ Ably Aggregator stopped');
  }

  /**
   * Start polling live matches from The Odds API
   */
  private startLivePolling(): void {
    const interval = setInterval(async () => {
      await this.pollAndProcessLive();
    }, POLL_INTERVALS.live);

    this.intervals.set('live', interval);
    
    // Run immediately
    this.pollAndProcessLive().catch(logger.error);
  }

  /**
   * Start polling prematch (upcoming) data
   */
  private startPrematchPolling(): void {
    const interval = setInterval(async () => {
      await this.pollAndProcessPrematch();
    }, POLL_INTERVALS.prematch);

    this.intervals.set('prematch', interval);
    
    // Run immediately
    this.pollAndProcessPrematch().catch(logger.error);
  }

  /**
   * Start polling manual matches from database
   */
  private startManualPolling(): void {
    const interval = setInterval(async () => {
      await this.pollAndProcessManual();
    }, POLL_INTERVALS.manual);

    this.intervals.set('manual', interval);
    
    // Run immediately
    this.pollAndProcessManual().catch(logger.error);
  }

  /**
   * Poll and process live matches
   * CRITICAL: Refetches from The Odds API when Redis is empty (prevents data loss)
   */
  private async pollAndProcessLive(): Promise<void> {
    try {
      this.metrics.totalPolls++;
      this.metrics.lastPollTime = new Date();

      const startTime = Date.now();
      
      // Step 1: Check if Redis has live data
      const cachedMatches = await unifiedMatchService.getAllLiveMatches();
      
      // Step 2: If Redis is empty or stale, refetch from The Odds API
      if (!cachedMatches || cachedMatches.length === 0) {
        logger.warn('[AGGREGATOR-LIVE] Redis cache empty - refetching from The Odds API');
        await this.refreshLiveDataFromApi();
        
        // Get refreshed data from Redis
        const refreshedMatches = await unifiedMatchService.getAllLiveMatches();
        logger.info(`[AGGREGATOR-LIVE] API refresh complete: ${refreshedMatches.length} matches`);
        
        // Process refreshed matches
        await Promise.all(
          refreshedMatches.map(match => limit(() => this.processMatchUpdate(match)))
        );
      } else {
        // Process cached matches
        logger.info(`[AGGREGATOR-LIVE] Using cached data: ${cachedMatches.length} matches`);
        await Promise.all(
          cachedMatches.map(match => limit(() => this.processMatchUpdate(match)))
        );
      }
      
      this.metrics.redisLatency.push(Date.now() - startTime);
      if (this.metrics.redisLatency.length > 100) {
        this.metrics.redisLatency.shift();
      }
      
    } catch (error) {
      logger.error('Error polling live matches:', error);
    }
  }

  /**
   * Refresh live data from The Odds API and persist to Redis
   * NOTE: The Odds API returns BOTH live and upcoming matches.
   * We filter CLIENT-SIDE based on commence_time and store in correct Redis keys.
   * GRACEFUL DEGRADATION: If API fails, keeps existing data by extending TTLs
   */
  private async refreshLiveDataFromApi(): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    for (const sportGroup of this.groupedSports) {
      for (const league of sportGroup.leagues) {
        try {
          // Fetch ALL matches (both live and upcoming) from The Odds API
          const events = await oddsApiClient.getOdds(league.key, {
            regions: 'uk,eu,us',
            markets: 'h2h,spreads,totals',
            oddsFormat: 'decimal',
            dateFormat: 'iso',
          });

          if (events.length === 0) continue;

          // Filter CLIENT-SIDE: commence_time < now = LIVE
          const now = Date.now();
          const liveEvents = events.filter(event => {
            const commenceTime = new Date(event.commence_time).getTime();
            return commenceTime < now;
          });

          if (liveEvents.length === 0) continue;

          // Normalize and group by league
          const normalizedMatches = liveEvents.map(event => normalizeOddsEvent(event, sportGroup.ourKey));
          const leagueGroups = groupMatchesByLeague(normalizedMatches);

          // Persist to Redis with TTLs (setLiveMatches also caches individual matches)
          for (const leagueGroup of leagueGroups) {
            // Cache league metadata
            const existingLeagues = await redisCache.getLiveLeagues(sportGroup.ourKey) || [];
            const leagueMap = new Map(existingLeagues.map(lg => [lg.league_id, lg]));
            leagueMap.set(leagueGroup.league_id, {
              league_id: leagueGroup.league_id,
              league_name: leagueGroup.league_name,
              match_count: leagueGroup.match_count,
            });
            await redisCache.setLiveLeagues(sportGroup.ourKey, Array.from(leagueMap.values()), 90);

            // Cache matches (this also caches individual match:{matchId} entries automatically)
            await redisCache.setLiveMatches(
              sportGroup.ourKey,
              leagueGroup.league_id,
              leagueGroup.matches,
              60 // 60s TTL
            );

            // Cache markets for each match
            for (const match of leagueGroup.matches) {
              const markets = normalizeMarkets(match.bookmakers || []);
              await redisCache.setMatchMarkets(match.match_id, {
                match_id: match.match_id,
                markets,
                last_update: new Date().toISOString(),
              }, 120);
            }
          }

          successCount++;
          logger.info(`[API-REFRESH-LIVE] ${sportGroup.ourKey}/${league.key}: ${liveEvents.length} live of ${events.length} total`);
        } catch (error) {
          failCount++;
          logger.error(`[API-REFRESH-LIVE] Failed ${sportGroup.ourKey}/${league.key}:`, error);
          
          // GRACEFUL DEGRADATION: Extend TTL of existing data instead of letting it expire
          try {
            const existingMatches = await redisCache.getLiveMatches(sportGroup.ourKey, league.key);
            if (existingMatches && existingMatches.length > 0) {
              logger.warn(`[API-REFRESH-LIVE] Extending TTL for ${existingMatches.length} existing matches in ${sportGroup.ourKey}/${league.key}`);
              await redisCache.setLiveMatches(sportGroup.ourKey, league.key, existingMatches, 90); // Extended TTL
            }
          } catch (extendError) {
            logger.error('[API-REFRESH-LIVE] Failed to extend TTL:', extendError);
          }
        }
      }
    }

    logger.info(`[API-REFRESH-LIVE] Complete: ${successCount} success, ${failCount} failed`);
  }

  /**
   * Poll and process prematch (upcoming) matches
   * CRITICAL: Refetches from The Odds API when Redis is empty (prevents data loss)
   */
  private async pollAndProcessPrematch(): Promise<void> {
    try {
      this.metrics.totalPolls++;

      const startTime = Date.now();
      
      // Step 1: Check if Redis has prematch data
      const cachedMatches = await unifiedMatchService.getAllUpcomingMatches(100);
      
      // Step 2: If Redis is empty or stale, refetch from The Odds API
      if (!cachedMatches || cachedMatches.length === 0) {
        logger.warn('[AGGREGATOR-PREMATCH] Redis cache empty - refetching from The Odds API');
        await this.refreshPrematchDataFromApi();
        
        // Get refreshed data from Redis
        const refreshedMatches = await unifiedMatchService.getAllUpcomingMatches(100);
        logger.info(`[AGGREGATOR-PREMATCH] API refresh complete: ${refreshedMatches.length} matches`);
        
        // Process refreshed matches
        await Promise.all(
          refreshedMatches.map(match => limit(() => this.processMatchUpdate(match)))
        );
      } else {
        // Process cached matches
        logger.info(`[AGGREGATOR-PREMATCH] Using cached data: ${cachedMatches.length} matches`);
        await Promise.all(
          cachedMatches.map(match => limit(() => this.processMatchUpdate(match)))
        );
      }
      
      this.metrics.redisLatency.push(Date.now() - startTime);
      if (this.metrics.redisLatency.length > 100) {
        this.metrics.redisLatency.shift();
      }
      
    } catch (error) {
      logger.error('Error polling prematch matches:', error);
    }
  }

  /**
   * Refresh prematch data from The Odds API and persist to Redis
   * NOTE: The Odds API returns BOTH live and upcoming matches.
   * We filter CLIENT-SIDE based on commence_time and store in correct Redis keys.
   * GRACEFUL DEGRADATION: If API fails, keeps existing data by extending TTLs
   */
  private async refreshPrematchDataFromApi(): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    for (const sportGroup of this.groupedSports) {
      for (const league of sportGroup.leagues) {
        try {
          // Fetch ALL matches (both live and upcoming) from The Odds API
          const events = await oddsApiClient.getOdds(league.key, {
            regions: 'uk,eu,us',
            markets: 'h2h,spreads,totals',
            oddsFormat: 'decimal',
            dateFormat: 'iso',
          });

          if (events.length === 0) continue;

          // Filter CLIENT-SIDE: commence_time >= now = UPCOMING
          const now = Date.now();
          const upcomingEvents = events.filter(event => {
            const commenceTime = new Date(event.commence_time).getTime();
            return commenceTime >= now;
          });

          if (upcomingEvents.length === 0) continue;

          // Normalize and group by league
          const normalizedMatches = upcomingEvents.map(event => normalizeOddsEvent(event, sportGroup.ourKey));
          const leagueGroups = groupMatchesByLeague(normalizedMatches);

          // Persist to Redis with TTLs (setPrematchMatches also caches individual matches)
          for (const leagueGroup of leagueGroups) {
            // Cache league metadata
            const existingLeagues = await redisCache.getPrematchLeagues(sportGroup.ourKey) || [];
            const leagueMap = new Map(existingLeagues.map(lg => [lg.league_id, lg]));
            leagueMap.set(leagueGroup.league_id, {
              league_id: leagueGroup.league_id,
              league_name: leagueGroup.league_name,
              match_count: leagueGroup.match_count,
            });
            await redisCache.setPrematchLeagues(sportGroup.ourKey, Array.from(leagueMap.values()), 900);

            // Cache matches (this also caches individual match:{matchId} entries automatically)
            await redisCache.setPrematchMatches(
              sportGroup.ourKey,
              leagueGroup.league_id,
              leagueGroup.matches,
              600 // 10 min TTL
            );

            // Cache markets for each match
            for (const match of leagueGroup.matches) {
              const markets = normalizeMarkets(match.bookmakers || []);
              await redisCache.setMatchMarkets(match.match_id, {
                match_id: match.match_id,
                markets,
                last_update: new Date().toISOString(),
              }, 300);
            }
          }

          successCount++;
          logger.info(`[API-REFRESH-PREMATCH] ${sportGroup.ourKey}/${league.key}: ${upcomingEvents.length} upcoming of ${events.length} total`);
        } catch (error) {
          failCount++;
          logger.error(`[API-REFRESH-PREMATCH] Failed ${sportGroup.ourKey}/${league.key}:`, error);
          
          // GRACEFUL DEGRADATION: Extend TTL of existing data instead of letting it expire
          try {
            const existingMatches = await redisCache.getPrematchMatches(sportGroup.ourKey, league.key);
            if (existingMatches && existingMatches.length > 0) {
              logger.warn(`[API-REFRESH-PREMATCH] Extending TTL for ${existingMatches.length} existing matches in ${sportGroup.ourKey}/${league.key}`);
              await redisCache.setPrematchMatches(sportGroup.ourKey, league.key, existingMatches, 900); // Extended TTL
            }
          } catch (extendError) {
            logger.error('[API-REFRESH-PREMATCH] Failed to extend TTL:', extendError);
          }
        }
      }
    }

    logger.info(`[API-REFRESH-PREMATCH] Complete: ${successCount} success, ${failCount} failed`);
  }

  /**
   * Poll and process manual matches specifically
   */
  private async pollAndProcessManual(): Promise<void> {
    try {
      // Get all manual matches (live + upcoming)
      const liveManual = await storage.getLiveManualMatches();
      const upcomingManual = await storage.getUpcomingManualMatches(50);
      
      const allManual = [...liveManual, ...upcomingManual];
      
      logger.info(`[AGGREGATOR] Manual fetch complete: ${allManual.length} matches (${liveManual.length} live, ${upcomingManual.length} upcoming)`);
      
      // Transform and process
      for (const dbMatch of allManual) {
        const unified = await this.transformManualMatch(dbMatch);
        await this.processMatchUpdate(unified);
      }
      
    } catch (error) {
      logger.error('Error polling manual matches:', error);
    }
  }

  /**
   * Process a match update: compute diff and publish to Ably
   */
  private async processMatchUpdate(currentMatch: UnifiedMatch): Promise<void> {
    try {
      const fixtureKey = `fixture:${currentMatch.match_id}`;
      
      // Get previous state from Redis
      const prevMatch = await redisCache.get<UnifiedMatch>(fixtureKey);
      
      // Compute diff
      const diff = this.computeDiff(prevMatch, currentMatch);
      
      if (diff && diff.changes.length > 0) {
        this.metrics.totalDiffsDetected++;
        
        // Write new canonical state to Redis
        await redisCache.set(fixtureKey, currentMatch, 3600); // 1 hour TTL
        logger.info(`[REDIS] Cache updated: match=${currentMatch.match_id}, sport=${currentMatch.sport_key}, league=${currentMatch.league_id}`);
        
        // Add to league index
        await this.updateLeagueIndex(currentMatch);
        
        // Publish diff to Ably (batched)
        await this.queueForPublish(currentMatch.sport_key, diff);
      }
      
    } catch (error) {
      logger.error(`Error processing match ${currentMatch.match_id}:`, error);
    }
  }

  /**
   * Compute minimal diff between previous and current match state
   */
  private computeDiff(prev: UnifiedMatch | null, current: UnifiedMatch): MatchDiff | null {
    if (!prev) {
      // New match - send entire object as "new" event
      return {
        fixture_id: current.match_id,
        sport_key: current.sport_key,
        changes: [{ path: 'new', value: current }],
        timestamp: Date.now(),
      };
    }

    const changes: Array<{ path: string; value: any; oldValue?: any }> = [];

    // Check status changes
    if (prev.status !== current.status) {
      changes.push({
        path: 'status',
        value: current.status,
        oldValue: prev.status,
      });
    }

    // Check market status changes
    if (prev.market_status !== current.market_status) {
      changes.push({
        path: 'market_status',
        value: current.market_status,
        oldValue: prev.market_status,
      });
    }

    // Check score changes
    if (current.scores && (!prev.scores || 
        prev.scores.home !== current.scores.home || 
        prev.scores.away !== current.scores.away)) {
      changes.push({
        path: 'scores',
        value: current.scores,
        oldValue: prev.scores,
      });
    }

    // Check odds changes (main h2h odds)
    if (current.odds && (!prev.odds ||
        Math.abs(prev.odds.home - current.odds.home) > 0.01 ||
        Math.abs(prev.odds.draw - current.odds.draw) > 0.01 ||
        Math.abs(prev.odds.away - current.odds.away) > 0.01)) {
      changes.push({
        path: 'odds',
        value: current.odds,
        oldValue: prev.odds,
      });
    }

    // Check commence_time changes
    if (prev.commence_time !== current.commence_time) {
      changes.push({
        path: 'commence_time',
        value: current.commence_time,
        oldValue: prev.commence_time,
      });
    }

    if (changes.length === 0) {
      return null;
    }

    return {
      fixture_id: current.match_id,
      sport_key: current.sport_key,
      changes,
      timestamp: Date.now(),
    };
  }

  /**
   * Update league fixture index in Redis
   */
  private async updateLeagueIndex(match: UnifiedMatch): Promise<void> {
    try {
      const leagueKey = `league:${match.league_id}:fixtures`;
      
      // Get current index
      let fixtureIds = await redisCache.get<string[]>(leagueKey) || [];
      
      // Add if not exists
      if (!fixtureIds.includes(match.match_id)) {
        fixtureIds.push(match.match_id);
        await redisCache.set(leagueKey, fixtureIds, 3600);
      }
      
    } catch (error) {
      logger.error(`Error updating league index for ${match.league_id}:`, error);
    }
  }

  /**
   * Queue diff for batched publishing to Ably
   */
  private async queueForPublish(sportKey: string, diff: MatchDiff): Promise<void> {
    const channel = `sports:${sportKey}`;
    
    // Initialize queue for this channel if needed
    if (!this.batchQueue.has(channel)) {
      this.batchQueue.set(channel, []);
    }
    
    const queue = this.batchQueue.get(channel)!;
    queue.push(diff);
    
    // If batch is full, flush immediately
    if (queue.length >= BATCH_CONFIG.maxBatchSize) {
      await this.flushBatch(channel);
      return;
    }
    
    // Otherwise, schedule flush if not already scheduled
    if (!this.batchTimers.has(channel)) {
      const timer = setTimeout(() => {
        this.flushBatch(channel);
      }, BATCH_CONFIG.windowMs);
      
      this.batchTimers.set(channel, timer);
    }
  }

  /**
   * Flush batched diffs to Ably channel
   * Splits batches that exceed 60KB to stay under Ably's 65KB limit
   */
  private async flushBatch(channel: string): Promise<void> {
    try {
      // Clear timer
      const timer = this.batchTimers.get(channel);
      if (timer) {
        clearTimeout(timer);
        this.batchTimers.delete(channel);
      }
      
      // Get and clear queue
      const queue = this.batchQueue.get(channel) || [];
      if (queue.length === 0) return;
      
      this.batchQueue.set(channel, []);
      
      // Split queue into chunks that fit Ably's 65KB limit
      const MAX_MESSAGE_SIZE = 60000; // 60KB safety margin (Ably limit is 65536)
      const batches: any[][] = [];
      let currentBatch: any[] = [];
      
      for (const diff of queue) {
        // Try adding to current batch
        const testBatch = [...currentBatch, diff];
        const testMessage = {
          type: 'batch:updates',
          updates: testBatch,
          count: testBatch.length,
          timestamp: Date.now(),
        };
        const testSize = JSON.stringify(testMessage).length;
        
        // If adding this diff exceeds limit, flush current batch and start new
        if (testSize > MAX_MESSAGE_SIZE && currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [diff]; // Start new batch with this diff
        } else {
          currentBatch.push(diff);
        }
      }
      
      // Add final batch
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      
      // Publish each batch
      for (const batch of batches) {
        const batchMessage = {
          type: 'batch:updates',
          updates: batch,
          count: batch.length,
          timestamp: Date.now(),
        };
        
        const startTime = Date.now();
        const ablyChannel = ably.channels.get(channel);
        await ablyChannel.publish('update', batchMessage);
        
        const publishLatency = Date.now() - startTime;
        this.metrics.publishLatency.push(publishLatency);
        if (this.metrics.publishLatency.length > 100) {
          this.metrics.publishLatency.shift();
        }
        
        this.metrics.totalMessagesPublished++;
        
        // Calculate message size
        const messageSize = JSON.stringify(batchMessage).length;
        this.updateAverageMessageSize(messageSize);
        
        logger.info(`[ABLY] Publish complete: channel=${channel}, updates=${batch.length}, size=${(messageSize / 1024).toFixed(1)}KB, latency=${publishLatency}ms`);
        
        if (batches.length > 1) {
          logger.info(`[ABLY] Split batch: ${batch.length} updates, ${(messageSize / 1024).toFixed(1)}KB`);
        }
      }
      
    } catch (error) {
      logger.error(`Error flushing batch to ${channel}:`, error);
    }
  }

  /**
   * Update average message size metric
   */
  private updateAverageMessageSize(newSize: number): void {
    const count = this.metrics.totalMessagesPublished;
    const oldAvg = this.metrics.averageMessageSize;
    this.metrics.averageMessageSize = ((oldAvg * (count - 1)) + newSize) / count;
  }

  /**
   * Transform manual match from DB to UnifiedMatch format
   */
  private async transformManualMatch(dbMatch: any): Promise<UnifiedMatch> {
    // Reuse the unified service transformation
    const markets = await storage.getMatchMarkets(dbMatch.id);
    
    const h2hMarket = markets.find(m => m.type === '1x2' || m.key === 'h2h');
    let odds: any = undefined;
    
    if (h2hMarket && h2hMarket.outcomes) {
      const outcomes = h2hMarket.outcomes;
      const homeOutcome = outcomes.find((o: any) => o.key === 'home' || o.key === '1');
      const drawOutcome = outcomes.find((o: any) => o.key === 'draw' || o.key === 'x');
      const awayOutcome = outcomes.find((o: any) => o.key === 'away' || o.key === '2');
      
      if (homeOutcome && drawOutcome && awayOutcome) {
        odds = {
          home: parseFloat(homeOutcome.odds),
          draw: parseFloat(drawOutcome.odds),
          away: parseFloat(awayOutcome.odds),
        };
      }
    }
    
    let status: 'live' | 'upcoming' | 'completed' = 'upcoming';
    if (dbMatch.status === 'live') status = 'live';
    else if (dbMatch.status === 'finished') status = 'completed';
    
    let market_status: 'open' | 'suspended' | 'closed' = 'open';
    if (dbMatch.status === 'finished') market_status = 'closed';
    else if (h2hMarket?.status === 'suspended') market_status = 'suspended';
    else if (h2hMarket?.status === 'closed') market_status = 'closed';
    
    const unified: UnifiedMatch = {
      match_id: dbMatch.id,
      sport_key: dbMatch.sport || 'soccer',
      league_id: dbMatch.league_id || dbMatch.leagueId,
      league_name: dbMatch.league_name || dbMatch.leagueName,
      home_team: dbMatch.home_team_name || dbMatch.homeTeamName,
      away_team: dbMatch.away_team_name || dbMatch.awayTeamName,
      home_team_logo: null,
      away_team_logo: null,
      commence_time: dbMatch.kickoff_time || dbMatch.kickoffTime,
      status,
      market_status,
      source: 'manual',
      is_manual: true,
    };
    
    if (dbMatch.home_score !== null && dbMatch.away_score !== null) {
      unified.scores = {
        home: dbMatch.home_score || dbMatch.homeScore || 0,
        away: dbMatch.away_score || dbMatch.awayScore || 0,
      };
    }
    
    if (odds) {
      unified.odds = odds;
    }
    
    return unified;
  }

  /**
   * Get aggregator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averagePublishLatency: this.metrics.publishLatency.length > 0
        ? this.metrics.publishLatency.reduce((a, b) => a + b, 0) / this.metrics.publishLatency.length
        : 0,
      averageRedisLatency: this.metrics.redisLatency.length > 0
        ? this.metrics.redisLatency.reduce((a, b) => a + b, 0) / this.metrics.redisLatency.length
        : 0,
    };
  }
}

// Export singleton instance
export const ablyAggregator = new AblyAggregator();
