import Redis from "ioredis";
import msgpack from "msgpack-lite";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

class RedisCacheManager {
  private client: Redis;
  private connected: boolean = false;
  private connecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.client = new Redis(REDIS_URL as string, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on("connect", () => {
      logger.success("Redis connected");
      this.connected = true;
      this.connecting = false;
    });

    this.client.on("error", (err) => {
      logger.error("Redis connection error:", err);
      this.connected = false;
      this.connecting = false;
    });

    this.client.on("close", () => {
      logger.info("Redis connection closed");
      this.connected = false;
      this.connecting = false;
    });
  }

  async connect(): Promise<void> {
    // Check the actual Redis client status
    const status = this.client.status;
    
    // If already connected or connecting, return/wait
    if (status === 'ready' || status === 'connect') {
      return;
    }
    
    if (status === 'connecting') {
      // If currently connecting, wait for it
      return new Promise((resolve, reject) => {
        this.client.once('ready', resolve);
        this.client.once('error', reject);
      });
    }
    
    // Start new connection attempt
    this.connecting = true;
    this.connectionPromise = this.client.connect().catch(err => {
      this.connecting = false;
      this.connectionPromise = null;
      throw err;
    });
    
    return this.connectionPromise;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Compressed set with msgpack
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const compressed = msgpack.encode(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, compressed);
      } else {
        await this.client.set(key, compressed);
      }
    } catch (error) {
      logger.error(`Failed to set cache key ${key}:`, error);
      throw error;
    }
  }

  // Compressed get with msgpack
  async get<T>(key: string): Promise<T | null> {
    try {
      const compressed = await this.client.getBuffer(key);
      if (!compressed) return null;

      return msgpack.decode(compressed) as T;
    } catch (error) {
      logger.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async flushPattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  /**
   * Acquire a distributed lock using SET NX EX
   * Returns true if lock acquired, false if already exists
   */
  async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error(`Failed to acquire lock for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Release a distributed lock only if the value matches (safe release)
   * Uses Lua script to ensure atomic compare-and-delete
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.client.eval(script, 1, key, value);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to release lock for key ${key}:`, error);
      return false;
    }
  }

  // Sports-specific cache operations
  async setSportsList(sports: any[], ttlSeconds: number = 3600): Promise<void> {
    await this.set("sports:list", sports, ttlSeconds);
  }

  async getSportsList(): Promise<any[] | null> {
    return await this.get<any[]>("sports:list");
  }

  // Prematch operations with metadata for TTL tracking
  async setPrematchLeagues(
    sportKey: string,
    leagues: any[],
    ttlSeconds: number = 900,
  ): Promise<void> {
    await this.setWithMetadata(`prematch:leagues:${sportKey}`, leagues, ttlSeconds, {
      source: 'prematch'
    });
  }

  async getPrematchLeagues(sportKey: string): Promise<any[] | null> {
    const result = await this.getWithMetadata<any[]>(`prematch:leagues:${sportKey}`);
    return result.data;
  }

  async setPrematchMatches(
    sportKey: string,
    leagueId: string,
    matches: any[],
    ttlSeconds: number = 600,
  ): Promise<void> {
    await this.setWithMetadata(
      `prematch:matches:${sportKey}:${leagueId}`,
      matches,
      ttlSeconds,
      { source: 'prematch' }
    );
  }

  async getPrematchMatches(
    sportKey: string,
    leagueId: string,
  ): Promise<any[] | null> {
    const result = await this.getWithMetadata<any[]>(`prematch:matches:${sportKey}:${leagueId}`);
    return result.data;
  }

  // Live operations with metadata for TTL tracking
  async setLiveLeagues(
    sportKey: string,
    leagues: any[],
    ttlSeconds: number = 90,
  ): Promise<void> {
    await this.setWithMetadata(`live:leagues:${sportKey}`, leagues, ttlSeconds, {
      source: 'live'
    });
  }

  async getLiveLeagues(sportKey: string): Promise<any[] | null> {
    const result = await this.getWithMetadata<any[]>(`live:leagues:${sportKey}`);
    return result.data;
  }

  async setLiveMatches(
    sportKey: string,
    leagueId: string,
    matches: any[],
    ttlSeconds: number = 60,
  ): Promise<void> {
    await this.setWithMetadata(`live:matches:${sportKey}:${leagueId}`, matches, ttlSeconds, {
      source: 'live'
    });
  }

  async getLiveMatches(
    sportKey: string,
    leagueId: string,
  ): Promise<any[] | null> {
    const result = await this.getWithMetadata<any[]>(`live:matches:${sportKey}:${leagueId}`);
    return result.data;
  }

  // Match markets with metadata
  async setMatchMarkets(
    matchId: string,
    markets: any,
    ttlSeconds: number = 300,
  ): Promise<void> {
    await this.setWithMetadata(`match:markets:${matchId}`, markets, ttlSeconds, {
      source: 'markets'
    });
  }

  async getMatchMarkets(matchId: string): Promise<any | null> {
    const result = await this.getWithMetadata<any>(`match:markets:${matchId}`);
    return result.data;
  }

  // Team logos
  async setTeamLogo(
    sport: string,
    teamName: string,
    logoData: any,
    ttlSeconds: number = 604800,
  ): Promise<void> {
    const normalizedName = teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    await this.set(
      `teams:logos:${sport}:${normalizedName}`,
      logoData,
      ttlSeconds,
    );
  }

  async getTeamLogo(sport: string, teamName: string): Promise<any | null> {
    const normalizedName = teamName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return await this.get<any>(`teams:logos:${sport}:${normalizedName}`);
  }

  // Cache ready flag
  async setCacheReady(ready: boolean): Promise<void> {
    const key = process.env.CACHE_READY_KEY || "cache:ready";
    await this.set(key, ready);
  }

  async isCacheReady(): Promise<boolean> {
    const key = process.env.CACHE_READY_KEY || "cache:ready";
    const result = await this.get<boolean>(key);
    return result === true;
  }

  // Cache report
  async setCacheReport(report: any): Promise<void> {
    const timestamp = Date.now();
    await this.set(`cache:report:${timestamp}`, report, 86400); // 24 hours
  }

  async getLatestCacheReport(): Promise<any | null> {
    const keys = await this.keys("cache:report:*");
    if (keys.length === 0) return null;

    keys.sort().reverse();
    return await this.get<any>(keys[0]);
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  async getStats(): Promise<any> {
    const info = await this.client.info("stats");
    const memory = await this.client.info("memory");

    return {
      connected: this.connected,
      info: info.split("\r\n").reduce((acc: any, line) => {
        const [key, value] = line.split(":");
        if (key && value) acc[key] = value;
        return acc;
      }, {}),
      memory: memory.split("\r\n").reduce((acc: any, line) => {
        const [key, value] = line.split(":");
        if (key && value) acc[key] = value;
        return acc;
      }, {}),
    };
  }

  // PROFESSIONAL CACHING ENHANCEMENTS

  // Set with metadata (last updated, version)
  async setWithMetadata(
    key: string, 
    value: any, 
    ttlSeconds?: number,
    metadata?: { source?: string; version?: number }
  ): Promise<void> {
    const dataWithMeta = {
      data: value,
      metadata: {
        lastUpdated: new Date().toISOString(),
        ttl: ttlSeconds,
        ...metadata
      }
    };
    await this.set(key, dataWithMeta, ttlSeconds);
  }

  // Get with metadata
  async getWithMetadata<T>(key: string): Promise<{
    data: T | null;
    metadata: {
      lastUpdated?: string;
      ttl?: number;
      remainingTtl?: number;
      isStale?: boolean;
    };
  }> {
    const result = await this.get<any>(key);
    
    if (!result) {
      return { data: null, metadata: {} };
    }

    // If data has metadata structure, extract it
    if (result.metadata && result.data !== undefined) {
      const remainingTtl = await this.ttl(key);
      const isStale = remainingTtl > 0 && remainingTtl < (result.metadata.ttl || 0) * 0.2; // Stale if < 20% TTL remaining
      
      return {
        data: result.data,
        metadata: {
          ...result.metadata,
          remainingTtl,
          isStale
        }
      };
    }

    // Fallback for data without metadata
    return { data: result, metadata: {} };
  }

  // Conditional update - only update if TTL is low or data is significantly different
  async updateIfStale(
    key: string,
    newValue: any,
    ttlSeconds: number,
    forceUpdate: boolean = false
  ): Promise<boolean> {
    if (forceUpdate) {
      await this.set(key, newValue, ttlSeconds);
      return true;
    }

    const currentTtl = await this.ttl(key);
    const threshold = ttlSeconds * 0.3; // Update if < 30% TTL remaining

    if (currentTtl < 0 || currentTtl < threshold) {
      await this.set(key, newValue, ttlSeconds);
      return true;
    }

    return false;
  }

  // Extend TTL if low (prevents expiration during API issues)
  async extendTtlIfLow(key: string, targetTtl: number, threshold: number = 0.3): Promise<boolean> {
    const currentTtl = await this.ttl(key);
    
    if (currentTtl > 0 && currentTtl < targetTtl * threshold) {
      await this.expire(key, targetTtl);
      return true;
    }

    return false;
  }

  // Get multiple keys in parallel
  async getMulti<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    const values = await Promise.all(
      keys.map(key => this.get<T>(key))
    );

    keys.forEach((key, index) => {
      results.set(key, values[index]);
    });

    return results;
  }

  // Check if data needs refresh based on TTL percentage
  async needsRefresh(
    key: string, 
    refreshThreshold: number = 0.2,
    expectedTtl?: number
  ): Promise<boolean> {
    const exists = await this.exists(key);
    if (!exists) return true;

    const currentTtl = await this.ttl(key);
    if (currentTtl < 0) return false; // No expiration set

    // Get the original TTL from metadata if available
    const data = await this.get<any>(key);
    if (data?.metadata?.ttl) {
      const threshold = data.metadata.ttl * refreshThreshold;
      return currentTtl < threshold;
    }

    // Fallback: use explicit expected TTL if provided
    if (expectedTtl) {
      const threshold = expectedTtl * refreshThreshold;
      return currentTtl < threshold;
    }

    // Last resort fallback: refresh if less than threshold of a reasonable default
    return currentTtl < 60; // Less than 1 minute
  }

  // ODDS HISTORY TRACKING - For detecting odds changes
  
  // Store odds snapshot for a match
  async setOddsSnapshot(
    matchId: string,
    marketKey: string,
    odds: Record<string, number>,
    ttlSeconds: number = 300
  ): Promise<void> {
    const key = `odds:snapshot:${matchId}:${marketKey}`;
    const snapshot = {
      odds,
      timestamp: Date.now(),
    };
    await this.set(key, snapshot, ttlSeconds);
  }

  // Get previous odds snapshot
  async getOddsSnapshot(
    matchId: string,
    marketKey: string
  ): Promise<{ odds: Record<string, number>; timestamp: number } | null> {
    const key = `odds:snapshot:${matchId}:${marketKey}`;
    return await this.get<{ odds: Record<string, number>; timestamp: number }>(key);
  }

  // Calculate and store odds delta
  async calculateOddsDelta(
    matchId: string,
    marketKey: string,
    currentOdds: Record<string, number>
  ): Promise<Record<string, 'up' | 'down' | 'unchanged' | 'locked'>> {
    const previous = await this.getOddsSnapshot(matchId, marketKey);
    const deltas: Record<string, 'up' | 'down' | 'unchanged' | 'locked'> = {};

    if (!previous) {
      // First time seeing these odds - mark as unchanged
      Object.keys(currentOdds).forEach(key => {
        deltas[key] = 'unchanged';
      });
    } else {
      Object.keys(currentOdds).forEach(key => {
        const current = currentOdds[key];
        const prev = previous.odds[key];

        if (current === 0 || current === null || current === undefined) {
          deltas[key] = 'locked';
        } else if (!prev) {
          deltas[key] = 'unchanged';
        } else if (current > prev) {
          deltas[key] = 'up';
        } else if (current < prev) {
          deltas[key] = 'down';
        } else {
          deltas[key] = 'unchanged';
        }
      });
    }

    // Store current odds as new snapshot for next comparison
    await this.setOddsSnapshot(matchId, marketKey, currentOdds, 300);

    return deltas;
  }

  // Store market status for a match
  async setMarketStatus(
    matchId: string,
    marketKey: string,
    status: 'open' | 'suspended' | 'closed',
    ttlSeconds: number = 300
  ): Promise<void> {
    const key = `market:status:${matchId}:${marketKey}`;
    await this.set(key, { status, timestamp: Date.now() }, ttlSeconds);
  }

  // Get market status
  async getMarketStatus(
    matchId: string,
    marketKey: string
  ): Promise<'open' | 'suspended' | 'closed' | null> {
    const key = `market:status:${matchId}:${marketKey}`;
    const result = await this.get<{ status: 'open' | 'suspended' | 'closed'; timestamp: number }>(key);
    return result?.status || null;
  }

  // Get all live matches with enriched data (for aggregator endpoint)
  async getAllLiveMatchesEnriched(): Promise<any[]> {
    const sports = await this.getSportsList() || [];
    console.log(`📊 getAllLiveMatchesEnriched - Found ${sports.length} sports:`, sports.map(s => s.key));
    const allMatches: any[] = [];

    for (const sport of sports) {
      const leagues = await this.getLiveLeagues(sport.key) || [];
      console.log(`  📊 Sport ${sport.key}: ${leagues.length} live leagues`);
      
      for (const league of leagues) {
        const matches = await this.getLiveMatches(sport.key, league.league_id) || [];
        console.log(`    📊 League ${league.league_id}: ${matches.length} matches`);
        
        // Enrich each match with logos and market status
        for (const match of matches) {
          const homeLogo = await this.getTeamLogo(sport.key, match.home_team);
          const awayLogo = await this.getTeamLogo(sport.key, match.away_team);
          
          // Get h2h market status and deltas
          const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
          let oddsDeltas: any = {};
          let marketStatus = 'open';

          if (h2hMarket) {
            const currentOdds: Record<string, number> = {};
            h2hMarket.outcomes?.forEach((outcome: any) => {
              currentOdds[outcome.name] = outcome.price || 0;
            });

            oddsDeltas = await this.calculateOddsDelta(match.match_id, 'h2h', currentOdds);
            const status = await this.getMarketStatus(match.match_id, 'h2h');
            marketStatus = status || 'open';
          }

          // Normalize upstream API status values to canonical set
          // Odds API may use: "in_progress", "halftime", "live", "not_started", "pre-game", "final", "finished"
          const normalizeStatus = (status: string | undefined): 'live' | 'upcoming' | 'completed' => {
            if (!status) {
              // Fallback: determine from commence_time
              const commenceTime = new Date(match.commence_time).getTime();
              const now = Date.now();
              const elapsedMin = Math.floor((now - commenceTime) / 60000);
              
              if (elapsedMin >= 0 && elapsedMin <= 120) return 'live';
              if (elapsedMin < 0) return 'upcoming';
              return 'completed';
            }
            
            const lowerStatus = status.toLowerCase();
            
            // Map to "live"
            if (lowerStatus === 'live' || lowerStatus === 'in_progress' || 
                lowerStatus === 'in-progress' || lowerStatus === 'halftime' || 
                lowerStatus === 'half-time') {
              return 'live';
            }
            
            // Map to "upcoming"
            if (lowerStatus === 'upcoming' || lowerStatus === 'not_started' || 
                lowerStatus === 'not-started' || lowerStatus === 'pre-game' ||
                lowerStatus === 'pregame' || lowerStatus === 'scheduled') {
              return 'upcoming';
            }
            
            // Map to "completed"
            if (lowerStatus === 'completed' || lowerStatus === 'finished' || 
                lowerStatus === 'final' || lowerStatus === 'ended') {
              return 'completed';
            }
            
            // Default fallback based on commence_time
            const commenceTime = new Date(match.commence_time).getTime();
            const now = Date.now();
            const elapsedMin = Math.floor((now - commenceTime) / 60000);
            
            if (elapsedMin >= 0 && elapsedMin <= 120) return 'live';
            if (elapsedMin < 0) return 'upcoming';
            return 'completed';
          };
          
          const actualStatus = normalizeStatus(match.status);
          
          // Log status normalization for debugging (only for first few matches)
          if (allMatches.length < 3 && match.status && match.status !== actualStatus) {
            console.log(`🔄 Status normalized: "${match.status}" → "${actualStatus}" for ${match.home_team} vs ${match.away_team}`);
          }

          allMatches.push({
            ...match,
            status: actualStatus,
            home_team_logo: homeLogo?.logo || null,
            away_team_logo: awayLogo?.logo || null,
            odds_deltas: oddsDeltas,
            market_status: marketStatus,
            league_name: league.league_name,
            sport_icon: this.getSportIconForKey(sport.key),
          });
        }
      }
    }

    return allMatches;
  }

  private getSportIconForKey(sportKey: string): string {
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
}

export const redisCache = new RedisCacheManager();
