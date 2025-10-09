/**
 * Cache Monitor - Professional cache health and validation tracking
 * 
 * Monitors:
 * - Cache hit/miss rates
 * - Data freshness (age tracking)
 * - Cache invalidation events
 * - Performance metrics
 */

interface CacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  errors: number;
  totalRequests: number;
  lastReset: Date;
}

interface LayerMetrics {
  memory: CacheMetrics;
  redis: CacheMetrics;
  api: CacheMetrics;
}

class CacheMonitor {
  private metrics: LayerMetrics = {
    memory: this.createEmptyMetrics(),
    redis: this.createEmptyMetrics(),
    api: this.createEmptyMetrics(),
  };

  private createEmptyMetrics(): CacheMetrics {
    return {
      hits: 0,
      misses: 0,
      invalidations: 0,
      errors: 0,
      totalRequests: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Record a cache hit
   */
  recordHit(layer: 'memory' | 'redis' | 'api'): void {
    this.metrics[layer].hits++;
    this.metrics[layer].totalRequests++;
  }

  /**
   * Record a cache miss
   */
  recordMiss(layer: 'memory' | 'redis' | 'api'): void {
    this.metrics[layer].misses++;
    this.metrics[layer].totalRequests++;
  }

  /**
   * Record a cache invalidation
   */
  recordInvalidation(layer: 'memory' | 'redis'): void {
    this.metrics[layer].invalidations++;
  }

  /**
   * Record an error
   */
  recordError(layer: 'memory' | 'redis' | 'api'): void {
    this.metrics[layer].errors++;
  }

  /**
   * Get cache hit rate for a layer
   */
  getHitRate(layer: 'memory' | 'redis' | 'api'): number {
    const total = this.metrics[layer].totalRequests;
    if (total === 0) return 0;
    return (this.metrics[layer].hits / total) * 100;
  }

  /**
   * Get overall statistics
   */
  getStats() {
    const memoryHitRate = this.getHitRate('memory');
    const redisHitRate = this.getHitRate('redis');
    const apiHitRate = this.getHitRate('api');

    const totalHits = this.metrics.memory.hits + this.metrics.redis.hits + this.metrics.api.hits;
    const totalRequests = this.metrics.memory.totalRequests + this.metrics.redis.totalRequests + this.metrics.api.totalRequests;
    const overallHitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;

    return {
      layers: {
        memory: {
          hits: this.metrics.memory.hits,
          misses: this.metrics.memory.misses,
          hitRate: memoryHitRate.toFixed(2) + '%',
          invalidations: this.metrics.memory.invalidations,
          errors: this.metrics.memory.errors,
          totalRequests: this.metrics.memory.totalRequests,
        },
        redis: {
          hits: this.metrics.redis.hits,
          misses: this.metrics.redis.misses,
          hitRate: redisHitRate.toFixed(2) + '%',
          invalidations: this.metrics.redis.invalidations,
          errors: this.metrics.redis.errors,
          totalRequests: this.metrics.redis.totalRequests,
        },
        api: {
          hits: this.metrics.api.hits,
          misses: this.metrics.api.misses,
          hitRate: apiHitRate.toFixed(2) + '%',
          errors: this.metrics.api.errors,
          totalRequests: this.metrics.api.totalRequests,
        },
      },
      overall: {
        hitRate: overallHitRate.toFixed(2) + '%',
        totalHits,
        totalRequests,
        uptime: Math.floor((Date.now() - this.metrics.memory.lastReset.getTime()) / 1000),
      },
      interpretation: {
        memoryEfficiency: this.getEfficiencyLevel(memoryHitRate),
        redisEfficiency: this.getEfficiencyLevel(redisHitRate),
        cacheHealth: this.getCacheHealth(memoryHitRate, redisHitRate),
      },
    };
  }

  /**
   * Get efficiency level description
   */
  private getEfficiencyLevel(hitRate: number): string {
    if (hitRate >= 90) return 'Excellent (>90%)';
    if (hitRate >= 75) return 'Good (75-90%)';
    if (hitRate >= 50) return 'Fair (50-75%)';
    if (hitRate >= 25) return 'Poor (25-50%)';
    return 'Critical (<25%)';
  }

  /**
   * Get overall cache health status
   */
  private getCacheHealth(memoryRate: number, redisRate: number): string {
    const avgRate = (memoryRate + redisRate) / 2;
    
    if (avgRate >= 80) return 'Healthy - Multi-layer caching working optimally';
    if (avgRate >= 60) return 'Good - Cache layers performing well';
    if (avgRate >= 40) return 'Fair - Consider optimizing cache TTLs';
    if (avgRate >= 20) return 'Poor - Cache layers need attention';
    return 'Critical - Investigate cache configuration';
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  reset(): void {
    this.metrics = {
      memory: this.createEmptyMetrics(),
      redis: this.createEmptyMetrics(),
      api: this.createEmptyMetrics(),
    };
    console.log('📊 Cache metrics reset');
  }

  /**
   * Get summary for logging
   */
  getSummary(): string {
    const stats = this.getStats();
    return `Memory: ${stats.layers.memory.hitRate} (${stats.layers.memory.hits}/${stats.layers.memory.totalRequests}) | ` +
           `Redis: ${stats.layers.redis.hitRate} (${stats.layers.redis.hits}/${stats.layers.redis.totalRequests}) | ` +
           `Overall: ${stats.overall.hitRate}`;
  }
}

export const cacheMonitor = new CacheMonitor();
