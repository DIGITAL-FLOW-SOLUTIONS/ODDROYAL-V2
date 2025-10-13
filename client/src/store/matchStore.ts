/**
 * Global Match Store - Professional Betting Site Architecture
 * 
 * Normalized data structure for instant access and diff-based updates.
 * All matches (API + manual) stored here for instant page navigation.
 */

import { create } from 'zustand';

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
  
  // Connection state
  isConnected: boolean;
  lastUpdate: number;
  
  // Actions for initial load
  setInitialData: (data: {
    matches: Match[];
    sports: Sport[];
    leagues: League[];
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
  
  // Clear all data
  clearAll: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  // Initial state
  matches: new Map(),
  odds: new Map(),
  markets: new Map(),
  sports: [],
  leagues: new Map(),
  isConnected: false,
  lastUpdate: Date.now(),
  
  // Set initial data (called on WebSocket connect)
  setInitialData: (data) => {
    const matchesMap = new Map<string, Match>();
    const oddsMap = new Map<string, Odds>();
    const leaguesMap = new Map<string, League[]>();
    
    // Build matches map
    data.matches.forEach(match => {
      matchesMap.set(match.match_id, match);
      
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
    
    // Build leagues map
    data.leagues.forEach(league => {
      const sportLeagues = leaguesMap.get(league.sport_key) || [];
      sportLeagues.push(league);
      leaguesMap.set(league.sport_key, sportLeagues);
    });
    
    set({
      matches: matchesMap,
      odds: oddsMap,
      sports: data.sports,
      leagues: leaguesMap,
      lastUpdate: Date.now(),
    });
    
    console.log('📊 Store initialized:', {
      matches: matchesMap.size,
      odds: oddsMap.size,
      sports: data.sports.length,
      leagues: leaguesMap.size,
    });
  },
  
  // Update single match (diff patch) - optimized with change detection
  updateMatch: (matchUpdate) => {
    const state = get();
    const existing = state.matches.get(matchUpdate.match_id);
    
    if (existing) {
      // Lightweight check: compare keys that were updated
      const changedKeys = Object.keys(matchUpdate).filter(
        key => key !== 'match_id' && existing[key as keyof Match] !== matchUpdate[key as keyof typeof matchUpdate]
      );
      
      if (changedKeys.length > 0) {
        const merged = { ...existing, ...matchUpdate };
        state.matches.set(matchUpdate.match_id, merged);
        // Create new Map reference only when changed
        set({ matches: new Map(state.matches), lastUpdate: Date.now() });
      }
    } else {
      // New match
      state.matches.set(matchUpdate.match_id, matchUpdate as Match);
      set({ matches: new Map(state.matches), lastUpdate: Date.now() });
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
  
  // Batch update matches
  batchUpdateMatches: (matchList) => {
    console.time('[UPDATE] batchUpdateMatches cycle');
    console.log('[UPDATE] Batch updating', matchList.length, 'matches');
    
    const { matches } = get();
    let modifiedCount = 0;
    let newCount = 0;
    
    matchList.forEach(match => {
      const existing = matches.get(match.match_id);
      
      if (existing) {
        // Lightweight check: assume it changed if batch update includes it
        // (we trust the backend to only send changed data)
        matches.set(match.match_id, match);
        modifiedCount++;
      } else {
        matches.set(match.match_id, match);
        newCount++;
      }
    });
    
    console.log(`[UPDATE] Batch complete: ${modifiedCount} modified, ${newCount} new, ${matchList.length} total`);
    
    if (modifiedCount > 0 || newCount > 0) {
      set({ matches: new Map(matches), lastUpdate: Date.now() });
      console.log('[UPDATE] Batch store updated, triggering re-render');
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
  
  // Clear all
  clearAll: () => {
    set({
      matches: new Map(),
      odds: new Map(),
      markets: new Map(),
      sports: [],
      leagues: new Map(),
      lastUpdate: Date.now(),
    });
  },
}));
