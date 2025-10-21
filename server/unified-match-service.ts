/**
 * Unified Match Service
 * 
 * Merges manual matches from Supabase with API matches from Redis cache
 * to provide a seamless experience where users can't distinguish between sources
 */

import { storage } from './storage';
import { redisCache } from './redis-cache';
import { getSportIcon } from './match-utils';

export interface UnifiedMatch {
  match_id: string;
  sport_key: string;
  sport_icon?: string;
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
  market_status?: 'open' | 'suspended' | 'closed';
  source: 'api' | 'manual'; // Internal use only, not sent to frontend
  is_manual?: boolean; // For frontend to know if it's a manual match
}

export class UnifiedMatchService {
  
  /**
   * Get all live matches (both API and manual)
   * Manual matches are now included in getAllLiveMatchesEnriched via aggregator
   */
  async getAllLiveMatches(): Promise<UnifiedMatch[]> {
    try {
      // Check cache first with very short TTL to balance performance and freshness
      const cached = await redisCache.get<UnifiedMatch[]>('unified:matches:live');
      if (cached && cached.length > 0) {
        return cached;
      }
      
      // Fetch fresh data including manual matches from DB
      // Manual matches are fetched directly from DB in getAllLiveMatchesEnriched
      const allMatches = await redisCache.getAllLiveMatchesEnriched();
      
      // Sort by commence_time
      const unified = allMatches
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
      
      // Cache with 5s TTL for burst protection while ensuring fresh manual matches
      await this.cacheUnifiedMatches('live', unified);
      
      return unified;
    } catch (error) {
      console.error('Error getting unified live matches:', error);
      throw error;
    }
  }
  
  /**
   * Get all upcoming matches (both API and manual)
   * Manual matches are now included in sport/league arrays via aggregator
   */
  async getAllUpcomingMatches(limit: number = 100): Promise<UnifiedMatch[]> {
    try {
      // Try to get from cache first
      const cached = await redisCache.get<UnifiedMatch[]>('unified:matches:upcoming');
      if (cached && cached.length > 0) {
        return cached.slice(0, limit);
      }
      
      // Get all matches from Redis (includes both API and manual matches)
      // Manual matches are added to sport/league arrays by the aggregator's manual polling
      const allMatches: UnifiedMatch[] = [];
      const sports = await redisCache.getSportsList() || [];
      
      for (const sport of sports) {
        if (allMatches.length >= limit * 2) break; // Get 2x limit for sorting
        
        const leagues = await redisCache.getPrematchLeagues(sport.key) || [];
        for (const league of leagues) {
          if (allMatches.length >= limit * 2) break;
          
          const matches = await redisCache.getPrematchMatches(sport.key, league.league_id) || [];
          // Explicitly set status to 'upcoming' for all prematch matches
          const upcomingMatches = matches.map(m => ({ ...m, status: 'upcoming' as const }));
          allMatches.push(...upcomingMatches);
        }
      }
      
      // Sort by commence_time and limit
      const unified = allMatches
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
        .slice(0, limit);
      
      // Cache unified list to Redis
      await this.cacheUnifiedMatches('upcoming', unified);
      
      return unified;
    } catch (error) {
      console.error('Error getting unified upcoming matches:', error);
      throw error;
    }
  }
  
  /**
   * Get match by ID (checks both API and manual sources)
   * OPTIMIZED: Uses direct match cache for instant lookups, with fallback search
   */
  async getMatchById(matchId: string): Promise<UnifiedMatch | null> {
    try {
      // First check unified match cache
      const cached = await redisCache.get<UnifiedMatch>(`unified:match:${matchId}`);
      if (cached) {
        return cached;
      }
      
      // Check individual match cache (set by setPrematchMatches/setLiveMatches)
      const directMatch = await redisCache.get<any>(`match:${matchId}`);
      if (directMatch) {
        // Transform to unified format if needed
        const unified: UnifiedMatch = {
          match_id: directMatch.match_id || directMatch.id,
          sport_key: directMatch.sport_key,
          sport_icon: directMatch.sport_icon,
          home_team: directMatch.home_team,
          away_team: directMatch.away_team,
          commence_time: directMatch.commence_time,
          status: directMatch.status || 'upcoming',
          league_id: directMatch.league_id,
          league_name: directMatch.league_name,
          bookmakers: directMatch.bookmakers || [],
          scores: directMatch.scores,
          source: 'api'
        };
        
        // Cache as unified for next time
        await redisCache.set(`unified:match:${matchId}`, unified, 60);
        return unified;
      }
      
      // FALLBACK: Search through all sports and leagues to find this match
      // This handles cases where match was loaded via hydrate but not cached individually
      const sports = await redisCache.getSportsList() || [];
      for (const sport of sports) {
        // Check both live and prematch leagues
        const liveLeagues = await redisCache.getLiveLeagues(sport.key) || [];
        const prematchLeagues = await redisCache.getPrematchLeagues(sport.key) || [];
        const allLeagues = [...liveLeagues, ...prematchLeagues];
        
        for (const league of allLeagues) {
          const liveMatches = await redisCache.getLiveMatches(sport.key, league.league_id) || [];
          const prematchMatches = await redisCache.getPrematchMatches(sport.key, league.league_id) || [];
          const allMatches = [...liveMatches, ...prematchMatches];
          
          const foundMatch = allMatches.find(m => (m.match_id || m.id) === matchId);
          if (foundMatch) {
            // Found it! Transform and cache
            const unified: UnifiedMatch = {
              match_id: foundMatch.match_id || foundMatch.id,
              sport_key: sport.key,
              sport_icon: foundMatch.sport_icon,
              home_team: foundMatch.home_team,
              away_team: foundMatch.away_team,
              commence_time: foundMatch.commence_time,
              status: foundMatch.status || 'upcoming',
              league_id: foundMatch.league_id || league.league_id,
              league_name: foundMatch.league_name || league.league_name,
              bookmakers: foundMatch.bookmakers || [],
              scores: foundMatch.scores,
              source: 'api'
            };
            
            // Cache for future instant lookups
            await redisCache.set(`unified:match:${matchId}`, unified, 60);
            await redisCache.set(`match:${matchId}`, { ...foundMatch, sport_key: sport.key, league_id: league.league_id }, 60);
            
            return unified;
          }
        }
      }
      
      // Check if it's a manual match (UUIDs are typically longer than 32 chars)
      if (matchId.includes('-') || matchId.length > 35) {
        const manualMatch = await storage.getMatch(matchId);
        if (manualMatch) {
          const unified = await this.transformManualMatch(manualMatch);
          // Cache for 60 seconds
          await redisCache.set(`unified:match:${matchId}`, unified, 60);
          return unified;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting match ${matchId}:`, error);
      return null;
    }
  }
  
  /**
   * Get matches by league (both API and manual)
   * Manual matches are now included in Redis sport/league arrays via aggregator
   */
  async getMatchesByLeague(leagueId: string, sportKey?: string, status?: string): Promise<UnifiedMatch[]> {
    try {
      // Get all matches from Redis (includes both API and manual matches)
      // Manual matches are added to sport/league arrays by the aggregator's manual polling
      let allMatches: any[] = [];
      
      if (sportKey) {
        // If we have sport key, get matches directly
        const prematchMatches = await redisCache.getPrematchMatches(sportKey, leagueId) || [];
        const liveMatches = await redisCache.getLiveMatches(sportKey, leagueId) || [];
        allMatches = [...prematchMatches, ...liveMatches];
      } else {
        // Search through all sports to find the league
        const sports = await redisCache.getSportsList() || [];
        for (const sport of sports) {
          const prematchMatches = await redisCache.getPrematchMatches(sport.key, leagueId) || [];
          const liveMatches = await redisCache.getLiveMatches(sport.key, leagueId) || [];
          allMatches.push(...prematchMatches, ...liveMatches);
        }
      }
      
      // Filter by status if requested
      let unified = allMatches;
      if (status) {
        unified = allMatches.filter(m => m.status === status);
      }
      
      // Sort by commence_time
      unified = unified.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
      
      return unified;
    } catch (error) {
      console.error(`Error getting matches for league ${leagueId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get match markets (works for both manual and API matches)
   * ENHANCED: Now with database persistence for API matches
   */
  async getMatchMarkets(matchId: string): Promise<any[]> {
    try {
      // Check if it's a manual match
      const match = await this.getMatchById(matchId);
      
      if (match?.source === 'manual') {
        // Get markets from Supabase
        const markets = await storage.getMatchMarkets(matchId);
        
        // Cache to Redis for consistency
        await redisCache.set(`manual:markets:${matchId}`, markets, 60);
        
        return markets;
      } else {
        // For API matches: Try Redis first, then fallback to database
        let markets = await redisCache.get<any[]>(`match:markets:${matchId}`);
        
        if (!markets || markets.length === 0) {
          // Fallback to database for persisted markets
          markets = await storage.getMatchMarkets(matchId);
          
          // Cache to Redis for faster subsequent access
          if (markets && markets.length > 0) {
            await redisCache.set(`match:markets:${matchId}`, markets, 60);
          }
        }
        
        return markets || [];
      }
    } catch (error) {
      console.error(`Error getting markets for match ${matchId}:`, error);
      return [];
    }
  }
  
  /**
   * Transform manual match from Supabase to unified format
   */
  private async transformManualMatch(dbMatch: any): Promise<UnifiedMatch> {
    // Get markets for the match to extract odds
    const markets = await storage.getMatchMarkets(dbMatch.id);
    
    // Build bookmakers array with markets and outcomes for consistency with API matches
    const bookmakers: any[] = [];
    
    if (markets && markets.length > 0) {
      // Group all markets under a single bookmaker for consistency
      const marketsList = markets.map((market: any) => {
        return {
          key: market.key || market.type,
          outcomes: (market.outcomes || []).map((outcome: any) => ({
            name: outcome.label,
            key: outcome.key,
            price: parseFloat(outcome.odds) || 1.01
          }))
        };
      });
      
      bookmakers.push({
        key: 'manual',
        title: 'Manual',
        markets: marketsList
      });
    }
    
    // Extract 1X2 odds if available
    const h2hMarket = markets.find(m => m.type === '1x2' || m.key === 'h2h');
    let odds: any = undefined;
    
    if (h2hMarket && h2hMarket.outcomes) {
      const outcomes = h2hMarket.outcomes;
      const homeOutcome = outcomes.find((o: any) => o.key === 'home' || o.key === '1');
      const drawOutcome = outcomes.find((o: any) => o.key === 'draw' || o.key === 'x');
      const awayOutcome = outcomes.find((o: any) => o.key === 'away' || o.key === '2');
      
      if (homeOutcome && drawOutcome && awayOutcome) {
        odds = {
          home: parseFloat(homeOutcome.odds),
          draw: parseFloat(drawOutcome.odds),
          away: parseFloat(awayOutcome.odds)
        };
      }
    }
    
    // Determine match status
    let status: 'live' | 'upcoming' | 'completed' = 'upcoming';
    if (dbMatch.status === 'live') {
      status = 'live';
    } else if (dbMatch.status === 'finished') {
      status = 'completed';
    }
    
    // Determine market status
    let market_status: 'open' | 'suspended' | 'closed' = 'open';
    if (dbMatch.status === 'finished') {
      market_status = 'closed';
    } else if (h2hMarket?.status === 'suspended') {
      market_status = 'suspended';
    } else if (h2hMarket?.status === 'closed') {
      market_status = 'closed';
    }
    
    const unified: UnifiedMatch = {
      match_id: dbMatch.id,
      sport_key: dbMatch.sport || 'soccer',
      sport_icon: getSportIcon(dbMatch.sport || 'soccer'),
      league_id: dbMatch.league_id || dbMatch.leagueId,
      league_name: dbMatch.league_name || dbMatch.leagueName,
      home_team: dbMatch.home_team_name || dbMatch.homeTeamName,
      away_team: dbMatch.away_team_name || dbMatch.awayTeamName,
      home_team_logo: null,
      away_team_logo: null,
      commence_time: dbMatch.kickoff_time || dbMatch.kickoffTime,
      status,
      market_status,
      bookmakers, // Include bookmakers for market count display
      source: 'manual' as const,
      is_manual: true
    };
    
    // Add scores if available
    if (dbMatch.home_score !== null && dbMatch.away_score !== null) {
      unified.scores = {
        home: dbMatch.home_score || dbMatch.homeScore || 0,
        away: dbMatch.away_score || dbMatch.awayScore || 0
      };
    }
    
    // Add odds if available
    if (odds) {
      unified.odds = odds;
    }
    
    // Cache to Redis for faster subsequent requests
    await redisCache.set(`manual:match:${dbMatch.id}`, unified, 60);
    
    return unified;
  }
  
  /**
   * Cache unified matches list to Redis
   */
  private async cacheUnifiedMatches(type: 'live' | 'upcoming', matches: UnifiedMatch[]): Promise<void> {
    try {
      const cacheKey = `unified:matches:${type}`;
      const ttl = type === 'live' ? 5 : 300; // 5s for live (fresh manual matches), 5min for upcoming
      await redisCache.set(cacheKey, matches, ttl);
    } catch (error) {
      console.error('Error caching unified matches:', error);
    }
  }
  
  /**
   * Update manual match in Redis cache when it changes
   * Also triggers Ably aggregator to pick up the change
   */
  async updateManualMatchCache(matchId: string): Promise<void> {
    try {
      const match = await storage.getMatch(matchId);
      if (match && match.is_manual) {
        const unified = await this.transformManualMatch(match);
        
        // If match is finished, remove it from live caches before updating
        if (unified.status === 'completed') {
          await this.removeMatchFromLiveCache(matchId, unified.sport_key, unified.league_id);
          console.log(`🧹 Removed finished match ${matchId} from live cache`);
        }
        
        // Write to canonical fixture key for aggregator to detect
        await redisCache.set(`fixture:${matchId}`, unified, 3600);
        await redisCache.set(`manual:match:${matchId}`, unified, 60);
        
        // Update league index
        const leagueKey = `league:${unified.league_id}:fixtures`;
        let fixtureIds = await redisCache.get<string[]>(leagueKey) || [];
        if (!fixtureIds.includes(matchId)) {
          fixtureIds.push(matchId);
          await redisCache.set(leagueKey, fixtureIds, 3600);
        }
        
        // Invalidate unified lists to force refresh
        await redisCache.del('unified:matches:live');
        await redisCache.del('unified:matches:upcoming');
        
        // Log for aggregator visibility
        console.log(`📝 Manual match updated in Redis (fixture:${matchId}) - Status: ${unified.status}`);
      }
    } catch (error) {
      console.error(`Error updating manual match cache for ${matchId}:`, error);
    }
  }
  
  /**
   * Remove a match from live cache collections
   */
  private async removeMatchFromLiveCache(matchId: string, sportKey: string, leagueId: string): Promise<void> {
    try {
      // Remove from live matches array for this sport/league
      const liveMatches = await redisCache.getLiveMatches(sportKey, leagueId) || [];
      const filteredMatches = liveMatches.filter(m => 
        (m.match_id || m.id) !== matchId
      );
      
      // Update the live matches cache (or remove if empty)
      if (filteredMatches.length > 0) {
        await redisCache.setLiveMatches(sportKey, leagueId, filteredMatches, 120, true);
      } else {
        await redisCache.del(`live:matches:${sportKey}:${leagueId}`);
      }
      
      // Delete individual match cache
      await redisCache.del(`match:${matchId}`);
      await redisCache.del(`unified:match:${matchId}`);
      
    } catch (error) {
      console.error(`Error removing match ${matchId} from live cache:`, error);
    }
  }
}

// Export singleton instance
export const unifiedMatchService = new UnifiedMatchService();
