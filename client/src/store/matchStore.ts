/**
 * Global Match Store - Professional Betting Site Architecture
 * 
 * Normalized data structure for instant access and diff-based updates.
 * All matches (API + manual) stored here for instant page navigation.
 */

import { create } from 'zustand';
import { isLiveByTime } from '@/lib/matchStatusUtils';

export interface Match {
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
  venue?: string;
  market_status?: 'open' | 'suspended' | 'closed';
  source: 'api' | 'manual';
  bookmakers?: any[];
  // Live match specific fields
  live_status?: 'not_started' | 'first_half' | 'halftime' | 'second_half' | 'in_play' | 'finished' | 'postponed' | 'cancelled';
  elapsed_minute?: number;
  last_server_update?: number;
  events?: Array<{
    type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty';
    team: 'home' | 'away';
    minute: number;
    player?: string;
    score_after?: { home: number; away: number };
  }>;
}

export interface Odds {
  match_id: string;
  home: number;
  draw: number;
  away: number;
  timestamp: number;
}

export interface Market {
  market_id: string;
  match_id: string;
  key: string;
  name: string;
  description?: string;
  outcomes: any[];
}

export interface Sport {
  sport_key: string;
  sport_title: string;
  sport_icon?: string;
}

export interface League {
  league_id: string;
  league_name: string;
  sport_key: string;
  match_count: number;
}

interface MatchStore {
  // Normalized data maps for O(1) access
  matches: Map<string, Match>;
  odds: Map<string, Odds>;
  markets: Map<string, Market>;
  sports: Sport[];
  leagues: Map<string, League[]>; // Organized by sport_key
  
  // Live match tracking - optimized for Live page
  liveMatchIds: Set<string>;
  liveMatchesVersion: number;
  
  // Connection state
  isConnected: boolean;
  lastUpdate: number;
  
  // Actions for initial load
  setInitialData: (data: {
    matches: Match[];
    sports: Sport[];
    leagues: League[];
    markets?: Market[];
  }) => void;
  
  // Actions for diff-based updates (WebSocket patches)
  updateMatch: (match: Partial<Match> & { match_id: string }) => void;
  updateOdds: (odds: Odds) => void;
  updateMarket: (market: Market) => void;
  removeMatch: (matchId: string) => void;
  
  // Batch updates for efficiency
  batchUpdateMatches: (matches: Match[]) => void;
  batchUpdateOdds: (oddsList: Odds[]) => void;
  
  // Connection state
  setConnected: (connected: boolean) => void;
  
  // Selectors for derived data
  getLiveMatches: () => Match[];
  getPrematchMatches: () => Match[];
  getMatchesBySport: (sportKey: string) => Match[];
  getMatchesByLeague: (sportKey: string, leagueId: string) => Match[];
  getMatch: (matchId: string) => Match | undefined;
  getOdds: (matchId: string) => Odds | undefined;
  getMarkets: (matchId: string) => Market[];
  
  // Clear all data
  clearAll: () => void;
  
  // Start background live status checker
  startLiveStatusChecker: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  // Initial state
  matches: new Map(),
  odds: new Map(),
  markets: new Map(),
  sports: [],
  leagues: new Map(),
  liveMatchIds: new Set(),
  liveMatchesVersion: 0,
  isConnected: false,
  lastUpdate: Date.now(),
  
  // Set initial data (called on WebSocket connect)
  setInitialData: (data) => {
    const matchesMap = new Map<string, Match>();
    const oddsMap = new Map<string, Odds>();
    const marketsMap = new Map<string, Market>();
    const leaguesMap = new Map<string, League[]>();
    const liveIds = new Set<string>();
    
    // Build matches map
    data.matches.forEach(match => {
      matchesMap.set(match.match_id, match);
      
      // Track live matches using time-based check
      if (isLiveByTime(match)) {
        liveIds.add(match.match_id);
      }
      
      // Extract odds if available
      if (match.bookmakers?.[0]?.markets) {
        const h2hMarket = match.bookmakers[0].markets.find((m: any) => m.key === 'h2h');
        if (h2hMarket?.outcomes) {
          const homeOdds = h2hMarket.outcomes.find((o: any) => o.name === match.home_team);
          const drawOdds = h2hMarket.outcomes.find((o: any) => o.name === 'Draw');
          const awayOdds = h2hMarket.outcomes.find((o: any) => o.name === match.away_team);
          
          if (homeOdds && awayOdds) {
            oddsMap.set(match.match_id, {
              match_id: match.match_id,
              home: homeOdds.price,
              draw: drawOdds?.price || 0,
              away: awayOdds.price,
              timestamp: Date.now(),
            });
          }
        }
      }
    });
    
    // Build markets map from pre-generated markets
    if (data.markets) {
      data.markets.forEach(market => {
        marketsMap.set(market.market_id, market);
      });
    }
    
    // Build leagues map
    data.leagues.forEach(league => {
      const sportLeagues = leaguesMap.get(league.sport_key) || [];
      sportLeagues.push(league);
      leaguesMap.set(league.sport_key, sportLeagues);
    });
    
    set({
      matches: matchesMap,
      odds: oddsMap,
      markets: marketsMap,
      sports: data.sports,
      leagues: leaguesMap,
      liveMatchIds: liveIds,
      liveMatchesVersion: 1,
      lastUpdate: Date.now(),
    });
    
    console.log('📊 Store initialized:', {
      matches: matchesMap.size,
      odds: oddsMap.size,
      markets: marketsMap.size,
      sports: data.sports.length,
      leagues: leaguesMap.size,
      liveMatches: liveIds.size,
    });
  },
  
  // Update single match (diff patch) - optimized with change detection
  updateMatch: (matchUpdate) => {
    const state = get();
    const existing = state.matches.get(matchUpdate.match_id);
    
    if (existing) {
      // Targeted change detection for known nested fields
      let hasChanged = false;
      
      for (const key of Object.keys(matchUpdate)) {
        if (key === 'match_id') continue;
        
        const newVal = matchUpdate[key as keyof typeof matchUpdate];
        const oldVal = existing[key as keyof Match];
        
        // Special handling for scores object
        if (key === 'scores' && newVal && oldVal) {
          const newScores = newVal as any;
          const oldScores = oldVal as any;
          if (newScores.home !== oldScores.home || newScores.away !== oldScores.away) {
            hasChanged = true;
            break;
          }
        }
        // Primitive comparison for other fields
        else if (newVal !== oldVal) {
          hasChanged = true;
          break;
        }
      }
      
      if (hasChanged) {
        const merged = { ...existing, ...matchUpdate };
        state.matches.set(matchUpdate.match_id, merged);
        
        // Check if match crossed live boundary
        const wasLive = state.liveMatchIds.has(matchUpdate.match_id);
        const isNowLive = isLiveByTime(merged);
        
        let liveBoundaryCrossed = false;
        if (wasLive !== isNowLive) {
          liveBoundaryCrossed = true;
          if (isNowLive) {
            state.liveMatchIds.add(matchUpdate.match_id);
          } else {
            state.liveMatchIds.delete(matchUpdate.match_id);
          }
        }
        
        // Update store with version bump if live boundary crossed
        if (liveBoundaryCrossed) {
          set({ 
            matches: new Map(state.matches),
            liveMatchIds: new Set(state.liveMatchIds),
            liveMatchesVersion: state.liveMatchesVersion + 1,
            lastUpdate: Date.now() 
          });
        } else {
          // Regular update without live version change
          set({ matches: new Map(state.matches), lastUpdate: Date.now() });
        }
      }
      // No render if no changes
    } else {
      // New match
      const newMatch = matchUpdate as Match;
      state.matches.set(matchUpdate.match_id, newMatch);
      
      // Check if new match is live
      const isNowLive = isLiveByTime(newMatch);
      if (isNowLive) {
        state.liveMatchIds.add(matchUpdate.match_id);
        set({ 
          matches: new Map(state.matches),
          liveMatchIds: new Set(state.liveMatchIds),
          liveMatchesVersion: state.liveMatchesVersion + 1,
          lastUpdate: Date.now() 
        });
      } else {
        set({ matches: new Map(state.matches), lastUpdate: Date.now() });
      }
    }
  },
  
  // Update odds (diff patch) - optimized with change detection
  updateOdds: (oddsUpdate) => {
    const state = get();
    const existing = state.odds.get(oddsUpdate.match_id);
    
    if (existing) {
      const changed = existing.home !== oddsUpdate.home || 
                     existing.draw !== oddsUpdate.draw || 
                     existing.away !== oddsUpdate.away;
      
      if (changed) {
        state.odds.set(oddsUpdate.match_id, oddsUpdate);
        // Create new Map reference only when changed
        set({ odds: new Map(state.odds), lastUpdate: Date.now() });
      }
    } else {
      state.odds.set(oddsUpdate.match_id, oddsUpdate);
      set({ odds: new Map(state.odds), lastUpdate: Date.now() });
    }
  },
  
  // Update market (diff patch)
  updateMarket: (market) => {
    const { markets } = get();
    markets.set(market.market_id, market);
    set({ markets: new Map(markets), lastUpdate: Date.now() });
  },
  
  // Remove match
  removeMatch: (matchId) => {
    const { matches, odds, markets } = get();
    matches.delete(matchId);
    odds.delete(matchId);
    
    // Remove related markets
    const marketIds = Array.from(markets.keys()).filter(id => 
      markets.get(id)?.match_id === matchId
    );
    marketIds.forEach(id => markets.delete(id));
    
    set({ 
      matches: new Map(matches), 
      odds: new Map(odds),
      markets: new Map(markets),
      lastUpdate: Date.now(),
    });
  },
  
  // Batch update matches - with deep change detection and in-place updates
  batchUpdateMatches: (matchList) => {
    console.time('[UPDATE] batchUpdateMatches cycle');
    console.log('[UPDATE] Batch updating', matchList.length, 'matches');
    
    const state = get();
    let modifiedCount = 0;
    let newCount = 0;
    let actualChanges = false;
    let liveBoundaryChanges = false;
    
    matchList.forEach(match => {
      const existing = state.matches.get(match.match_id);
      
      if (existing) {
        // Deep change detection: only update if data actually changed
        const hasChanged = Object.keys(match).some(key => {
          const newVal = match[key as keyof Match];
          const oldVal = existing[key as keyof Match];
          
          // Handle nested objects like scores
          if (typeof newVal === 'object' && newVal !== null && typeof oldVal === 'object' && oldVal !== null) {
            return JSON.stringify(newVal) !== JSON.stringify(oldVal);
          }
          
          return newVal !== oldVal;
        });
        
        if (hasChanged) {
          state.matches.set(match.match_id, match);
          modifiedCount++;
          actualChanges = true;
          
          // Check if match crossed live boundary
          const wasLive = state.liveMatchIds.has(match.match_id);
          const isNowLive = isLiveByTime(match);
          
          if (wasLive !== isNowLive) {
            liveBoundaryChanges = true;
            if (isNowLive) {
              state.liveMatchIds.add(match.match_id);
            } else {
              state.liveMatchIds.delete(match.match_id);
            }
          }
        }
      } else {
        state.matches.set(match.match_id, match);
        newCount++;
        actualChanges = true;
        
        // Check if new match is live
        const isNowLive = isLiveByTime(match);
        if (isNowLive) {
          liveBoundaryChanges = true;
          state.liveMatchIds.add(match.match_id);
        }
      }
    });
    
    console.log(`[UPDATE] Batch complete: ${modifiedCount} modified, ${newCount} new, ${matchList.length} total`);
    
    // Only update store if there were actual changes - create new Map reference to trigger subscribers
    if (actualChanges) {
      if (liveBoundaryChanges) {
        set({ 
          matches: new Map(state.matches),
          liveMatchIds: new Set(state.liveMatchIds),
          liveMatchesVersion: state.liveMatchesVersion + 1,
          lastUpdate: Date.now() 
        });
        console.log('[UPDATE] Batch store updated with live boundary changes, version:', state.liveMatchesVersion + 1);
      } else {
        set({ matches: new Map(state.matches), lastUpdate: Date.now() });
        console.log('[UPDATE] Batch store updated, no live boundary changes');
      }
    } else {
      console.log('[UPDATE] No changes detected, skipping re-render');
    }
    
    console.timeEnd('[UPDATE] batchUpdateMatches cycle');
  },
  
  // Batch update odds - optimized for batched WebSocket messages
  batchUpdateOdds: (oddsList) => {
    const state = get();
    let modifiedCount = 0;
    
    oddsList.forEach(oddsItem => {
      const existing = state.odds.get(oddsItem.match_id);
      
      if (!existing || 
          existing.home !== oddsItem.home || 
          existing.draw !== oddsItem.draw || 
          existing.away !== oddsItem.away) {
        state.odds.set(oddsItem.match_id, oddsItem);
        modifiedCount++;
      }
    });
    
    if (modifiedCount > 0) {
      // Single Map reference update for entire batch
      set({ odds: new Map(state.odds), lastUpdate: Date.now() });
    }
  },
  
  // Connection state
  setConnected: (connected) => {
    set({ isConnected: connected });
  },
  
  // Selectors
  getLiveMatches: () => {
    const { matches } = get();
    return Array.from(matches.values()).filter(m => m.status === 'live');
  },
  
  getPrematchMatches: () => {
    const { matches } = get();
    return Array.from(matches.values()).filter(m => m.status === 'upcoming');
  },
  
  getMatchesBySport: (sportKey) => {
    const { matches } = get();
    return Array.from(matches.values()).filter(m => m.sport_key === sportKey);
  },
  
  getMatchesByLeague: (sportKey, leagueId) => {
    const { matches } = get();
    return Array.from(matches.values()).filter(
      m => m.sport_key === sportKey && m.league_id === leagueId
    );
  },
  
  getMatch: (matchId) => {
    return get().matches.get(matchId);
  },
  
  getOdds: (matchId) => {
    return get().odds.get(matchId);
  },
  
  getMarkets: (matchId) => {
    const { markets } = get();
    return Array.from(markets.values()).filter(m => m.match_id === matchId);
  },
  
  // Clear all
  clearAll: () => {
    set({
      matches: new Map(),
      odds: new Map(),
      markets: new Map(),
      sports: [],
      leagues: new Map(),
      liveMatchIds: new Set(),
      liveMatchesVersion: 0,
      lastUpdate: Date.now(),
    });
  },
  
  // Start background live status checker - runs every 20 seconds
  // Re-evaluates isLiveByTime for all matches to catch timing boundaries
  startLiveStatusChecker: () => {
    setInterval(() => {
      const state = get();
      let liveBoundaryChanges = false;
      
      // Check all matches for live status changes
      state.matches.forEach((match) => {
        const wasLive = state.liveMatchIds.has(match.match_id);
        const isNowLive = isLiveByTime(match);
        
        if (wasLive !== isNowLive) {
          liveBoundaryChanges = true;
          if (isNowLive) {
            state.liveMatchIds.add(match.match_id);
          } else {
            state.liveMatchIds.delete(match.match_id);
          }
        }
      });
      
      // Only update store if live boundary crossed
      if (liveBoundaryChanges) {
        set({ 
          liveMatchIds: new Set(state.liveMatchIds),
          liveMatchesVersion: state.liveMatchesVersion + 1,
        });
        console.log('🕐 Live status checker: boundary crossed, version:', state.liveMatchesVersion + 1);
      }
    }, 20000); // Every 20 seconds
  },
}));
