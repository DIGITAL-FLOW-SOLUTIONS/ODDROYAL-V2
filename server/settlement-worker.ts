import { storage } from './storage';
import { oddsApiClient } from './odds-api-client';
import { redisCache } from './redis-cache';
import type { Bet, BetSelection } from '@shared/schema';
import { logger } from './logger';
import { settlementMonitor } from './settlement-monitor';
import { settlementRetryQueue } from './settlement-retry-queue';
import { randomUUID } from 'crypto';

interface MatchResult {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  status: 'finished' | 'cancelled' | 'postponed';
  winner: 'home' | 'away' | 'draw' | null;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
}

interface SelectionOutcome {
  selectionId: string;
  status: 'won' | 'lost' | 'void';
  result: string;
  odds?: number;
}

interface BetOutcome {
  bet: Bet;
  selections: SelectionOutcome[];
  finalStatus: 'won' | 'lost' | 'void';
  actualWinnings: number;
}

export class BetSettlementWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private processedBets = 0;
  private errors = 0;
  private lastRun: Date | null = null;
  private lockTTL = 30; // Lock expires after 30 seconds
  private maxRetries = 5; // Max retries for failed settlements (PRODUCTION: 5 retries)
  private retryDelay = 120000; // Retry delay: 2 minutes (PRODUCTION requirement)
  private workerId: string; // Unique worker identifier
  private shutdownRequested = false; // Graceful shutdown flag

  constructor(private intervalMinutes = 2) {
    this.workerId = `worker-${randomUUID().slice(0, 8)}`;
    logger.info(`[SETTLEMENT] Worker initialized with ID: ${this.workerId}, interval: ${intervalMinutes} minutes, maxRetries: ${this.maxRetries}`);
  }

  /**
   * Get the current status of the settlement worker
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    lastRun: string | null;
    nextRun: string | null;
    processedBets: number;
    errors: number;
    workerId: string;
    metrics: any;
    circuitBreaker: any;
    retryQueue: any;
  }> {
    const now = new Date();
    let nextRun: string | null = null;
    
    if (this.intervalId && this.lastRun) {
      const nextRunTime = new Date(this.lastRun.getTime() + (this.intervalMinutes * 60 * 1000));
      nextRun = nextRunTime.toISOString();
    }

    const retryQueueStats = await settlementRetryQueue.getQueueStats();

    return {
      isRunning: this.intervalId !== null,
      lastRun: this.lastRun?.toISOString() || null,
      nextRun,
      processedBets: this.processedBets,
      errors: this.errors,
      workerId: this.workerId,
      metrics: settlementMonitor.getStats(),
      circuitBreaker: settlementMonitor.getCircuitBreakerStatus(),
      retryQueue: retryQueueStats
    };
  }

  /**
   * Start the settlement worker to run at specified intervals
   */
  start(): void {
    if (this.intervalId) {
      logger.info('Settlement worker already running');
      return;
    }

    logger.info(`Starting bet settlement worker (runs every ${this.intervalMinutes} minutes)`);
    
    // Run immediately on start
    this.processPendingBets().catch((err) => logger.error(err));
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.processPendingBets().catch((err) => logger.error(err));
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the settlement worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Settlement worker stopped');
    }
  }

  /**
   * Graceful shutdown - wait for current settlement to complete
   */
  async shutdown(): Promise<void> {
    logger.info('[SETTLEMENT] Graceful shutdown initiated');
    this.shutdownRequested = true;
    
    // Stop accepting new cycles
    this.stop();
    
    // Wait for current settlement to complete (max 30 seconds)
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (this.isRunning && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.isRunning) {
      logger.warn('[SETTLEMENT] Shutdown timeout - current settlement still running');
    } else {
      logger.success('[SETTLEMENT] Graceful shutdown complete');
    }
  }

  /**
   * Main settlement process - finds pending bets and settles them
   */
  private async processPendingBets(): Promise<void> {
    if (this.isRunning) {
      logger.info('[AUDIT] Settlement process already running, skipping this cycle');
      return;
    }

    // Check if shutdown requested
    if (this.shutdownRequested) {
      logger.info('[SETTLEMENT] Shutdown requested, skipping cycle');
      return;
    }

    // Check circuit breaker
    if (settlementMonitor.isCircuitOpen()) {
      logger.warn('[SETTLEMENT] Circuit breaker open, skipping cycle');
      return;
    }

    this.isRunning = true;
    const runStartTime = Date.now();
    this.lastRun = new Date();
    const runId = `run-${Date.now()}`;
    
    logger.info('=== [AUDIT] SETTLEMENT CYCLE START ===', {
      runId,
      workerId: this.workerId,
      timestamp: new Date().toISOString(),
      totalProcessed: this.processedBets,
      totalErrors: this.errors,
      metrics: settlementMonitor.getSummary()
    });

    try {
      // First, process retry queue
      const retryItems = await settlementRetryQueue.getItemsReadyForRetry(5);
      if (retryItems.length > 0) {
        logger.info(`[RETRY_QUEUE] Processing ${retryItems.length} items from retry queue`, { runId });
        // Note: Retry items will be included in getPendingBets() if still pending
        // If already settled, they'll be filtered out automatically
      }

      // Get all pending bets
      const pendingBets = await this.getPendingBets();
      logger.info(`[AUDIT] Found ${pendingBets.length} pending bet(s) to evaluate`, {
        runId,
        betIds: pendingBets.map(b => b.id)
      });

      if (pendingBets.length === 0) {
        logger.info('[AUDIT] No pending bets, settlement cycle complete', { runId });
        return;
      }

      // Get unique fixture IDs from all pending selections
      const fixtureIds = await this.getUniqueFixtureIds(pendingBets);
      logger.info(`[AUDIT] Checking results for ${fixtureIds.length} unique fixture(s)`, {
        runId,
        fixtureIds
      });

      // Fetch completed match results
      const matchResults = await this.fetchCompletedMatches(fixtureIds);
      logger.info(`[AUDIT] Found ${matchResults.length} completed match(es) with results`, {
        runId,
        completedFixtures: matchResults.map(m => m.fixtureId)
      });

      if (matchResults.length === 0) {
        logger.info('[AUDIT] No completed matches found, waiting for results', { runId });
        return;
      }

      // Process settlements for each bet
      let settledBetsCount = 0;
      let skippedBetsCount = 0;
      let errorBetsCount = 0;
      
      for (const bet of pendingBets) {
        try {
          const settled = await this.settleBet(bet, matchResults);
          if (settled) {
            settledBetsCount++;
          } else {
            skippedBetsCount++;
          }
        } catch (error) {
          logger.error(`[AUDIT] Failed to settle bet ${bet.id}`, {
            runId,
            betId: bet.id,
            userId: bet.userId,
            error: error instanceof Error ? error.message : String(error)
          });
          errorBetsCount++;
          this.errors++;
        }
      }

      const runDuration = Date.now() - runStartTime;
      logger.success('=== [AUDIT] SETTLEMENT CYCLE COMPLETE ===', {
        runId,
        duration: `${runDuration}ms`,
        totalBets: pendingBets.length,
        settled: settledBetsCount,
        skipped: skippedBetsCount,
        errors: errorBetsCount,
        cumulativeProcessed: this.processedBets,
        cumulativeErrors: this.errors
      });
      
    } catch (error) {
      logger.error('[AUDIT] Critical error in settlement cycle', {
        runId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.errors++;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all pending bets that need settlement
   */
  private async getPendingBets(): Promise<Bet[]> {
    try {
      // Use the storage interface method to get pending bets
      const pendingBets = await storage.getPendingBets();
      logger.info(`Found ${pendingBets.length} pending bets across all users`);
      return pendingBets;
    } catch (error) {
      logger.error('Error getting pending bets:', error);
      return [];
    }
  }


  /**
   * Extract unique fixture IDs from pending bets
   */
  private async getUniqueFixtureIds(bets: Bet[]): Promise<string[]> {
    const fixtureIds = new Set<string>();
    
    for (const bet of bets) {
      try {
        // Get selections for this bet - properly await the async call
        const selections = await storage.getBetSelections(bet.id);
        selections.forEach(selection => fixtureIds.add(selection.fixtureId));
      } catch (error) {
        logger.error(`Error getting selections for bet ${bet.id}:`, error);
      }
    }
    
    logger.info(`Extracted ${fixtureIds.size} unique fixture IDs`);
    return Array.from(fixtureIds);
  }

  /**
   * Fetch completed match results from The Odds API scores endpoint or Redis cache
   */
  private async fetchCompletedMatches(fixtureIds: string[]): Promise<MatchResult[]> {
    const results: MatchResult[] = [];
    
    for (const fixtureId of fixtureIds) {
      try {
        // Fetch fixture result from The Odds API or Redis cache
        const fixtureResult = await this.fetchFixtureResult(fixtureId);
        if (fixtureResult) {
          results.push(fixtureResult);
        }
      } catch (error) {
        logger.error(`Failed to fetch result for fixture ${fixtureId}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Fetch individual fixture result (UNIFIED: handles both API and manual matches)
   */
  private async fetchFixtureResult(matchId: string): Promise<MatchResult | null> {
    try {
      logger.info(`Fetching result for match ${matchId}`);
      
      // Check if it's a manual match (UUIDs are longer than API match IDs)
      const isManualMatch = matchId.length > 30;
      
      if (isManualMatch) {
        // Get manual match from database
        const match = await storage.getMatch(matchId);
        
        if (match && match.status === 'finished') {
          const homeScore = match.home_score || match.homeScore || 0;
          const awayScore = match.away_score || match.awayScore || 0;
          
          logger.info(`Manual match ${matchId} finished: ${homeScore}-${awayScore}`);
          
          return {
            fixtureId: matchId,
            homeScore,
            awayScore,
            totalGoals: homeScore + awayScore,
            status: 'finished',
            winner: homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw',
            matchDate: match.kickoff_time || match.kickoffTime || new Date().toISOString(),
            homeTeam: match.home_team_name || match.homeTeamName || '',
            awayTeam: match.away_team_name || match.awayTeamName || ''
          };
        }
        
        logger.info(`Manual match ${matchId} not finished yet`);
        return null;
      }
      
      // For API matches: Get from Redis cache (populated by aggregator worker)
      const cachedMatch = await redisCache.get<any>(`match:details:${matchId}`);
      
      if (cachedMatch && cachedMatch.completed) {
        // Extract scores from cached match
        const homeScore = cachedMatch.scores?.home ?? 0;
        const awayScore = cachedMatch.scores?.away ?? 0;
        
        return {
          fixtureId: matchId,
          homeScore,
          awayScore,
          totalGoals: homeScore + awayScore,
          status: cachedMatch.scores ? 'finished' : 'postponed',
          winner: homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw',
          matchDate: cachedMatch.commence_time || new Date().toISOString(),
          homeTeam: cachedMatch.home_team || '',
          awayTeam: cachedMatch.away_team || ''
        };
      }
      
      // API match not in cache - wait for aggregator worker to fetch results
      logger.info(`API match ${matchId} not in cache yet, waiting for aggregator worker`);
      return null;
      
    } catch (error) {
      logger.error(`Error fetching match ${matchId}:`, error);
      return null;
    }
  }

  /**
   * Retry an async operation with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    attempt: number = 1
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        logger.error(`${context} failed after ${this.maxRetries} attempts:`, error);
        return null;
      }

      const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
      const jitter = Math.random() * 200; // Add jitter to prevent thundering herd
      const totalDelay = delay + jitter;

      logger.warn(`${context} failed (attempt ${attempt}/${this.maxRetries}), retrying in ${totalDelay.toFixed(0)}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return this.retryWithBackoff(operation, context, attempt + 1);
    }
  }

  /**
   * Settle individual bet based on match results
   */
  private async settleBet(bet: Bet, matchResults: MatchResult[]): Promise<boolean> {
    // Generate unique lock token for this worker
    const lockToken = `${Date.now()}-${Math.random().toString(36)}`;
    const lockKey = `settlement:lock:${bet.id}`;
    
    logger.info(`[AUDIT] Attempting to acquire lock for bet settlement`, {
      betId: bet.id,
      userId: bet.userId,
      lockKey,
      lockToken: lockToken.slice(0, 16) + '...'
    });
    
    // Try to acquire distributed lock with SET NX EX
    const lockAcquired = await redisCache.acquireLock(lockKey, lockToken, this.lockTTL);
    if (!lockAcquired) {
      logger.warn(`[AUDIT] LOCK_CONTENTION: Bet ${bet.id} is locked by another worker`, {
        betId: bet.id,
        userId: bet.userId,
        reason: 'concurrent_settlement_attempt'
      });
      return false;
    }

    logger.info(`[AUDIT] Lock acquired successfully`, {
      betId: bet.id,
      lockTTL: this.lockTTL
    });

    try {
      // IDEMPOTENCY CHECK: Skip if bet is already settled
      if (bet.status !== 'pending') {
        logger.info(`[AUDIT] IDEMPOTENCY_SKIP: Bet already settled`, {
          betId: bet.id,
          currentStatus: bet.status,
          settledAt: bet.settledAt,
          reason: 'duplicate_settlement_prevented'
        });
        return false;
      }

      // Get bet selections
      const selections = await storage.getBetSelections(bet.id);
      if (selections.length === 0) {
        logger.warn(`No selections found for bet ${bet.id}`);
        return false;
      }

      // Check if all selections have results available
      const selectionOutcomes = await this.evaluateSelections(selections, matchResults);
      
      // Check if we have results for all selections
      if (selectionOutcomes.length !== selections.length) {
        logger.info(`Bet ${bet.id}: Not all selections have results yet`);
        return false;
      }

      // Determine overall bet outcome
      const betOutcome = this.calculateBetOutcome(bet, selectionOutcomes);
      
      // Track settlement start time
      const settlementStart = Date.now();
      
      // ATOMIC SETTLEMENT: All operations in a single transaction
      const result = await storage.settleAtomically({
        betId: bet.id,
        userId: bet.userId,
        finalStatus: betOutcome.finalStatus,
        actualWinnings: betOutcome.actualWinnings,
        selectionUpdates: selectionOutcomes.map(o => ({
          selectionId: o.selectionId,
          status: o.status,
          result: o.result
        })),
        workerId: this.workerId
      });

      const processingTimeMs = Date.now() - settlementStart;

      if (!result.success) {
        logger.error(`Atomic settlement failed for bet ${bet.id}: ${result.error}`);
        this.errors++;
        
        // Record failure in monitor
        settlementMonitor.recordSettlement({
          betId: bet.id,
          userId: bet.userId,
          finalStatus: betOutcome.finalStatus,
          actualWinnings: betOutcome.actualWinnings,
          processingTimeMs,
          success: false,
          error: result.error,
          timestamp: new Date()
        });

        // Check if this is a duplicate settlement
        if (result.error?.includes('already settled')) {
          settlementMonitor.recordDuplicatePrevented(bet.id, result.error);
          // Don't add duplicates to retry queue
        } else {
          // Add to retry queue for transient failures
          await settlementRetryQueue.addToRetryQueue(
            bet.id,
            bet.userId,
            result.error,
            'normal'
          );
        }
        
        return false;
      }

      logger.info(`Settled bet ${bet.id}: ${betOutcome.finalStatus} - winnings: ${betOutcome.actualWinnings}`);
      this.processedBets++;
      
      // Remove from retry queue if it was there
      await settlementRetryQueue.removeFromRetryQueue(bet.id);
      
      // Record success in monitor
      settlementMonitor.recordSettlement({
        betId: bet.id,
        userId: bet.userId,
        finalStatus: betOutcome.finalStatus,
        actualWinnings: betOutcome.actualWinnings,
        processingTimeMs,
        success: true,
        timestamp: new Date()
      });
      
      return true;
      
    } catch (error) {
      logger.error(`Error settling bet ${bet.id}:`, error);
      return false;
    } finally {
      // Always release lock safely (only if this worker owns it)
      await redisCache.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Evaluate individual selections against match results
   * PRODUCTION: Never returns void status - only won or lost
   */
  private async evaluateSelections(selections: BetSelection[], matchResults: MatchResult[]): Promise<SelectionOutcome[]> {
    const outcomes: SelectionOutcome[] = [];
    
    for (const selection of selections) {
      const matchResult = matchResults.find(result => result.fixtureId === selection.fixtureId);
      
      if (!matchResult) {
        // No result available yet - don't settle this selection
        continue;
      }

      // PRODUCTION FIX: Even if match is cancelled/postponed, settle based on scores if available
      // This prevents bets being voided in production
      if (matchResult.status !== 'finished') {
        logger.warn(`Match ${matchResult.fixtureId} status is ${matchResult.status} but has scores - evaluating anyway`);
        
        // If we have scores, evaluate; otherwise settle as lost (NEVER void)
        if (matchResult.homeScore !== undefined && matchResult.awayScore !== undefined) {
          const outcome = this.evaluateSelection(selection, matchResult);
          outcomes.push(outcome);
        } else {
          // No scores available - settle as lost to avoid void
          logger.warn(`No scores for ${matchResult.fixtureId} - settling as lost`);
          outcomes.push({
            selectionId: selection.id,
            status: 'lost',
            result: `Match ${matchResult.status} - no scores`,
            odds: parseFloat(selection.odds)
          });
        }
        continue;
      }

      // Evaluate selection based on market type
      const outcome = this.evaluateSelection(selection, matchResult);
      outcomes.push(outcome);
    }
    
    return outcomes;
  }

  /**
   * Evaluate individual selection outcome based on market and result
   * PRODUCTION: Never returns void - only won or lost
   */
  private evaluateSelection(selection: BetSelection, matchResult: MatchResult): SelectionOutcome {
    const { market, selection: selectionType, odds } = selection;
    const { homeScore, awayScore, winner } = matchResult;

    let isWon = false;
    let resultText = `${homeScore}-${awayScore}`;
    const totalGoals = homeScore + awayScore;

    // Normalize market key (handle variations)
    const normalizedMarket = market.toLowerCase().replace(/_/g, '');

    try {
      // Match Winner / 1X2
      if (normalizedMarket === '1x2' || normalizedMarket === 'matchwinner' || normalizedMarket === 'h2h') {
        if (selectionType === 'home' || selectionType === '1') isWon = (winner === 'home');
        else if (selectionType === 'away' || selectionType === '2') isWon = (winner === 'away');
        else if (selectionType === 'draw' || selectionType === 'x') isWon = (winner === 'draw');
        resultText = `Result: ${homeScore}-${awayScore} (${winner})`;
      }
      
      // Totals (Over/Under)
      else if (normalizedMarket.startsWith('totals') || normalizedMarket.includes('totalgoals')) {
        // Extract threshold from market name (e.g., totals_0.5 -> 0.5)
        const thresholdMatch = market.match(/[\d.]+/);
        const threshold = thresholdMatch ? parseFloat(thresholdMatch[0]) : 2.5;
        
        if (selectionType.toLowerCase().includes('over')) {
          isWon = totalGoals > threshold;
        } else if (selectionType.toLowerCase().includes('under')) {
          isWon = totalGoals < threshold;
        }
        resultText = `Total goals: ${totalGoals} (threshold: ${threshold})`;
      }
      
      // Asian Handicap
      else if (normalizedMarket.includes('asian') && normalizedMarket.includes('handicap')) {
        // Extract handicap value (e.g., asian-handicap-0 -> 0)
        const handicapMatch = market.match(/-?([\d.]+)$/);
        const handicap = handicapMatch ? parseFloat(handicapMatch[1]) : 0;
        
        // Apply handicap to home team
        const adjustedHomeScore = homeScore + (selectionType === 'home' ? handicap : -handicap);
        const adjustedAwayScore = awayScore;
        
        if (selectionType === 'home') {
          isWon = adjustedHomeScore > adjustedAwayScore;
        } else {
          isWon = adjustedAwayScore > adjustedHomeScore;
        }
        resultText = `Handicap ${handicap}: ${homeScore}-${awayScore}`;
      }
      
      // Correct Score
      else if (normalizedMarket.includes('correctscore')) {
        // selectionType format: "1-0", "2-1", etc.
        const [expectedHome, expectedAway] = selectionType.split('-').map(Number);
        isWon = (homeScore === expectedHome && awayScore === expectedAway);
        resultText = `Result: ${homeScore}-${awayScore}`;
      }
      
      // Double Chance
      else if (normalizedMarket.includes('doublechance')) {
        if (selectionType === '1x' || selectionType === 'homedraw') {
          isWon = (winner === 'home' || winner === 'draw');
        } else if (selectionType === '12' || selectionType === 'homeaway') {
          isWon = (winner !== 'draw');
        } else if (selectionType === 'x2' || selectionType === 'draaway') {
          isWon = (winner === 'draw' || winner === 'away');
        }
        resultText = `Result: ${winner}`;
      }
      
      // Both Teams to Score
      else if (normalizedMarket.includes('btts') || normalizedMarket.includes('bothteamstoscore')) {
        const bothScored = (homeScore > 0 && awayScore > 0);
        if (selectionType.toLowerCase() === 'yes') {
          isWon = bothScored;
        } else {
          isWon = !bothScored;
        }
        resultText = `Both scored: ${bothScored}`;
      }
      
      // Next Goal (cannot evaluate without minute-by-minute data - settle as lost)
      else if (normalizedMarket.includes('nextgoal')) {
        logger.warn(`Next goal market cannot be evaluated - settling as lost for bet ${selection.id}`);
        isWon = false;
        resultText = 'Next goal market - insufficient data';
      }
      
      // Unknown market - default to lost (NEVER void)
      else {
        logger.warn(`Unknown market type "${market}" for selection ${selection.id} - settling as lost`);
        isWon = false;
        resultText = `Unknown market: ${market}`;
      }

    } catch (error) {
      logger.error(`Error evaluating selection ${selection.id}:`, error);
      // On error, settle as lost (NEVER void)
      isWon = false;
      resultText = `Evaluation error: ${homeScore}-${awayScore}`;
    }

    return {
      selectionId: selection.id,
      status: isWon ? 'won' : 'lost',
      result: resultText,
      odds: parseFloat(odds) // Always include odds for express bet calculations
    };
  }

  /**
   * Calculate overall bet outcome based on selection outcomes
   * PRODUCTION: Never returns void - only won or lost
   */
  private calculateBetOutcome(bet: Bet, selectionOutcomes: SelectionOutcome[]): BetOutcome {
    const wonCount = selectionOutcomes.filter(o => o.status === 'won').length;
    const lostCount = selectionOutcomes.filter(o => o.status === 'lost').length;

    let finalStatus: 'won' | 'lost' | 'void';
    let actualWinnings = 0;

    switch (bet.type) {
      case 'single':
        // Single bet: all selections must win (NO VOID in production)
        if (wonCount === selectionOutcomes.length) {
          finalStatus = 'won';
          actualWinnings = bet.potentialWinnings;
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      case 'express':
        // Express bet: all selections must win (NO VOID in production)
        if (wonCount === selectionOutcomes.length) {
          finalStatus = 'won';
          actualWinnings = bet.potentialWinnings;
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      case 'system':
        // System bet: complex calculation based on combinations
        // Win if at least half of selections won
        if (wonCount >= Math.ceil(selectionOutcomes.length / 2)) {
          finalStatus = 'won';
          actualWinnings = Math.round(bet.potentialWinnings * (wonCount / selectionOutcomes.length));
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      default:
        finalStatus = 'lost';
        actualWinnings = 0;
    }

    return {
      bet,
      selections: selectionOutcomes,
      finalStatus,
      actualWinnings
    };
  }

}

// Export singleton instance
export const settlementWorker = new BetSettlementWorker(2); // Run every 2 minutes (PRODUCTION: faster settlement)
