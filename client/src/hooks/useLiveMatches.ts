/**
 * Custom hook for fetching and caching live matches
 * 
 * Features:
 * - Instant page load from localStorage cache
 * - Background refresh every 10 seconds
 * - Incremental updates (merge instead of replace)
 * - Automatic odds change detection
 * - Optimistic UI updates
 */

import { useQuery } from '@tanstack/react-query';
import { 
  mergeMatches, 
  getCachedMatches,
  getCachedMatchesGrouped,
  getCacheStats,
  type CachedMatch
} from '@/lib/liveMatchesCache';
import { useEffect, useRef } from 'react';

/**
 * Helper function to get sport icon emoji
 */
function getSportIcon(sportKey: string): string {
  const icons: Record<string, string> = {
    football: '⚽',
    basketball: '🏀',
    americanfootball: '🏈',
    baseball: '⚾',
    icehockey: '🏒',
    cricket: '🏏',
    mma: '🥊',
  };
  return icons[sportKey] || '🏆';
}

export interface LiveMatchesData {
  sports: Array<{
    sport_key: string;
    sport_title: string;
    sport_icon: string;
    leagues: Array<{
      league_id: string;
      league_name: string;
      matches: CachedMatch[];
    }>;
    total_matches: number;
  }>;
  total_sports: number;
  total_matches: number;
  cache_source?: string;
  timestamp?: string;
}

export function useLiveMatches() {
  const previousDataRef = useRef<any>(null);
  const lastSuccessfulFetchRef = useRef<number>(Date.now());
  
  const query = useQuery({
    queryKey: ['/api/live/matches'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/live/matches', {
          signal: AbortSignal.timeout(15000), // 15 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to fetch live matches`);
        }
        
        const result = await response.json();
      
      if (result.success && result.data) {
        // Extract all matches from the response
        const allMatches: any[] = [];
        
        if (result.data.sports) {
          for (const sport of result.data.sports) {
            for (const league of sport.leagues) {
              for (const match of league.matches) {
                allMatches.push({
                  ...match,
                  sport_key: sport.sport_key,
                  league_id: league.league_id,
                  league_name: league.league_name,
                });
              }
            }
          }
        }
        
        // Merge with localStorage (incremental update)
        mergeMatches(allMatches);
        
        // Store for comparison on next update
        previousDataRef.current = result.data;
        lastSuccessfulFetchRef.current = Date.now();
        
        return result.data as LiveMatchesData;
      }
      
      throw new Error('Invalid response format');
    } catch (error) {
      // If we have cached data and the error is a network issue, use cached data
      const cached = getCachedMatchesGrouped();
      const timeSinceLastSuccess = Date.now() - lastSuccessfulFetchRef.current;
      
      if (cached.length > 0 && timeSinceLastSuccess < 120000) {
        // If we have fresh-ish cached data (< 2 minutes old), use it
        console.warn('Using cached data due to fetch error:', error);
        
        const sports = cached.map((sportGroup: any) => {
          const totalMatches = sportGroup.leagues.reduce(
            (sum: number, league: any) => sum + league.matches.length,
            0
          );
          
          return {
            sport_key: sportGroup.sport_key,
            sport_title: sportGroup.sport_key.charAt(0).toUpperCase() + sportGroup.sport_key.slice(1),
            sport_icon: getSportIcon(sportGroup.sport_key),
            leagues: sportGroup.leagues,
            total_matches: totalMatches,
          };
        });
        
        const totalMatches = sports.reduce((sum: number, s: any) => sum + s.total_matches, 0);
        
        return {
          sports,
          total_sports: sports.length,
          total_matches: totalMatches,
          cache_source: 'localStorage_fallback',
        };
      }
      
      // If no cached data or too old, throw the error
      throw error;
    }
    },
    // Aggressive refetch for live betting
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
    gcTime: 60000, // Keep in memory for 1 minute
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: 2000,
    // CRITICAL: Use placeholder data from cache for instant load
    placeholderData: () => {
      // Return cached data immediately while fetching fresh data
      const cached = getCachedMatchesGrouped();
      
      if (cached.length === 0) {
        return previousDataRef.current || undefined;
      }
      
      // Transform cached data to match API format
      const sports = cached.map((sportGroup: any) => {
        const totalMatches = sportGroup.leagues.reduce(
          (sum: number, league: any) => sum + league.matches.length,
          0
        );
        
        return {
          sport_key: sportGroup.sport_key,
          sport_title: sportGroup.sport_key.charAt(0).toUpperCase() + sportGroup.sport_key.slice(1),
          sport_icon: getSportIcon(sportGroup.sport_key),
          leagues: sportGroup.leagues,
          total_matches: totalMatches,
        };
      });
      
      const totalMatches = sports.reduce((sum: number, s: any) => sum + s.total_matches, 0);
      
      return {
        sports,
        total_sports: sports.length,
        total_matches: totalMatches,
        cache_source: 'localStorage',
      };
    },
  });
  
  // Log cache stats on mount for debugging
  useEffect(() => {
    const stats = getCacheStats();
    console.log('📊 Live Matches Cache Stats:', stats);
  }, []);
  
  return query;
}

/**
 * Hook to get a specific live match by ID from cache
 */
export function useLiveMatch(matchId: string) {
  const cachedMatches = getCachedMatches();
  return cachedMatches.find(m => m.match_id === matchId) || null;
}

/**
 * Hook to get cache statistics
 */
export function useLiveMatchesCache() {
  return {
    stats: getCacheStats(),
    matches: getCachedMatches(),
    matchesGrouped: getCachedMatchesGrouped(),
  };
}
