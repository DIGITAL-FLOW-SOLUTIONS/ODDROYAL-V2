/**
 * Data Prefetch Hook
 * 
 * Runs on homepage load to prefetch Live and Line page data
 * into localStorage so navigation is instant.
 */

import { useEffect, useRef, useState } from 'react';
import { mergeMatches as mergeLiveMatches } from '@/lib/liveMatchesCache';
import { savePrematchCache } from '@/lib/prematchCache';

export function useDataPrefetch() {
  const [status, setStatus] = useState<{
    live: 'idle' | 'loading' | 'success' | 'error';
    prematch: 'idle' | 'loading' | 'success' | 'error';
  }>({
    live: 'idle',
    prematch: 'idle',
  });

  const hasStartedRef = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    console.log('🚀 Starting data prefetch for Live and Line pages...');

    // Prefetch Live data
    const prefetchLive = async () => {
      setStatus(prev => ({ ...prev, live: 'loading' }));
      try {
        const response = await fetch('/api/live/matches', {
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to prefetch live matches`);
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
          
          // Save to localStorage
          mergeLiveMatches(allMatches);
          setStatus(prev => ({ ...prev, live: 'success' }));
          console.log('✅ Live data prefetched and cached', { matches: allMatches.length });
        }
      } catch (error) {
        console.error('❌ Failed to prefetch live data:', error);
        setStatus(prev => ({ ...prev, live: 'error' }));
      }
    };

    // Prefetch Prematch/Line data
    const prefetchPrematch = async () => {
      setStatus(prev => ({ ...prev, prematch: 'loading' }));
      try {
        // First fetch menu to get sports and leagues
        const menuResponse = await fetch('/api/menu?mode=prematch', {
          signal: AbortSignal.timeout(30000),
        });
        
        if (!menuResponse.ok) {
          throw new Error('Failed to prefetch menu');
        }
        
        const menuResult = await menuResponse.json();
        
        if (!menuResult.success || !menuResult.data.sports) {
          throw new Error('Invalid menu response');
        }

        const sportGroups: any[] = [];
        
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
                  const leagueMatches = lineResult.data.matches.map((match: any) => ({
                    id: match.match_id,
                    match_id: match.match_id,
                    sport_key: sport.sport_key,
                    league_id: league.league_id,
                    league_name: league.league_name,
                    home_team: match.home_team,
                    away_team: match.away_team,
                    home_team_logo: match.home_team_logo,
                    away_team_logo: match.away_team_logo,
                    commence_time: match.commence_time,
                    venue: match.venue,
                    odds: match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h')
                      ? {
                          home: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
                          draw: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === 'Draw')?.price || 0,
                          away: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
                        }
                      : undefined,
                    bookmakers: match.bookmakers,
                  }));
                  
                  sportLeagues.push({
                    league_id: league.league_id,
                    league_name: league.league_name,
                    matches: leagueMatches,
                  });
                }
              }
            } catch (error) {
              console.warn(`Failed to fetch league ${league.league_id}:`, error);
            }
          });

          await Promise.all(leaguePromises);
          
          // Only add sport if it has leagues with matches
          if (sportLeagues.length > 0) {
            sportGroups.push({
              sport_key: sport.sport_key,
              sport_title: sport.sport_title,
              leagues: sportLeagues,
            });
          }
        });

        await Promise.all(fetchPromises);
        
        // Save to localStorage
        savePrematchCache({ sports: sportGroups });
        setStatus(prev => ({ ...prev, prematch: 'success' }));
        
        const totalMatches = sportGroups.reduce((sum, s) => 
          sum + s.leagues.reduce((lsum: number, l: any) => lsum + l.matches.length, 0), 0
        );
        console.log('✅ Prematch data prefetched and cached', { 
          sports: sportGroups.length,
          matches: totalMatches 
        });
      } catch (error) {
        console.error('❌ Failed to prefetch prematch data:', error);
        setStatus(prev => ({ ...prev, prematch: 'error' }));
      }
    };

    // Run both prefetches in parallel
    Promise.all([prefetchLive(), prefetchPrematch()]).then(() => {
      console.log('✅ All data prefetch complete');
    });
  }, []);

  return status;
}
