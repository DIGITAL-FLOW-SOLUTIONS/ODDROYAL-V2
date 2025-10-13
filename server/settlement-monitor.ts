/**
 * Settlement Monitor - Production-grade settlement tracking and metrics
 * 
 * Monitors:
 * - Settlement success/failure rates
 * - Processing times and performance
 * - Duplicate prevention events
 * - Error rates and patterns
 * - Settlement throughput
 */

import { logger } from './logger';

interface SettlementMetrics {
  totalAttempts: number;
  successfulSettlements: number;
  failedSettlements: number;
  duplicatesPrevented: number;
  voidBets: number;
  wonBets: number;
  lostBets: number;
  totalProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  minProcessingTimeMs: number;
  errors: Map<string, number>; // error type -> count
  lastReset: Date;
}

interface SettlementEvent {
  betId: string;
  userId: string;
  finalStatus: 'won' | 'lost' | 'void';
  actualWinnings: number;
  processingTimeMs: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: 'closed' | 'open' | 'half-open';
  openedAt: Date | null;
}

class SettlementMonitor {
  private metrics: SettlementMetrics;
  private recentEvents: SettlementEvent[] = [];
  private maxRecentEvents = 1000; // Keep last 1000 events in memory
  private circuitBreaker: CircuitBreakerState;
  private readonly failureThreshold = 10; // Open circuit after 10 failures
  private readonly resetTimeout = 60000; // Reset circuit after 1 minute

  constructor() {
    this.metrics = this.createEmptyMetrics();
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      state: 'closed',
      openedAt: null
    };
  }

  private createEmptyMetrics(): SettlementMetrics {
    return {
      totalAttempts: 0,
      successfulSettlements: 0,
      failedSettlements: 0,
      duplicatesPrevented: 0,
      voidBets: 0,
      wonBets: 0,
      lostBets: 0,
      totalProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      minProcessingTimeMs: Number.MAX_SAFE_INTEGER,
      errors: new Map(),
      lastReset: new Date()
    };
  }

  /**
   * Record a settlement attempt
   */
  recordSettlement(event: SettlementEvent): void {
    this.metrics.totalAttempts++;

    if (event.success) {
      this.metrics.successfulSettlements++;
      this.circuitBreaker.failures = 0; // Reset on success

      // Track bet outcome
      if (event.finalStatus === 'won') this.metrics.wonBets++;
      else if (event.finalStatus === 'lost') this.metrics.lostBets++;
      else if (event.finalStatus === 'void') this.metrics.voidBets++;

      // Track processing time
      this.metrics.totalProcessingTimeMs += event.processingTimeMs;
      this.metrics.maxProcessingTimeMs = Math.max(
        this.metrics.maxProcessingTimeMs,
        event.processingTimeMs
      );
      this.metrics.minProcessingTimeMs = Math.min(
        this.metrics.minProcessingTimeMs,
        event.processingTimeMs
      );

      // Check circuit breaker state
      this.checkCircuitBreaker();
    } else {
      this.metrics.failedSettlements++;
      
      // Track error type
      if (event.error) {
        const errorCount = this.metrics.errors.get(event.error) || 0;
        this.metrics.errors.set(event.error, errorCount + 1);
      }

      // Update circuit breaker
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = new Date();

      if (this.circuitBreaker.failures >= this.failureThreshold) {
        this.openCircuit();
      }
    }

    // Store event
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.pop();
    }
  }

  /**
   * Record duplicate settlement prevention
   */
  recordDuplicatePrevented(betId: string, currentStatus: string): void {
    this.metrics.duplicatesPrevented++;
    logger.warn(`[SETTLEMENT] Duplicate prevented for bet ${betId} (current status: ${currentStatus})`);
  }

  /**
   * Check and update circuit breaker state
   */
  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === 'open' && this.circuitBreaker.openedAt) {
      const timeSinceOpen = Date.now() - this.circuitBreaker.openedAt.getTime();
      if (timeSinceOpen > this.resetTimeout) {
        this.circuitBreaker.state = 'half-open';
        logger.info('[SETTLEMENT] Circuit breaker moved to half-open state');
      }
    } else if (this.circuitBreaker.state === 'half-open') {
      // If we got a success in half-open state, close the circuit
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.openedAt = null;
      logger.success('[SETTLEMENT] Circuit breaker closed - system recovered');
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    if (this.circuitBreaker.state !== 'open') {
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.openedAt = new Date();
      logger.error(`[SETTLEMENT] Circuit breaker OPENED - too many failures (${this.circuitBreaker.failures})`);
    }
  }

  /**
   * Check if circuit breaker allows operation
   */
  isCircuitOpen(): boolean {
    this.checkCircuitBreaker(); // Update state if needed
    return this.circuitBreaker.state === 'open';
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      threshold: this.failureThreshold,
      lastFailure: this.circuitBreaker.lastFailure?.toISOString() || null,
      openedAt: this.circuitBreaker.openedAt?.toISOString() || null
    };
  }

  /**
   * Get success rate
   */
  getSuccessRate(): number {
    if (this.metrics.totalAttempts === 0) return 100;
    return (this.metrics.successfulSettlements / this.metrics.totalAttempts) * 100;
  }

  /**
   * Get average processing time
   */
  getAverageProcessingTime(): number {
    if (this.metrics.successfulSettlements === 0) return 0;
    return this.metrics.totalProcessingTimeMs / this.metrics.successfulSettlements;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const successRate = this.getSuccessRate();
    const avgProcessingTime = this.getAverageProcessingTime();
    const uptime = Math.floor((Date.now() - this.metrics.lastReset.getTime()) / 1000);

    return {
      overview: {
        totalAttempts: this.metrics.totalAttempts,
        successfulSettlements: this.metrics.successfulSettlements,
        failedSettlements: this.metrics.failedSettlements,
        duplicatesPrevented: this.metrics.duplicatesPrevented,
        successRate: successRate.toFixed(2) + '%',
        uptime: uptime
      },
      betOutcomes: {
        won: this.metrics.wonBets,
        lost: this.metrics.lostBets,
        void: this.metrics.voidBets
      },
      performance: {
        averageProcessingTimeMs: avgProcessingTime.toFixed(2),
        maxProcessingTimeMs: this.metrics.maxProcessingTimeMs,
        minProcessingTimeMs: this.metrics.minProcessingTimeMs === Number.MAX_SAFE_INTEGER 
          ? 0 
          : this.metrics.minProcessingTimeMs,
        throughput: uptime > 0 ? (this.metrics.successfulSettlements / uptime * 60).toFixed(2) + ' settlements/min' : '0 settlements/min'
      },
      errors: Object.fromEntries(this.metrics.errors),
      circuitBreaker: this.getCircuitBreakerStatus(),
      health: this.getHealthStatus(successRate)
    };
  }

  /**
   * Get health status
   */
  private getHealthStatus(successRate: number): string {
    if (this.circuitBreaker.state === 'open') {
      return 'CRITICAL - Circuit breaker open';
    }
    if (successRate >= 99) return 'Excellent - High reliability';
    if (successRate >= 95) return 'Good - Normal operation';
    if (successRate >= 90) return 'Fair - Some failures detected';
    if (successRate >= 80) return 'Poor - High failure rate';
    return 'Critical - System degraded';
  }

  /**
   * Get recent failed settlements
   */
  getRecentFailures(limit: number = 10): SettlementEvent[] {
    return this.recentEvents
      .filter(e => !e.success)
      .slice(0, limit);
  }

  /**
   * Get recent successful settlements
   */
  getRecentSuccesses(limit: number = 10): SettlementEvent[] {
    return this.recentEvents
      .filter(e => e.success)
      .slice(0, limit);
  }

  /**
   * Get summary for logging
   */
  getSummary(): string {
    const stats = this.getStats();
    return `Settlements: ${stats.overview.successfulSettlements}/${stats.overview.totalAttempts} (${stats.overview.successRate}) | ` +
           `Avg: ${stats.performance.averageProcessingTimeMs}ms | ` +
           `Circuit: ${stats.circuitBreaker.state} | ` +
           `Won: ${stats.betOutcomes.won}, Lost: ${stats.betOutcomes.lost}, Void: ${stats.betOutcomes.void}`;
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
    this.recentEvents = [];
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      state: 'closed',
      openedAt: null
    };
    logger.info('[SETTLEMENT] Metrics reset');
  }

  /**
   * Check if system is healthy enough to process settlements
   */
  isHealthy(): boolean {
    // Don't allow settlements if circuit is open
    if (this.isCircuitOpen()) {
      return false;
    }

    // Check success rate (warn if below 95%)
    const successRate = this.getSuccessRate();
    if (successRate < 95 && this.metrics.totalAttempts > 10) {
      logger.warn(`[SETTLEMENT] Low success rate: ${successRate.toFixed(2)}%`);
    }

    return true;
  }
}

export const settlementMonitor = new SettlementMonitor();
