/**
 * Prematch/Line Matches LocalStorage Cache
 * 
 * Provides instant loading for Line page by caching all prematch data
 * in localStorage when the homepage loads.
 */

const CACHE_KEY = 'prematch_matches_cache';
const CACHE_VERSION = '1.0';
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes for prematch data

export interface PrematchMatch {
  id: string;
  match_id: string;
  sport_key: string;
  league_id: string;
  league_name: string;
  home_team: string;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  commence_time: string;
  venue?: string;
  odds?: {
    home: number;
    draw: number;
    away: number;
  };
  bookmakers?: any[];
}

export interface PrematchCacheData {
  version: string;
  timestamp: number;
  sports: Array<{
    sport_key: string;
    sport_title: string;
    leagues: Array<{
      league_id: string;
      league_name: string;
      matches: PrematchMatch[];
    }>;
  }>;
}

/**
 * Get the entire prematch cache
 */
export function getPrematchCache(): PrematchCacheData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    
    // Version check
    if (parsed.version !== CACHE_VERSION) {
      console.log('Prematch cache version mismatch, clearing cache');
      clearPrematchCache();
      return null;
    }

    // Age check
    const age = Date.now() - parsed.timestamp;
    if (age > MAX_AGE_MS) {
      console.log('Prematch cache expired, clearing cache');
      clearPrematchCache();
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Error reading prematch cache:', error);
    return null;
  }
}

/**
 * Save prematch data to cache
 */
export function savePrematchCache(data: Omit<PrematchCacheData, 'version' | 'timestamp'>): void {
  try {
    const cacheData: PrematchCacheData = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      ...data,
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    console.log('✅ Prematch cache saved', {
      sports: data.sports.length,
      totalMatches: data.sports.reduce((sum, s) => 
        sum + s.leagues.reduce((lsum, l) => lsum + l.matches.length, 0), 0
      ),
    });
  } catch (error) {
    console.error('Error saving prematch cache:', error);
    // If quota exceeded, clear and try again
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearPrematchCache();
      try {
        const cacheData: PrematchCacheData = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          ...data,
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } catch (retryError) {
        console.error('Failed to save prematch cache even after clearing:', retryError);
      }
    }
  }
}

/**
 * Clear the prematch cache
 */
export function clearPrematchCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️ Prematch cache cleared');
  } catch (error) {
    console.error('Error clearing prematch cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getPrematchCacheStats() {
  const cache = getPrematchCache();
  
  if (!cache) {
    return {
      exists: false,
      age: 0,
      sports: 0,
      leagues: 0,
      matches: 0,
      size: '0 KB',
    };
  }

  const age = Date.now() - cache.timestamp;
  const ageInMinutes = Math.floor(age / 60000);
  
  const totalLeagues = cache.sports.reduce((sum, s) => sum + s.leagues.length, 0);
  const totalMatches = cache.sports.reduce((sum, s) => 
    sum + s.leagues.reduce((lsum, l) => lsum + l.matches.length, 0), 0
  );

  const sizeInBytes = new Blob([localStorage.getItem(CACHE_KEY) || '']).size;
  const sizeInKB = (sizeInBytes / 1024).toFixed(2);

  return {
    exists: true,
    age: `${ageInMinutes} min ago`,
    sports: cache.sports.length,
    leagues: totalLeagues,
    matches: totalMatches,
    size: `${sizeInKB} KB`,
  };
}
