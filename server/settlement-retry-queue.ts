/**
 * Settlement Retry Queue - Ensures no bet is left unsettled
 * 
 * Features:
 * - Redis-based retry queue using Sorted Sets (production-safe)
 * - Exponential backoff retry strategy
 * - Maximum retry attempts with dead letter queue
 * - Priority queue for urgent settlements
 * 
 * Implementation:
 * - Uses ZSET (sorted set) with score = next retry timestamp
 * - No blocking KEYS operations - uses ZRANGEBYSCORE
 * - Atomic operations with proper error handling
 */

import { redisCache } from './redis-cache';
import { logger } from './logger';

interface RetryItem {
  betId: string;
  userId: string;
  attempts: number;
  lastAttempt: number;
  error?: string;
  priority: 'normal' | 'high';
  addedAt: number;
}

export class SettlementRetryQueue {
  // Use sorted sets for production-safe queue management
  private readonly queueZsetKey = 'settlement:retry:zset'; // Score = next retry time
  private readonly dataHashKey = 'settlement:retry:data'; // Hash of betId -> item data
  private readonly deadLetterZsetKey = 'settlement:retry:dead_letter:zset';
  private readonly deadLetterHashKey = 'settlement:retry:dead_letter:data';
  private readonly statsKey = 'settlement:retry:stats';
  private readonly maxRetries = 5;
  private readonly backoffBase = 60000; // 1 minute base delay
  private readonly maxBackoff = 3600000; // 1 hour max delay

  /**
   * Add a bet to the retry queue (using sorted sets)
   */
  async addToRetryQueue(
    betId: string,
    userId: string,
    error?: string,
    priority: 'normal' | 'high' = 'normal'
  ): Promise<void> {
    try {
      const redis = (redisCache as any).client; // Access underlying Redis client
      
      // Check if already in queue
      const existingData = await redis.hget(this.dataHashKey, betId);
      const existing: RetryItem | null = existingData ? JSON.parse(existingData) : null;
      
      if (existing) {
        // Update existing item
        existing.attempts++;
        existing.lastAttempt = Date.now();
        existing.error = error || existing.error;
        
        // Check if max retries exceeded
        if (existing.attempts >= this.maxRetries) {
          await this.moveToDeadLetter(existing);
          logger.error(`[RETRY_QUEUE] Bet ${betId} moved to dead letter queue after ${this.maxRetries} attempts`);
          return;
        }
        
        // Calculate next retry time
        const backoffDelay = Math.min(
          this.backoffBase * Math.pow(2, existing.attempts - 1),
          this.maxBackoff
        );
        const nextRetryTime = Date.now() + backoffDelay;
        
        // Update sorted set score and hash data
        await redis.zadd(this.queueZsetKey, nextRetryTime, betId);
        await redis.hset(this.dataHashKey, betId, JSON.stringify(existing));
        
        // Update stats
        await redis.hincrby(this.statsKey, 'total_retries', 1);
        
        logger.info(`[RETRY_QUEUE] Updated retry item for bet ${betId} (attempt ${existing.attempts}/${this.maxRetries})`);
      } else {
        // Create new retry item
        const item: RetryItem = {
          betId,
          userId,
          attempts: 1,
          lastAttempt: Date.now(),
          error,
          priority,
          addedAt: Date.now()
        };
        
        // Calculate next retry time (first attempt gets immediate retry)
        const nextRetryTime = Date.now() + (priority === 'high' ? 0 : this.backoffBase);
        
        // Add to sorted set and hash
        await redis.zadd(this.queueZsetKey, nextRetryTime, betId);
        await redis.hset(this.dataHashKey, betId, JSON.stringify(item));
        
        // Update stats
        await redis.hincrby(this.statsKey, 'total_added', 1);
        
        logger.info(`[RETRY_QUEUE] Added bet ${betId} to retry queue`);
      }
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to add to retry queue:', error);
    }
  }

  /**
   * Get items ready for retry (using ZRANGEBYSCORE - production safe)
   */
  async getItemsReadyForRetry(limit: number = 10): Promise<RetryItem[]> {
    try {
      const redis = (redisCache as any).client;
      const now = Date.now();

      // Get bet IDs ready for retry (score <= now) using ZRANGEBYSCORE
      const readyBetIds = await redis.zrangebyscore(
        this.queueZsetKey,
        '-inf',
        now,
        'LIMIT',
        0,
        limit
      );

      if (!readyBetIds || readyBetIds.length === 0) {
        return [];
      }

      // Fetch item data from hash
      const items: RetryItem[] = [];
      for (const betId of readyBetIds) {
        const data = await redis.hget(this.dataHashKey, betId);
        if (data) {
          const item = JSON.parse(data);
          items.push(item);
        }
      }

      // Sort by priority (high first) then by age (oldest first)
      items.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority === 'high' ? -1 : 1;
        }
        return a.addedAt - b.addedAt;
      });

      return items;
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to get retry items:', error);
      return [];
    }
  }

  /**
   * Remove item from retry queue (on successful settlement)
   */
  async removeFromRetryQueue(betId: string): Promise<void> {
    try {
      const redis = (redisCache as any).client;
      
      // Remove from sorted set and hash
      await redis.zrem(this.queueZsetKey, betId);
      await redis.hdel(this.dataHashKey, betId);
      
      // Update stats
      await redis.hincrby(this.statsKey, 'total_completed', 1);
      
      logger.info(`[RETRY_QUEUE] Removed bet ${betId} from retry queue (successfully settled)`);
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to remove from retry queue:', error);
    }
  }

  /**
   * Move item to dead letter queue
   */
  private async moveToDeadLetter(item: RetryItem): Promise<void> {
    try {
      const redis = (redisCache as any).client;
      const deadLetterItem = {
        ...item,
        movedToDeadLetterAt: Date.now()
      };
      
      const movedAt = Date.now();
      
      // Add to dead letter sorted set and hash
      await redis.zadd(this.deadLetterZsetKey, movedAt, item.betId);
      await redis.hset(this.deadLetterHashKey, item.betId, JSON.stringify(deadLetterItem));
      
      // Remove from retry queue
      await redis.zrem(this.queueZsetKey, item.betId);
      await redis.hdel(this.dataHashKey, item.betId);
      
      // Update stats
      await redis.hincrby(this.statsKey, 'total_dead_letter', 1);
      
      // Set expiry on dead letter items (7 days)
      await redis.expire(this.deadLetterHashKey, 604800);
      await redis.expire(this.deadLetterZsetKey, 604800);
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to move to dead letter:', error);
    }
  }

  /**
   * Get queue statistics (production-safe using ZCOUNT)
   */
  async getQueueStats() {
    try {
      const redis = (redisCache as any).client;
      const now = Date.now();
      
      // Use ZCOUNT for efficient counting (no blocking)
      const totalInQueue = await redis.zcard(this.queueZsetKey);
      const readyForRetry = await redis.zcount(this.queueZsetKey, '-inf', now);
      const deadLetterCount = await redis.zcard(this.deadLetterZsetKey);
      
      // Get stats from hash
      const stats = await redis.hgetall(this.statsKey);
      
      return {
        totalInQueue,
        readyForRetry,
        deadLetterCount,
        totalAdded: parseInt(stats.total_added || '0'),
        totalRetries: parseInt(stats.total_retries || '0'),
        totalCompleted: parseInt(stats.total_completed || '0'),
        totalDeadLetter: parseInt(stats.total_dead_letter || '0'),
        // Note: Priority and attempt-level stats would require scanning, 
        // which we avoid for production safety. Use audit log for detailed breakdowns.
      };
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to get queue stats:', error);
      return {
        totalInQueue: 0,
        readyForRetry: 0,
        deadLetterCount: 0,
        totalAdded: 0,
        totalRetries: 0,
        totalCompleted: 0,
        totalDeadLetter: 0
      };
    }
  }

  /**
   * Get dead letter items (for manual review/recovery - production safe)
   */
  async getDeadLetterItems(limit: number = 50): Promise<any[]> {
    try {
      const redis = (redisCache as any).client;
      
      // Get recent dead letter items using ZREVRANGE (sorted by moved time, descending)
      const betIds = await redis.zrevrange(this.deadLetterZsetKey, 0, limit - 1);
      
      const items = [];
      for (const betId of betIds) {
        const data = await redis.hget(this.deadLetterHashKey, betId);
        if (data) {
          items.push(JSON.parse(data));
        }
      }
      
      return items;
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to get dead letter items:', error);
      return [];
    }
  }

  /**
   * Manually retry a dead letter item (admin action)
   */
  async retryDeadLetterItem(betId: string): Promise<boolean> {
    try {
      const redis = (redisCache as any).client;
      
      const data = await redis.hget(this.deadLetterHashKey, betId);
      
      if (!data) {
        logger.warn(`[RETRY_QUEUE] Dead letter item not found: ${betId}`);
        return false;
      }
      
      const item = JSON.parse(data);
      
      // Move back to retry queue with reset attempts (high priority for manual retry)
      await this.addToRetryQueue(item.betId, item.userId, item.error, 'high');
      
      // Remove from dead letter
      await redis.zrem(this.deadLetterZsetKey, betId);
      await redis.hdel(this.deadLetterHashKey, betId);
      
      logger.info(`[RETRY_QUEUE] Manually retrying dead letter item: ${betId}`);
      return true;
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to retry dead letter item:', error);
      return false;
    }
  }

  /**
   * Clear old items from queues (maintenance - production safe)
   */
  async clearOldItems(olderThanDays: number = 7): Promise<void> {
    try {
      const redis = (redisCache as any).client;
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      // Clear old items from dead letter using ZREMRANGEBYSCORE
      const deadLetterCleared = await redis.zremrangebyscore(
        this.deadLetterZsetKey,
        '-inf',
        cutoffTime
      );
      
      // Note: For retry queue, we don't clear based on age since items auto-expire
      // when successfully settled or moved to dead letter
      
      logger.info(`[RETRY_QUEUE] Cleared ${deadLetterCleared} old dead letter items`);
    } catch (error) {
      logger.error('[RETRY_QUEUE] Failed to clear old items:', error);
    }
  }
}

export const settlementRetryQueue = new SettlementRetryQueue();
