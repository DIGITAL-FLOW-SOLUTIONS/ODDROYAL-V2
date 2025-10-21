/**
 * Ably Aggregator Worker
 * 
 * Architecture: The Odds API + Manual DB → Aggregator → Redis (canonical state) → Ably Channels → Clients
 * 
 * This worker:
 * 1. Polls The Odds API for live/prematch data
 * 2. Fetches manual matches from Supabase
 * 3. Computes minimal diffs vs previous state in Redis
 * 4. Writes new canonical snapshots to Redis (fixture:<id>)
 * 5. Publishes tiny delta patches to Ably channels
 */

import Ably from 'ably';
import { redisCache } from '../server/redis-cache';
import { oddsApiClient } from '../server/odds-api-client';
import { storage } from '../server/storage';
import { unifiedMatchService, UnifiedMatch } from '../server/unified-match-service';
import { logger } from '../server/logger';
import { marketGenerator } from '../server/market-generator';
import pLimit from 'p-limit';

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
  live: 33000,       // 33 seconds for live matches (API updates every 30s)
  prematch: 60000,   // 60 seconds for upcoming matches
  manual: 10000,     // 10 seconds for manual matches
  sportsList: 1800000, // 30 minutes for sports list refresh (prevents expiration)
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

    // Start polling loops
    this.startLivePolling();
    this.startPrematchPolling();
    this.startManualPolling();
    this.startSportsListRefresh();

    logger.success('✅ Ably Aggregator started');
    logger.info('📡 Publishing to Ably channels: sports:football, sports:basketball, etc.');
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping Ably Aggregator...');
    this.running = false;

    // Clear all intervals
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();

    // Flush remaining batches
    for (const [channel, _] of Array.from(this.batchQueue.entries())) {
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
   * Start periodic sports list refresh to prevent expiration
   */
  private startSportsListRefresh(): void {
    const interval = setInterval(async () => {
      await this.refreshSportsList();
    }, POLL_INTERVALS.sportsList);

    this.intervals.set('sportsList', interval);
    
    // Run immediately
    this.refreshSportsList().catch(logger.error);
  }

  /**
   * Refresh sports list to prevent cache expiration
   */
  private async refreshSportsList(): Promise<void> {
    try {
      const sports = await redisCache.refreshSportsListIfNeeded();
      logger.info(`[AGGREGATOR] Sports list refreshed: ${sports.length} sports available`);
    } catch (error) {
      logger.error('Error refreshing sports list:', error);
    }
  }

  /**
   * Poll and process live matches
   */
  private async pollAndProcessLive(): Promise<void> {
    try {
      this.metrics.totalPolls++;
      this.metrics.lastPollTime = new Date();

      const startTime = Date.now();
      
      // Get all live matches from unified service
      const liveMatches = await unifiedMatchService.getAllLiveMatches();
      
      logger.info(`[AGGREGATOR] Live fetch complete: ${liveMatches.length} matches`);
      
      this.metrics.redisLatency.push(Date.now() - startTime);
      if (this.metrics.redisLatency.length > 100) {
        this.metrics.redisLatency.shift();
      }

      // Process each match for changes
      await Promise.all(
        liveMatches.map(match => limit(() => this.processMatchUpdate(match)))
      );
      
      // COMPATIBILITY: Also update old structure for getAllLiveMatchesEnriched()
      await this.updateLegacyLiveStructure(liveMatches);
      
    } catch (error) {
      logger.error('Error polling live matches:', error);
    }
  }

  /**
   * Poll and process prematch (upcoming) matches
   */
  private async pollAndProcessPrematch(): Promise<void> {
    try {
      this.metrics.totalPolls++;

      const startTime = Date.now();
      
      // Get upcoming matches from unified service
      const upcomingMatches = await unifiedMatchService.getAllUpcomingMatches(100);
      
      logger.info(`[AGGREGATOR] Prematch fetch complete: ${upcomingMatches.length} matches`);
      
      this.metrics.redisLatency.push(Date.now() - startTime);
      if (this.metrics.redisLatency.length > 100) {
        this.metrics.redisLatency.shift();
      }

      // Process each match for changes
      await Promise.all(
        upcomingMatches.map(match => limit(() => this.processMatchUpdate(match)))
      );
      
      // COMPATIBILITY: Also update old structure for lookup functions
      await this.updateLegacyPrematchStructure(upcomingMatches);
      
    } catch (error) {
      logger.error('Error polling prematch matches:', error);
    }
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
      
      // Generate and cache markets for this match (always, not just on diff)
      await this.generateAndCacheMarkets(currentMatch);
      
    } catch (error) {
      logger.error(`Error processing match ${currentMatch.match_id}:`, error);
    }
  }

  /**
   * Generate markets for a match and store in Redis
   * Markets are generated dynamically for all sports and cached for fast retrieval
   */
  private async generateAndCacheMarkets(match: UnifiedMatch): Promise<void> {
    try {
      const marketKey = `match:markets:${match.match_id}`;
      
      // Generate markets using the market generator (deterministic based on match details)
      const generatedMarkets = marketGenerator.generateMarkets(
        match.sport_key,
        match.home_team,
        match.away_team,
        match.match_id
      );
      
      // Prepare market data for storage
      const marketData = {
        match_id: match.match_id,
        sport_key: match.sport_key,
        markets: generatedMarkets,
        generated_at: new Date().toISOString(),
      };
      
      // Determine TTL based on match status
      // Live matches: 2 minutes, Upcoming: 5 minutes
      const ttl = match.status === 'live' ? 120 : 300;
      
      // Store in Redis
      await redisCache.set(marketKey, marketData, ttl);
      
      logger.info(`[MARKETS] Generated ${generatedMarkets.length} markets for match=${match.match_id}, sport=${match.sport_key}`);
      
    } catch (error) {
      logger.error(`Error generating markets for match ${match.match_id}:`, error);
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
   * Also adds manual matches to sport/league arrays so they appear alongside API matches
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
      
      // For manual matches, also add to live/prematch league arrays
      // This ensures they appear when getAllLiveMatchesEnriched() fetches matches
      if (match.source === 'manual') {
        const sportKey = match.sport_key;
        const leagueId = match.league_id;
        
        if (match.status === 'live') {
          // Add to live league array
          const liveKey = `live:${sportKey}:${leagueId}`;
          let liveMatches = await redisCache.get<UnifiedMatch[]>(liveKey) || [];
          
          // Replace or add the match
          const existingIndex = liveMatches.findIndex(m => m.match_id === match.match_id);
          if (existingIndex >= 0) {
            liveMatches[existingIndex] = match;
          } else {
            liveMatches.push(match);
          }
          
          await redisCache.set(liveKey, liveMatches, 300); // 5 min TTL for live
          
        } else if (match.status === 'upcoming') {
          // Add to prematch league array
          const prematchKey = `prematch:${sportKey}:${leagueId}`;
          let prematchMatches = await redisCache.get<UnifiedMatch[]>(prematchKey) || [];
          
          // Replace or add the match
          const existingIndex = prematchMatches.findIndex(m => m.match_id === match.match_id);
          if (existingIndex >= 0) {
            prematchMatches[existingIndex] = match;
          } else {
            prematchMatches.push(match);
          }
          
          await redisCache.set(prematchKey, prematchMatches, 900); // 15 min TTL for prematch
        }
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
   * Includes bookmakers array for frontend odds display
   */
  private async transformManualMatch(dbMatch: any): Promise<UnifiedMatch> {
    // Get markets for the match to extract odds
    const markets = await storage.getMatchMarkets(dbMatch.id);
    
    // Build bookmakers array with markets and outcomes for consistency with API matches
    const bookmakers: any[] = [];
    
    if (markets && markets.length > 0) {
      // Group all markets under a single bookmaker for consistency
      const marketsList = markets.map((market: any) => {
        return {
          key: market.key || market.type,
          outcomes: (market.outcomes || []).map((outcome: any) => ({
            name: outcome.label,
            key: outcome.key,
            price: parseFloat(outcome.odds) || 1.01
          }))
        };
      });
      
      bookmakers.push({
        key: 'manual',
        title: 'Manual',
        markets: marketsList
      });
    }
    
    // Extract 1X2 odds if available
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
      bookmakers, // Include bookmakers for odds display
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
   * Update legacy live structure for backwards compatibility
   * Maintains live:leagues:{sport} and live:matches:{sport}:{league} keys
   * IMPORTANT: Merges with existing prematch leagues to preserve all leagues in cache
   */
  private async updateLegacyLiveStructure(matches: UnifiedMatch[]): Promise<void> {
    try {
      // Group matches by sport
      const matchesBySport = new Map<string, UnifiedMatch[]>();
      matches.forEach((match: UnifiedMatch) => {
        const sportMatches = matchesBySport.get(match.sport_key) || [];
        sportMatches.push(match);
        matchesBySport.set(match.sport_key, sportMatches);
      });

      // Update each sport's league and match structures
      for (const [sportKey, sportMatches] of Array.from(matchesBySport.entries())) {
        // Group by league
        const matchesByLeague = new Map<string, UnifiedMatch[]>();
        sportMatches.forEach((match: UnifiedMatch) => {
          const leagueMatches = matchesByLeague.get(match.league_id) || [];
          leagueMatches.push(match);
          matchesByLeague.set(match.league_id, leagueMatches);
        });

        // Build live league list (only leagues with live matches right now)
        const liveLeagues = Array.from(matchesByLeague.entries()).map(([leagueId, leagueMatches]) => ({
          league_id: leagueId,
          league_name: leagueMatches[0].league_name || leagueId,
          match_count: leagueMatches.length,
        }));

        // Update master catalog with discovered live leagues
        await this.updateMasterLeagueCatalog(sportKey, liveLeagues);

        // MERGE STRATEGY: Get existing prematch leagues and merge with live leagues
        const existingPrematchLeagues = await redisCache.getPrematchLeagues(sportKey) || [];
        
        // Create a map of league_id -> league data for efficient merging
        const mergedLeaguesMap = new Map<string, any>();
        
        // First, add all prematch leagues (with match_count: 0 for non-live)
        existingPrematchLeagues.forEach(league => {
          mergedLeaguesMap.set(league.league_id, {
            league_id: league.league_id,
            league_name: league.league_name,
            match_count: 0, // Default to 0 for non-live leagues
          });
        });
        
        // Then, update/add leagues with live matches (overwrite match_count)
        liveLeagues.forEach(league => {
          mergedLeaguesMap.set(league.league_id, league);
        });
        
        // Convert back to array
        const mergedLeagues = Array.from(mergedLeaguesMap.values());
        
        logger.info(`[AGGREGATOR] Live merge for ${sportKey}: ${liveLeagues.length} live leagues + ${existingPrematchLeagues.length} prematch = ${mergedLeagues.length} total`);

        // Write merged leagues to cache (preserves all prematch leagues)
        await redisCache.setLiveLeagues(sportKey, mergedLeagues, 300); // 5 minutes

        // Write matches for each live league
        for (const [leagueId, leagueMatches] of Array.from(matchesByLeague.entries())) {
          await redisCache.setLiveMatches(sportKey, leagueId, leagueMatches, 300); // 5 minutes
        }
      }
    } catch (error) {
      logger.error('Error updating legacy live structure:', error);
    }
  }

  /**
   * Update master league catalog with newly discovered leagues
   * This maintains a persistent list of all known leagues to prevent sidebar flickering
   */
  private async updateMasterLeagueCatalog(
    sportKey: string,
    leagues: Array<{ league_id: string; league_name: string }>
  ): Promise<void> {
    try {
      // Add each league to the master catalog (it will skip duplicates)
      for (const league of leagues) {
        await redisCache.addLeagueToMasterCatalog(sportKey, {
          league_id: league.league_id,
          league_name: league.league_name
        });
      }
    } catch (error) {
      logger.error(`Error updating master league catalog for ${sportKey}:`, error);
    }
  }

  /**
   * Update legacy prematch structure for backwards compatibility
   * Maintains prematch:leagues:{sport} and prematch:matches:{sport}:{league} keys
   */
  private async updateLegacyPrematchStructure(matches: UnifiedMatch[]): Promise<void> {
    try {
      // Group matches by sport
      const matchesBySport = new Map<string, UnifiedMatch[]>();
      matches.forEach((match: UnifiedMatch) => {
        const sportMatches = matchesBySport.get(match.sport_key) || [];
        sportMatches.push(match);
        matchesBySport.set(match.sport_key, sportMatches);
      });

      // Update each sport's league and match structures
      for (const [sportKey, sportMatches] of Array.from(matchesBySport.entries())) {
        // Group by league
        const matchesByLeague = new Map<string, UnifiedMatch[]>();
        sportMatches.forEach((match: UnifiedMatch) => {
          const leagueMatches = matchesByLeague.get(match.league_id) || [];
          leagueMatches.push(match);
          matchesByLeague.set(match.league_id, leagueMatches);
        });

        // Build league list
        const leagues = Array.from(matchesByLeague.entries()).map(([leagueId, leagueMatches]) => ({
          league_id: leagueId,
          league_name: leagueMatches[0].league_name || leagueId,
          match_count: leagueMatches.length,
        }));

        // Update master catalog with discovered leagues
        await this.updateMasterLeagueCatalog(sportKey, leagues);

        // Write to legacy keys with longer TTLs
        await redisCache.setPrematchLeagues(sportKey, leagues, 600); // 10 minutes

        // Write matches for each league
        for (const [leagueId, leagueMatches] of Array.from(matchesByLeague.entries())) {
          await redisCache.setPrematchMatches(sportKey, leagueId, leagueMatches, 600); // 10 minutes
        }
      }
    } catch (error) {
      logger.error('Error updating legacy prematch structure:', error);
    }
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
