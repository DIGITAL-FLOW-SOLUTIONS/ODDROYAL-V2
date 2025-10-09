/**
 * Memory Cache Manager - Ultra-fast in-memory cache layer
 * 
 * Professional betting sites use multi-layer caching:
 * 1. Memory cache (fastest, this file)
 * 2. Redis cache (fast, shared across instances)
 * 3. API calls (slowest, source of truth)
 * 
 * This provides microsecond-level read performance for frequently accessed data
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  lastAccessed: number; // For LRU tracking
}

export class MemoryCacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
    
    // Clean up expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000);
  }

  /**
   * Set data in memory cache with TTL and LRU eviction
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    // LRU EVICTION: If at capacity, remove least recently used entry
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      data: value,
      timestamp: now,
      ttl: ttlSeconds * 1000, // Convert to milliseconds
      lastAccessed: now,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`🗑️  LRU eviction: removed ${oldestKey}`);
    }
  }

  /**
   * Get data from memory cache
   * Returns null if not found or expired
   * Updates lastAccessed for LRU tracking
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    
    // Return null if expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now();
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Get data with metadata (includes freshness info)
   */
  getWithMetadata<T>(key: string): {
    data: T | null;
    metadata: {
      age?: number;
      remainingTtl?: number;
      isStale?: boolean;
    };
  } {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { data: null, metadata: {} };
    }

    const age = Date.now() - entry.timestamp;
    const remainingTtl = Math.max(0, entry.ttl - age);
    const isStale = remainingTtl < entry.ttl * 0.2; // Stale if < 20% TTL remaining

    // If expired, delete and return null
    if (age > entry.ttl) {
      this.cache.delete(key);
      return { data: null, metadata: {} };
    }

    return {
      data: entry.data as T,
      metadata: {
        age,
        remainingTtl,
        isStale,
      },
    };
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`🧹 Memory cache cleanup: removed ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let totalEntries = 0;
    let expiredEntries = 0;
    let staleEntries = 0;

    for (const [, entry] of this.cache.entries()) {
      totalEntries++;
      const age = now - entry.timestamp;
      
      if (age > entry.ttl) {
        expiredEntries++;
      } else if (age > entry.ttl * 0.8) {
        staleEntries++;
      }
    }

    return {
      totalEntries,
      expiredEntries,
      staleEntries,
      freshEntries: totalEntries - expiredEntries - staleEntries,
      maxEntries: this.maxEntries,
      utilizationPercent: ((totalEntries / this.maxEntries) * 100).toFixed(2) + '%',
    };
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Export singleton instance
export const memoryCache = new MemoryCacheManager();
