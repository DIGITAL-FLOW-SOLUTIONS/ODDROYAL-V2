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
   */
  async getAllLiveMatches(): Promise<UnifiedMatch[]> {
    try {
      // Try to get from cache first
      const cached = await redisCache.get<UnifiedMatch[]>('unified:matches:live');
      if (cached && cached.length > 0) {
        return cached;
      }
      
      // Get API matches from Redis
      const apiMatches = await redisCache.getAllLiveMatchesEnriched();
      
      // Get manual matches from Supabase
      const manualMatches = await storage.getLiveManualMatches();
      
      // Transform manual matches to unified format
      const transformedManual = await Promise.all(
        manualMatches.map(match => this.transformManualMatch(match))
      );
      
      // Merge and sort by commence_time
      const unified = [...apiMatches, ...transformedManual]
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
      
      // Cache unified list to Redis for faster subsequent requests
      await this.cacheUnifiedMatches('live', unified);
      
      return unified;
    } catch (error) {
      console.error('Error getting unified live matches:', error);
      throw error;
    }
  }
  
  /**
   * Get all upcoming matches (both API and manual)
   */
  async getAllUpcomingMatches(limit: number = 100): Promise<UnifiedMatch[]> {
    try {
      // Try to get from cache first
      const cached = await redisCache.get<UnifiedMatch[]>('unified:matches:upcoming');
      if (cached && cached.length > 0) {
        return cached.slice(0, limit);
      }
      
      // Get API matches from Redis (get from all sports and leagues, but respect limit)
      const apiMatches: UnifiedMatch[] = [];
      const sports = await redisCache.getSportsList() || [];
      
      for (const sport of sports) {
        if (apiMatches.length >= limit * 2) break; // Get 2x limit to allow for mixing with manual
        
        const leagues = await redisCache.getPrematchLeagues(sport.key) || [];
        for (const league of leagues) {
          if (apiMatches.length >= limit * 2) break;
          
          const matches = await redisCache.getPrematchMatches(sport.key, league.league_id) || [];
          // Explicitly set status to 'upcoming' for all prematch matches
          const upcomingMatches = matches.map(m => ({ ...m, status: 'upcoming' as const }));
          apiMatches.push(...upcomingMatches);
        }
      }
      
      // Get manual matches from Supabase
      const manualMatches = await storage.getUpcomingManualMatches(limit);
      
      // Transform manual matches to unified format
      const transformedManual = await Promise.all(
        manualMatches.map(match => this.transformManualMatch(match))
      );
      
      // Merge and sort by commence_time
      const unified = [...apiMatches, ...transformedManual]
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
   */
  async getMatchById(matchId: string): Promise<UnifiedMatch | null> {
    try {
      // First check if it's a manual match (UUIDs are longer)
      if (matchId.length > 30) {
        const manualMatch = await storage.getMatch(matchId);
        if (manualMatch) {
          return await this.transformManualMatch(manualMatch);
        }
      }
      
      // Check API matches in Redis
      const apiMatch = await redisCache.get<any>(`match:details:${matchId}`);
      if (apiMatch) {
        return {
          ...apiMatch,
          source: 'api' as const,
          is_manual: false
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting match ${matchId}:`, error);
      return null;
    }
  }
  
  /**
   * Get matches by league (both API and manual)
   */
  async getMatchesByLeague(leagueId: string, sportKey?: string, status?: string): Promise<UnifiedMatch[]> {
    try {
      // Get API matches from Redis (need to search through sports to find the league)
      let apiMatches: any[] = [];
      
      if (sportKey) {
        // If we have sport key, get matches directly
        const prematchMatches = await redisCache.getPrematchMatches(sportKey, leagueId) || [];
        const liveMatches = await redisCache.getLiveMatches(sportKey, leagueId) || [];
        apiMatches = [...prematchMatches, ...liveMatches];
      } else {
        // Search through all sports to find the league
        const sports = await redisCache.getSportsList() || [];
        for (const sport of sports) {
          const prematchMatches = await redisCache.getPrematchMatches(sport.key, leagueId) || [];
          const liveMatches = await redisCache.getLiveMatches(sport.key, leagueId) || [];
          apiMatches.push(...prematchMatches, ...liveMatches);
        }
      }
      
      // Get manual matches from Supabase
      const manualMatches = await storage.getAllMatches({
        league: leagueId,
        status,
        source: 'manual'
      });
      
      // Transform manual matches
      const transformedManual = await Promise.all(
        manualMatches.matches.map(match => this.transformManualMatch(match))
      );
      
      // Merge and sort
      const unified = [...apiMatches, ...transformedManual]
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
      
      return unified;
    } catch (error) {
      console.error(`Error getting matches for league ${leagueId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get match markets (works for both manual and API matches)
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
        // Get markets from Redis cache (API matches)
        const markets = await redisCache.get<any[]>(`match:markets:${matchId}`);
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
      const ttl = type === 'live' ? 30 : 300; // 30s for live, 5min for upcoming
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
        console.log(`📝 Manual match updated in Redis (fixture:${matchId}) - Aggregator will detect change`);
      }
    } catch (error) {
      console.error(`Error updating manual match cache for ${matchId}:`, error);
    }
  }
}

// Export singleton instance
export const unifiedMatchService = new UnifiedMatchService();
