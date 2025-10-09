/**
 * Markets Cache Service
 * Handles localStorage caching of match markets for instant loading
 */

export interface CachedMarket {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  status: string;
  kickoffTime: string;
  markets: any[];
  lastUpdate: string;
  expiresAt: string;
}

const CACHE_PREFIX = 'oddroyal_market_';
const CACHE_INDEX_KEY = 'oddroyal_markets_index';
const CACHE_DURATION_HOURS = 24;

class MarketsCache {
  /**
   * Get market from localStorage
   */
  getMarket(matchId: string): CachedMarket | null {
    try {
      const key = `${CACHE_PREFIX}${matchId}`;
      const cached = localStorage.getItem(key);
      
      if (!cached) return null;
      
      const data: CachedMarket = JSON.parse(cached);
      
      // Check if expired
      if (new Date(data.expiresAt) < new Date()) {
        this.removeMarket(matchId);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error reading market from cache:', error);
      return null;
    }
  }

  /**
   * Save market to localStorage
   */
  setMarket(matchId: string, data: Omit<CachedMarket, 'expiresAt'>): void {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);
      
      const cachedData: CachedMarket = {
        ...data,
        expiresAt: expiresAt.toISOString(),
      };
      
      const key = `${CACHE_PREFIX}${matchId}`;
      localStorage.setItem(key, JSON.stringify(cachedData));
      
      // Update index
      this.updateIndex(matchId);
    } catch (error) {
      console.error('Error saving market to cache:', error);
      // If quota exceeded, clear old markets and retry
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.clearOldMarkets();
        try {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS);
          
          const cachedData: CachedMarket = {
            ...data,
            expiresAt: expiresAt.toISOString(),
          };
          
          const key = `${CACHE_PREFIX}${matchId}`;
          localStorage.setItem(key, JSON.stringify(cachedData));
          this.updateIndex(matchId);
        } catch (retryError) {
          console.error('Failed to save even after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * Remove specific market from cache
   */
  removeMarket(matchId: string): void {
    try {
      const key = `${CACHE_PREFIX}${matchId}`;
      localStorage.removeItem(key);
      this.removeFromIndex(matchId);
    } catch (error) {
      console.error('Error removing market from cache:', error);
    }
  }

  /**
   * Update the index of cached markets
   */
  private updateIndex(matchId: string): void {
    try {
      const index = this.getIndex();
      if (!index.includes(matchId)) {
        index.push(matchId);
        localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
      }
    } catch (error) {
      console.error('Error updating cache index:', error);
    }
  }

  /**
   * Remove match from index
   */
  private removeFromIndex(matchId: string): void {
    try {
      const index = this.getIndex();
      const filtered = index.filter(id => id !== matchId);
      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing from cache index:', error);
    }
  }

  /**
   * Get list of all cached match IDs
   */
  private getIndex(): string[] {
    try {
      const index = localStorage.getItem(CACHE_INDEX_KEY);
      return index ? JSON.parse(index) : [];
    } catch (error) {
      console.error('Error reading cache index:', error);
      return [];
    }
  }

  /**
   * Get all cached markets
   */
  getAllMarkets(): CachedMarket[] {
    const index = this.getIndex();
    const markets: CachedMarket[] = [];
    
    for (const matchId of index) {
      const market = this.getMarket(matchId);
      if (market) {
        markets.push(market);
      }
    }
    
    return markets;
  }

  /**
   * Clear expired markets from cache
   */
  clearOldMarkets(): number {
    const index = this.getIndex();
    let cleared = 0;
    
    for (const matchId of index) {
      const market = this.getMarket(matchId);
      
      // Remove if expired or kickoff was more than 24 hours ago
      if (!market) {
        this.removeMarket(matchId);
        cleared++;
      } else {
        const kickoffDate = new Date(market.kickoffTime);
        const dayAgo = new Date();
        dayAgo.setHours(dayAgo.getHours() - 24);
        
        if (kickoffDate < dayAgo) {
          this.removeMarket(matchId);
          cleared++;
        }
      }
    }
    
    console.log(`🧹 Cleared ${cleared} old markets from cache`);
    return cleared;
  }

  /**
   * Preload all markets from server
   */
  async preloadAllMarkets(): Promise<void> {
    try {
      console.log('📦 Preloading markets cache...');
      
      const response = await fetch('/api/markets/all');
      if (!response.ok) {
        throw new Error('Failed to fetch markets');
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        const markets = result.data.markets || [];
        
        for (const market of markets) {
          this.setMarket(market.matchId, {
            matchId: market.matchId,
            homeTeam: market.homeTeam,
            awayTeam: market.awayTeam,
            league: market.league,
            sport: market.sport,
            status: market.status,
            kickoffTime: market.kickoffTime,
            markets: market.markets,
            lastUpdate: market.lastUpdate || new Date().toISOString(),
          });
        }
        
        console.log(`✅ Preloaded ${markets.length} markets to cache`);
      }
    } catch (error) {
      console.error('❌ Error preloading markets:', error);
    }
  }

  /**
   * Update markets for live matches
   */
  async updateLiveMarkets(): Promise<void> {
    try {
      const cachedMarkets = this.getAllMarkets();
      const liveMatches = cachedMarkets.filter(m => m.status === 'live');
      
      if (liveMatches.length === 0) return;
      
      console.log(`🔄 Updating ${liveMatches.length} live markets...`);
      
      // Fetch updates for live matches
      for (const match of liveMatches) {
        try {
          const response = await fetch(`/api/match/${match.matchId}/markets`);
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              this.setMarket(match.matchId, {
                ...match,
                markets: result.data.markets,
                lastUpdate: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          console.error(`Error updating live market ${match.matchId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error updating live markets:', error);
    }
  }

  /**
   * Clear all markets from cache
   */
  clearAll(): void {
    try {
      const index = this.getIndex();
      for (const matchId of index) {
        const key = `${CACHE_PREFIX}${matchId}`;
        localStorage.removeItem(key);
      }
      localStorage.removeItem(CACHE_INDEX_KEY);
      console.log('🧹 Cleared all markets from cache');
    } catch (error) {
      console.error('Error clearing all markets:', error);
    }
  }

  /**
   * Get cache stats
   */
  getStats(): { total: number; live: number; prematch: number; size: string } {
    const markets = this.getAllMarkets();
    const live = markets.filter(m => m.status === 'live').length;
    const prematch = markets.filter(m => m.status !== 'live').length;
    
    // Calculate approximate size
    let totalSize = 0;
    for (const matchId of this.getIndex()) {
      const key = `${CACHE_PREFIX}${matchId}`;
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length * 2; // Approximate bytes (UTF-16)
      }
    }
    
    const sizeKB = (totalSize / 1024).toFixed(2);
    
    return {
      total: markets.length,
      live,
      prematch,
      size: `${sizeKB} KB`,
    };
  }
}

// Export singleton instance
export const marketsCache = new MarketsCache();
