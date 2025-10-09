/**
 * Live Matches LocalStorage Cache
 * 
 * Provides incremental updates to localStorage instead of wholesale replacement.
 * This ensures:
 * - Faster page loads (data already in browser)
 * - No data loss during updates
 * - Odds change detection by comparing with previous values
 * - Automatic cleanup of stale matches
 */

const CACHE_KEY = 'live_matches_cache';
const CACHE_VERSION = '1.0';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface OddsSnapshot {
  home: number;
  draw: number;
  away: number;
  timestamp: number;
}

export interface CachedMatch {
  match_id: string;
  sport_key: string;
  league_id: string;
  league_name: string;
  home_team: string;
  away_team: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  commence_time: string;
  status: 'live' | 'upcoming' | 'completed';
  scores?: {
    home: number;
    away: number;
  };
  bookmakers?: any[];
  odds?: {
    home: number;
    draw: number;
    away: number;
  };
  odds_deltas?: Record<string, 'up' | 'down' | 'unchanged' | 'locked'>;
  market_status?: 'open' | 'suspended' | 'closed';
  cached_at: number;
  last_odds_snapshot?: OddsSnapshot;
}

export interface CacheData {
  version: string;
  timestamp: number;
  matches: Record<string, CachedMatch>;
}

/**
 * Get the entire cache
 */
export function getCacheData(): CacheData {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) {
      return {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        matches: {},
      };
    }

    const parsed = JSON.parse(stored);
    
    // Version check
    if (parsed.version !== CACHE_VERSION) {
      console.log('Cache version mismatch, clearing cache');
      clearCache();
      return {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        matches: {},
      };
    }

    return parsed;
  } catch (error) {
    console.error('Error reading cache:', error);
    return {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      matches: {},
    };
  }
}

/**
 * Save entire cache
 */
function saveCacheData(data: CacheData): void {
  try {
    data.timestamp = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving cache:', error);
    // If quota exceeded, clear and try again
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearCache();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (retryError) {
        console.error('Failed to save cache even after clearing:', retryError);
      }
    }
  }
}

/**
 * Merge new matches with existing cached matches
 * This is the KEY function for incremental updates
 */
export function mergeMatches(newMatches: any[]): void {
  const cache = getCacheData();
  const now = Date.now();
  
  // Track which matches we've seen in this update
  const seenMatchIds = new Set<string>();
  
  // Process each new match
  for (const match of newMatches) {
    const matchId = match.match_id;
    seenMatchIds.add(matchId);
    
    const existingMatch = cache.matches[matchId];
    
    // Extract current odds
    const currentOdds = extractOdds(match);
    
    // Calculate odds deltas if we have previous data
    let oddsDeltas: Record<string, 'up' | 'down' | 'unchanged' | 'locked'> = {};
    let previousSnapshot: OddsSnapshot | undefined;
    
    if (existingMatch?.last_odds_snapshot && currentOdds) {
      previousSnapshot = existingMatch.last_odds_snapshot;
      oddsDeltas = {
        [match.home_team]: compareOdds(currentOdds.home, previousSnapshot.home),
        'Draw': compareOdds(currentOdds.draw, previousSnapshot.draw),
        [match.away_team]: compareOdds(currentOdds.away, previousSnapshot.away),
      };
    } else if (currentOdds) {
      // First time seeing this match - all unchanged
      oddsDeltas = {
        [match.home_team]: 'unchanged',
        'Draw': 'unchanged',
        [match.away_team]: 'unchanged',
      };
    }
    
    // Merge with existing or create new
    const updatedMatch: CachedMatch = {
      ...match,
      match_id: matchId,
      cached_at: now,
      odds: currentOdds,
      odds_deltas: { ...match.odds_deltas, ...oddsDeltas },
      last_odds_snapshot: currentOdds ? {
        home: currentOdds.home,
        draw: currentOdds.draw,
        away: currentOdds.away,
        timestamp: now,
      } : previousSnapshot,
    };
    
    cache.matches[matchId] = updatedMatch;
  }
  
  // Remove stale matches (not seen in this update or too old)
  for (const matchId in cache.matches) {
    const match = cache.matches[matchId];
    const age = now - match.cached_at;
    
    // Remove if: not in current update AND (match is completed OR too old)
    if (!seenMatchIds.has(matchId) && (match.status === 'completed' || age > MAX_AGE_MS)) {
      delete cache.matches[matchId];
    }
  }
  
  saveCacheData(cache);
}

/**
 * Get all cached matches
 */
export function getCachedMatches(): CachedMatch[] {
  const cache = getCacheData();
  return Object.values(cache.matches);
}

/**
 * Get cached matches grouped by sport and league
 */
export function getCachedMatchesGrouped(): any {
  const matches = getCachedMatches();
  
  const sportGroups = new Map<string, any>();
  
  for (const match of matches) {
    // Only include live matches
    if (match.status !== 'live') continue;
    
    // Get or create sport group
    let sportGroup = sportGroups.get(match.sport_key);
    if (!sportGroup) {
      sportGroup = {
        sport_key: match.sport_key,
        leagues: new Map<string, any>(),
      };
      sportGroups.set(match.sport_key, sportGroup);
    }
    
    // Get or create league
    let league = sportGroup.leagues.get(match.league_id);
    if (!league) {
      league = {
        league_id: match.league_id,
        league_name: match.league_name,
        matches: [],
      };
      sportGroup.leagues.set(match.league_id, league);
    }
    
    league.matches.push(match);
  }
  
  // Convert to array format
  const result: any[] = [];
  sportGroups.forEach(sportGroup => {
    const leagues = Array.from(sportGroup.leagues.values());
    result.push({
      sport_key: sportGroup.sport_key,
      leagues,
    });
  });
  
  return result;
}

/**
 * Extract odds from match data
 */
function extractOdds(match: any): { home: number; draw: number; away: number } | null {
  const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
  
  if (!h2hMarket?.outcomes) return null;
  
  const homeOdds = h2hMarket.outcomes.find((o: any) => o.name === match.home_team)?.price || 0;
  const drawOdds = h2hMarket.outcomes.find((o: any) => o.name === 'Draw')?.price || 0;
  const awayOdds = h2hMarket.outcomes.find((o: any) => o.name === match.away_team)?.price || 0;
  
  return { home: homeOdds, draw: drawOdds, away: awayOdds };
}

/**
 * Compare odds values and determine direction
 */
function compareOdds(
  current: number,
  previous: number
): 'up' | 'down' | 'unchanged' | 'locked' {
  if (current === 0 || current === null || current === undefined) {
    return 'locked';
  }
  
  if (!previous || previous === 0) {
    return 'unchanged';
  }
  
  const diff = current - previous;
  const threshold = 0.01; // Consider changes < 0.01 as unchanged
  
  if (Math.abs(diff) < threshold) {
    return 'unchanged';
  }
  
  return diff > 0 ? 'up' : 'down';
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalMatches: number;
  liveMatches: number;
  cacheSize: string;
  oldestMatch: number;
  newestMatch: number;
} {
  const cache = getCacheData();
  const matches = Object.values(cache.matches);
  
  const liveMatches = matches.filter(m => m.status === 'live').length;
  
  const timestamps = matches.map(m => m.cached_at);
  const oldestMatch = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const newestMatch = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  
  // Calculate cache size
  const cacheString = localStorage.getItem(CACHE_KEY) || '';
  const sizeInBytes = new Blob([cacheString]).size;
  const sizeInKB = (sizeInBytes / 1024).toFixed(2);
  
  return {
    totalMatches: matches.length,
    liveMatches,
    cacheSize: `${sizeInKB} KB`,
    oldestMatch,
    newestMatch,
  };
}
