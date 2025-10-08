import Redis from 'ioredis';
import msgpack from 'msgpack-lite';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisCacheManager {
  private client: Redis;
  private connected: boolean = false;

  constructor() {
    this.client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      console.log('✅ Redis connected');
      this.connected = true;
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
      this.connected = false;
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
      this.connected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
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
      console.error(`Failed to set cache key ${key}:`, error);
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
      console.error(`Failed to get cache key ${key}:`, error);
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

  // Sports-specific cache operations
  async setSportsList(sports: any[], ttlSeconds: number = 3600): Promise<void> {
    await this.set('sports:list', sports, ttlSeconds);
  }

  async getSportsList(): Promise<any[] | null> {
    return await this.get<any[]>('sports:list');
  }

  // Prematch operations
  async setPrematchLeagues(sportKey: string, leagues: any[], ttlSeconds: number = 900): Promise<void> {
    await this.set(`prematch:leagues:${sportKey}`, leagues, ttlSeconds);
  }

  async getPrematchLeagues(sportKey: string): Promise<any[] | null> {
    return await this.get<any[]>(`prematch:leagues:${sportKey}`);
  }

  async setPrematchMatches(sportKey: string, leagueId: string, matches: any[], ttlSeconds: number = 600): Promise<void> {
    await this.set(`prematch:matches:${sportKey}:${leagueId}`, matches, ttlSeconds);
  }

  async getPrematchMatches(sportKey: string, leagueId: string): Promise<any[] | null> {
    return await this.get<any[]>(`prematch:matches:${sportKey}:${leagueId}`);
  }

  // Live operations
  async setLiveLeagues(sportKey: string, leagues: any[], ttlSeconds: number = 90): Promise<void> {
    await this.set(`live:leagues:${sportKey}`, leagues, ttlSeconds);
  }

  async getLiveLeagues(sportKey: string): Promise<any[] | null> {
    return await this.get<any[]>(`live:leagues:${sportKey}`);
  }

  async setLiveMatches(sportKey: string, leagueId: string, matches: any[], ttlSeconds: number = 60): Promise<void> {
    await this.set(`live:matches:${sportKey}:${leagueId}`, matches, ttlSeconds);
  }

  async getLiveMatches(sportKey: string, leagueId: string): Promise<any[] | null> {
    return await this.get<any[]>(`live:matches:${sportKey}:${leagueId}`);
  }

  // Match markets
  async setMatchMarkets(matchId: string, markets: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(`match:markets:${matchId}`, markets, ttlSeconds);
  }

  async getMatchMarkets(matchId: string): Promise<any | null> {
    return await this.get<any>(`match:markets:${matchId}`);
  }

  // Team logos
  async setTeamLogo(sport: string, teamName: string, logoData: any, ttlSeconds: number = 604800): Promise<void> {
    const normalizedName = teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    await this.set(`teams:logos:${sport}:${normalizedName}`, logoData, ttlSeconds);
  }

  async getTeamLogo(sport: string, teamName: string): Promise<any | null> {
    const normalizedName = teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return await this.get<any>(`teams:logos:${sport}:${normalizedName}`);
  }

  // Cache ready flag
  async setCacheReady(ready: boolean): Promise<void> {
    const key = process.env.CACHE_READY_KEY || 'cache:ready';
    await this.set(key, ready);
  }

  async isCacheReady(): Promise<boolean> {
    const key = process.env.CACHE_READY_KEY || 'cache:ready';
    const result = await this.get<boolean>(key);
    return result === true;
  }

  // Cache report
  async setCacheReport(report: any): Promise<void> {
    const timestamp = Date.now();
    await this.set(`cache:report:${timestamp}`, report, 86400); // 24 hours
  }

  async getLatestCacheReport(): Promise<any | null> {
    const keys = await this.keys('cache:report:*');
    if (keys.length === 0) return null;

    keys.sort().reverse();
    return await this.get<any>(keys[0]);
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async getStats(): Promise<any> {
    const info = await this.client.info('stats');
    const memory = await this.client.info('memory');
    
    return {
      connected: this.connected,
      info: info.split('\r\n').reduce((acc: any, line) => {
        const [key, value] = line.split(':');
        if (key && value) acc[key] = value;
        return acc;
      }, {}),
      memory: memory.split('\r\n').reduce((acc: any, line) => {
        const [key, value] = line.split(':');
        if (key && value) acc[key] = value;
        return acc;
      }, {}),
    };
  }
}

export const redisCache = new RedisCacheManager();
