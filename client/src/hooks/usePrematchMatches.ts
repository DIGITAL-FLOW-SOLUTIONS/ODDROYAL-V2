/**
 * Hook for Line/Prematch Matches with LocalStorage Cache
 * 
 * Provides instant loading from cache and background refresh
 */

import { useQuery } from '@tanstack/react-query';
import { getPrematchCache, savePrematchCache } from '@/lib/prematchCache';
import { useEffect, useRef } from 'react';

export interface PrematchMatchesData {
  sportGroups: Array<{
    id: string;
    name: string;
    icon?: string;
    leagues: Array<{
      id: string;
      name: string;
      matches: any[];
    }>;
  }>;
  allMatches: any[];
}

export function usePrematchMatches() {
  const previousDataRef = useRef<any>(null);
  const lastSuccessfulFetchRef = useRef<number>(Date.now());
  
  const query = useQuery({
    queryKey: ['/api/prematch/matches'],
    queryFn: async () => {
      try {
        // Fetch menu to get sports and leagues
        const menuResponse = await fetch('/api/menu?mode=prematch', {
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        if (!menuResponse.ok) {
          throw new Error('Failed to fetch menu');
        }
        
        const menuResult = await menuResponse.json();
        
        if (!menuResult.success || !menuResult.data.sports) {
          throw new Error('Invalid menu response');
        }

        const sportGroups: any[] = [];
        const allMatches: any[] = [];
        
        // Fetch all sports/leagues in parallel
        const fetchPromises = menuResult.data.sports.map(async (sport: any) => {
          const sportLeagues: any[] = [];
          
          // Fetch all leagues for this sport in parallel
          const leaguePromises = sport.leagues.map(async (league: any) => {
            try {
              const lineResponse = await fetch(
                `/api/line/${sport.sport_key}/${league.league_id}?mode=prematch`,
                { signal: AbortSignal.timeout(30000) }
              );
              
              if (lineResponse.ok) {
                const lineResult = await lineResponse.json();
                if (lineResult.success && lineResult.data.matches) {
                  const leagueMatches = lineResult.data.matches.map((match: any) => {
                    const matchData = {
                      id: match.match_id,
                      homeTeam: {
                        name: match.home_team,
                        logo: match.home_team_logo,
                      },
                      awayTeam: {
                        name: match.away_team,
                        logo: match.away_team_logo,
                      },
                      league: league.league_name,
                      kickoffTime: match.commence_time,
                      venue: match.venue,
                      odds: match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h')
                        ? {
                            home: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
                            draw: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === 'Draw')?.price || 0,
                            away: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
                          }
                        : null,
                      homeTeamLogo: match.home_team_logo,
                      awayTeamLogo: match.away_team_logo,
                    };
                    allMatches.push(matchData);
                    return matchData;
                  });
                  
                  sportLeagues.push({
                    id: league.league_id,
                    name: league.league_name,
                    matches: leagueMatches,
                  });
                }
              }
            } catch (error) {
              console.warn(`Failed to fetch league ${league.league_id}:`, error);
            }
          });

          await Promise.all(leaguePromises);
          
          if (sportLeagues.length > 0) {
            sportGroups.push({
              id: sport.sport_key,
              name: sport.sport_title,
              icon: sport.sport_icon,
              leagues: sportLeagues,
            });
          }
        });

        await Promise.all(fetchPromises);
        
        // Save to localStorage cache
        if (sportGroups.length > 0) {
          savePrematchCache({
            sports: sportGroups.map(sg => ({
              sport_key: sg.id,
              sport_title: sg.name,
              leagues: sg.leagues.map((l: any) => ({
                league_id: l.id,
                league_name: l.name,
                matches: l.matches,
              })),
            })),
          });
        }
        
        previousDataRef.current = { sportGroups, allMatches };
        lastSuccessfulFetchRef.current = Date.now();
        
        return { sportGroups, allMatches };
      } catch (error) {
        console.error('Error fetching prematch matches:', error);
        
        // If fetch fails and we have cache within 2 minutes, use it
        const cache = getPrematchCache();
        const cacheAge = cache ? Date.now() - cache.timestamp : Infinity;
        
        if (cache && cacheAge < 2 * 60 * 1000) {
          console.log('📦 Using cached prematch data due to fetch error');
          
          // Transform cache to component format
          const sportGroups = cache.sports.map(sport => ({
            id: sport.sport_key,
            name: sport.sport_title,
            icon: '⚽', // Default icon
            leagues: sport.leagues.map(league => ({
              id: league.league_id,
              name: league.league_name,
              matches: league.matches,
            })),
          }));
          
          const allMatches = cache.sports.flatMap(sport =>
            sport.leagues.flatMap(league => league.matches)
          );
          
          return { sportGroups, allMatches };
        }
        
        throw error;
      }
    },
    staleTime: Infinity, // WebSocket handles updates
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Use cache as placeholder data for instant loading
    placeholderData: () => {
      const cache = getPrematchCache();
      if (!cache) return previousDataRef.current;
      
      // Transform cache to component format
      const sportGroups = cache.sports.map(sport => ({
        id: sport.sport_key,
        name: sport.sport_title,
        icon: '⚽',
        leagues: sport.leagues.map(league => ({
          id: league.league_id,
          name: league.league_name,
          matches: league.matches,
        })),
      }));
      
      const allMatches = cache.sports.flatMap(sport =>
        sport.leagues.flatMap(league => league.matches)
      );
      
      return { sportGroups, allMatches };
    },
  });

  return query;
}
