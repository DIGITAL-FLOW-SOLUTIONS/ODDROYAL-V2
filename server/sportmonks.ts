import axios, { AxiosError, AxiosRequestConfig } from "axios";

const API_BASE_URL = "https://api.sportmonks.com/v3";
let warnedAboutMissingToken = false;

// Rate limiting and retry configuration
const RATE_LIMIT_CONFIG = {
  // SportMonks typically allows 3000 requests per hour for free tier
  requestsPerHour: 3000,
  requestsPerMinute: 60, // Conservative estimate
  burstLimit: 10, // Allow short bursts
  retryAttempts: 3,
  baseRetryDelay: 1000, // 1 second
  maxRetryDelay: 10000, // 10 seconds
};

// Token bucket for rate limiting
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed * this.refillRate);

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  canConsume(tokens: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  getWaitTime(tokens: number = 1): number {
    this.refill();
    if (this.tokens >= tokens) {
      return 0;
    }
    const tokensNeeded = tokens - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }
}

// Request queue for handling bursts
interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  requestFn: () => Promise<any>;
  priority: number;
  timestamp: number;
}

class ApiRequestManager {
  private tokenBucket: TokenBucket;
  private requestQueue: QueuedRequest[] = [];
  private processing = false;
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    averageResponseTime: 0,
    lastRequestTime: 0,
  };

  constructor() {
    // Initialize with conservative rate limiting
    this.tokenBucket = new TokenBucket(
      RATE_LIMIT_CONFIG.burstLimit,
      RATE_LIMIT_CONFIG.requestsPerMinute / 60,
    );
  }

  async makeRequest<T>(
    requestFn: () => Promise<T>,
    priority: number = 1,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        requestFn,
        priority,
        timestamp: Date.now(),
      });

      // Sort by priority (higher first) then by timestamp
      this.requestQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const queuedRequest = this.requestQueue.shift()!;

      if (!this.tokenBucket.canConsume()) {
        const waitTime = this.tokenBucket.getWaitTime();
        this.metrics.rateLimitedRequests++;

        console.log(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Check if we can consume now
        if (!this.tokenBucket.canConsume()) {
          // Put request back at the front
          this.requestQueue.unshift(queuedRequest);
          continue;
        }
      }

      try {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        this.metrics.lastRequestTime = startTime;

        const result = await this.executeWithRetry(queuedRequest.requestFn);

        const responseTime = Date.now() - startTime;
        this.updateMetrics(responseTime, true);

        queuedRequest.resolve(result);
      } catch (error) {
        this.metrics.failedRequests++;
        queuedRequest.reject(error);
      }

      // Small delay between requests to be respectful
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  private async executeWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (
      let attempt = 1;
      attempt <= RATE_LIMIT_CONFIG.retryAttempts;
      attempt++
    ) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors or client errors (4xx except 429)
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw error;
          }
        }

        if (attempt < RATE_LIMIT_CONFIG.retryAttempts) {
          const delay = Math.min(
            RATE_LIMIT_CONFIG.baseRetryDelay * Math.pow(2, attempt - 1),
            RATE_LIMIT_CONFIG.maxRetryDelay,
          );

          console.log(
            `API request failed (attempt ${attempt}/${RATE_LIMIT_CONFIG.retryAttempts}), retrying in ${delay}ms:`,
            (error as Error).message,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  private updateMetrics(responseTime: number, success: boolean): void {
    if (success) {
      this.metrics.successfulRequests++;
      // Update rolling average response time
      const alpha = 0.1; // Smoothing factor
      this.metrics.averageResponseTime =
        alpha * responseTime + (1 - alpha) * this.metrics.averageResponseTime;
    }
  }

  getMetrics() {
    const successRate =
      this.metrics.totalRequests > 0
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
        : 0;

    return {
      ...this.metrics,
      successRate: Math.round(successRate * 100) / 100,
      queueLength: this.requestQueue.length,
    };
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    const timeSinceLastRequest = Date.now() - metrics.lastRequestTime;

    return {
      healthy: metrics.successRate > 80 && timeSinceLastRequest < 300000, // 5 minutes
      metrics,
      status:
        metrics.successRate > 95
          ? "excellent"
          : metrics.successRate > 80
            ? "good"
            : metrics.successRate > 50
              ? "poor"
              : "critical",
    };
  }
}

// Global request manager instance
const requestManager = new ApiRequestManager();

function getApiToken(): string | undefined {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token && !warnedAboutMissingToken) {
    console.warn(
      "SportMonks API token not found in environment variables. API functionality will be limited.",
    );
    warnedAboutMissingToken = true;
  }
  return token;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 second timeout
});

// Caching layer
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class ApiCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize = 1000; // Maximum cache entries

  set<T>(key: string, data: T, ttlMinutes: number = 5): void {
    // Clean old entries if cache is getting full
    if (this.cache.size >= this.maxSize) {
      this.cleanExpired();

      // If still full after cleaning, remove oldest entries
      if (this.cache.size >= this.maxSize) {
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.1));
        toRemove.forEach(([key]) => this.cache.delete(key));
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  // Get stale data even if expired (for graceful degradation)
  getStale<T>(key: string, maxStaleAgeMinutes: number = 60): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const maxStaleAge = maxStaleAgeMinutes * 60 * 1000;

    // Allow stale data up to maxStaleAgeMinutes old
    if (now - entry.timestamp > maxStaleAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  // Check if stale data exists
  hasStale(key: string, maxStaleAgeMinutes: number = 60): boolean {
    return this.getStale(key, maxStaleAgeMinutes) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach((key) => this.cache.delete(key));
  }

  getStats() {
    this.cleanExpired();
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Could be tracked with additional counters
    };
  }
}

const apiCache = new ApiCache();

// Enhanced logging with structured format
class ApiLogger {
  // Redact sensitive fields from params before logging
  private static redactSensitiveData(obj: any): any {
    if (!obj || typeof obj !== "object") {
      return obj;
    }

    const sensitiveFields = [
      "api_token",
      "token",
      "password",
      "secret",
      "key",
      "auth",
    ];
    const redacted = { ...obj };

    for (const field of sensitiveFields) {
      if (redacted[field]) {
        redacted[field] = "[REDACTED]";
      }
    }

    return redacted;
  }

  static logRequest(endpoint: string, params: any, method: string = "GET") {
    console.log(`[SportMonks API] ${method} ${endpoint}`, {
      params: this.redactSensitiveData(params),
      timestamp: new Date().toISOString(),
    });
  }

  static logResponse(
    endpoint: string,
    success: boolean,
    responseTime: number,
    error?: any,
  ) {
    const level = success ? "info" : "error";
    console.log(`[SportMonks API] Response - ${endpoint}`, {
      success,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      error: error?.message || null,
      status: error?.response?.status || null,
    });
  }

  static logCacheHit(cacheKey: string) {
    console.log(`[SportMonks API] Cache HIT - ${cacheKey}`, {
      timestamp: new Date().toISOString(),
    });
  }

  static logCacheMiss(cacheKey: string) {
    console.log(`[SportMonks API] Cache MISS - ${cacheKey}`, {
      timestamp: new Date().toISOString(),
    });
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private readonly failureThreshold = 5;
  private readonly timeoutDuration = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.timeoutDuration) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error(
          "Circuit breaker is OPEN - API is temporarily unavailable",
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(
        `[SportMonks API] Circuit breaker opened after ${this.failures} failures`,
      );
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

const circuitBreaker = new CircuitBreaker();

export interface SportMonksFixture {
  id: number;
  name: string;
  starting_at: string;
  result_info: string | null;
  leg: string;
  details: string | null;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  participants: Array<{
    id: number;
    sport_id: number;
    country_id: number;
    venue_id: number;
    gender: string;
    name: string;
    short_code: string;
    image_path: string;
    founded: number;
    type: string;
    placeholder: boolean;
    last_played_at: string;
    meta: {
      location: string;
      winner: boolean;
      position: number;
    };
  }>;
  state: {
    id: number;
    state: string;
    name: string;
    short_name: string;
    developer_name: string;
  };
  league: {
    id: number;
    sport_id: number;
    country_id: number;
    name: string;
    active: boolean;
    short_code: string;
    image_path: string;
    type: string;
    sub_type: string;
    last_played_at: string;
  };
  scores: Array<{
    id: number;
    fixture_id: number;
    type_id: number;
    participant_id: number;
    score: {
      goals: number;
      participant: string;
    };
    description: string;
  }>;
}

export interface SportMonksOdds {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  handicap: string | null;
  total: string | null;
  winning: boolean;
  stopped: boolean;
  last_update: {
    date: string;
    timezone_type: number;
    timezone: string;
  };
  market: {
    id: number;
    name: string;
    developer_name: string;
    has_winning_calculations: boolean;
  };
}

// Grouped fixtures interfaces for multi-sport support
export interface SportInfo {
  id: number;
  name: string;
  icon: string;
  endpoint: string;
}

export interface LeagueGroupedFixtures {
  league: {
    id: number;
    name: string;
    country_name: string;
    sport_id: number;
  };
  fixtures: SportMonksFixture[];
  count: number;
}

export interface SportGroupedFixtures {
  sport: SportInfo;
  leagues: LeagueGroupedFixtures[];
  totalFixtures: number;
  lastUpdated: string;
}

export interface AllSportsFixtures {
  upcoming: SportGroupedFixtures[];
  live: SportGroupedFixtures[];
  totalUpcoming: number;
  totalLive: number;
  lastUpdated: string;
  fetchStatus: {
    [sportId: number]: {
      upcoming: boolean;
      live: boolean;
      lastFetch: string;
    };
  };
}

// Enhanced API wrapper with caching and error handling
async function makeApiRequest<T>(
  endpoint: string,
  params: any,
  cacheKey: string,
  cacheTtlMinutes: number = 5,
  priority: number = 1,
): Promise<T> {
  // Check cache first
  const cached = apiCache.get<T>(cacheKey);
  if (cached) {
    ApiLogger.logCacheHit(cacheKey);
    return cached;
  }

  ApiLogger.logCacheMiss(cacheKey);

  const token = getApiToken();
  if (!token) {
    throw new Error("SportMonks API token not available");
  }

  const startTime = Date.now();
  ApiLogger.logRequest(endpoint, params);

  try {
    const result = await circuitBreaker.execute(async () => {
      return await requestManager.makeRequest(async () => {
        const response = await api.get(endpoint, {
          params: {
            api_token: token,
            ...params,
          },
        });
        return response.data;
      }, priority);
    });

    const responseTime = Date.now() - startTime;
    ApiLogger.logResponse(endpoint, true, responseTime);

    // Cache the result
    apiCache.set(cacheKey, result, cacheTtlMinutes);

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    ApiLogger.logResponse(endpoint, false, responseTime, error);
    throw error;
  }
}

// Get upcoming fixtures with enhanced error handling and multi-sport support
export async function getUpcomingFixtures(
  limit: number = 20,
  sportId?: number,
): Promise<SportMonksFixture[]> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `upcoming_fixtures_${sportId || 'football'}_${limit}`;

  try {
    const result = await makeApiRequest<{data: SportMonksFixture[]}>(
      `/${sportEndpoint}/fixtures`,
      {
        include: "participants;league;state;scores",
        per_page: limit,
        filters: "fixtureStates:1", // Upcoming matches
      },
      cacheKey,
      2, // Cache for 2 minutes for upcoming matches
      2, // High priority
    );

    const fixtures = result.data || [];
    return validateAndTransformFixtures(fixtures);
  } catch (error) {
    console.warn(
      `Failed to fetch upcoming fixtures from API for ${sportEndpoint}:`,
      (error as Error).message,
    );

    // Gradual degradation: try to return stale cached data (up to 60 minutes old)
    const staleCache = apiCache.getStale<any>(cacheKey, 60);
    if (staleCache) {
      console.log(
        `Using stale cache for upcoming fixtures (graceful degradation) - ${sportEndpoint}`,
      );
      const fixtures = staleCache.data || [];
      return validateAndTransformFixtures(fixtures);
    }

    // For non-football sports, return empty array instead of mock data
    if (sportId && sportId !== 1) {
      console.warn(
        `No mock data available for ${sportEndpoint} upcoming fixtures`,
      );
      return [];
    }

    // Last resort: return a limited set of mock data but log it (only for football)
    console.warn(
      "Using mock data for upcoming fixtures - API and stale cache unavailable",
    );
    return getMockUpcomingFixtures().slice(0, Math.min(3, limit)); // Limit mock data
  }
}

// Get live fixtures by sport with enhanced error handling
export async function getLiveFixtures(
  limit: number = 50,
  sportId?: number,
): Promise<SportMonksFixture[]> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `live_fixtures_${sportId || "all"}_${limit}`;

  try {
    const result = await makeApiRequest<{data: SportMonksFixture[]}>(
      `/${sportEndpoint}/fixtures`,
      {
        include: "participants;league;state;scores",
        per_page: limit,
        filters: "fixtureStates:2", // Live matches
      },
      cacheKey,
      0.5, // Cache for 30 seconds for live data
      3, // Highest priority for live data
    );

    const fixtures = result.data || [];
    return validateAndTransformFixtures(fixtures);
  } catch (error) {
    console.warn(
      "Failed to fetch live fixtures from API:",
      (error as Error).message,
    );

    // For live data, don't fall back to mock data - return empty array
    // This ensures we don't show stale or fake live matches
    console.log("No live fixtures available due to API error");
    return [];
  }
}

// Get live Football fixtures only
export async function getLiveFootballFixtures(limit: number = 50): Promise<SportMonksFixture[]> {
  return getLiveFixtures(limit, 1); // Football sport ID is 1
}

// Get upcoming fixtures for a specific sport
export async function getUpcomingFixturesBySport(
  sportId: number,
  limit: number = 20,
): Promise<SportMonksFixture[]> {
  return getUpcomingFixtures(limit, sportId);
}

// Get live fixtures for a specific sport
export async function getLiveFixturesBySport(
  sportId: number,
  limit: number = 50,
): Promise<SportMonksFixture[]> {
  return getLiveFixtures(limit, sportId);
}

// Get all sports fixtures with proper grouping
export async function getAllSportsFixtures(
  upcomingLimit: number = 10,
  liveLimit: number = 20,
): Promise<AllSportsFixtures> {
  const sports = await getSports();
  const startTime = Date.now();
  
  // Create parallel requests for all sports
  const upcomingPromises = sports.map(sport => 
    getUpcomingFixtures(upcomingLimit, sport.id)
      .then(fixtures => ({ sport, fixtures }))
      .catch(error => {
        console.warn(`Failed to fetch upcoming fixtures for ${sport.name}:`, error.message);
        return { sport, fixtures: [] };
      })
  );
  
  const livePromises = sports.map(sport => 
    getLiveFixtures(liveLimit, sport.id)
      .then(fixtures => ({ sport, fixtures }))
      .catch(error => {
        console.warn(`Failed to fetch live fixtures for ${sport.name}:`, error.message);
        return { sport, fixtures: [] };
      })
  );

  try {
    // Execute all requests in parallel
    const [upcomingResults, liveResults] = await Promise.all([
      Promise.all(upcomingPromises),
      Promise.all(livePromises)
    ]);

    // Group fixtures by sport and league
    const upcomingGrouped = upcomingResults
      .filter(result => result.fixtures.length > 0)
      .map(result => groupFixturesBySport(result.sport, result.fixtures));
    
    const liveGrouped = liveResults
      .filter(result => result.fixtures.length > 0)
      .map(result => groupFixturesBySport(result.sport, result.fixtures));

    // Calculate totals
    const totalUpcoming = upcomingGrouped.reduce((sum, sport) => sum + sport.totalFixtures, 0);
    const totalLive = liveGrouped.reduce((sum, sport) => sum + sport.totalFixtures, 0);

    // Build fetch status
    const fetchStatus: { [sportId: number]: { upcoming: boolean; live: boolean; lastFetch: string; } } = {};
    const fetchTime = new Date().toISOString();
    
    sports.forEach(sport => {
      fetchStatus[sport.id] = {
        upcoming: upcomingResults.some(r => r.sport.id === sport.id && r.fixtures.length > 0),
        live: liveResults.some(r => r.sport.id === sport.id && r.fixtures.length > 0),
        lastFetch: fetchTime
      };
    });

    return {
      upcoming: upcomingGrouped,
      live: liveGrouped,
      totalUpcoming,
      totalLive,
      lastUpdated: fetchTime,
      fetchStatus
    };
  } catch (error) {
    console.error('Failed to fetch all sports fixtures:', (error as Error).message);
    
    // Return empty structure on failure
    return {
      upcoming: [],
      live: [],
      totalUpcoming: 0,
      totalLive: 0,
      lastUpdated: new Date().toISOString(),
      fetchStatus: {}
    };
  }
}

// Group fixtures by sport and then by league
function groupFixturesBySport(sport: SportInfo, fixtures: SportMonksFixture[]): SportGroupedFixtures {
  // Group fixtures by league
  const leagueGroups = new Map<number, {
    league: {
      id: number;
      name: string;
      country_name: string;
      sport_id: number;
    };
    fixtures: SportMonksFixture[];
  }>();

  fixtures.forEach(fixture => {
    const leagueId = fixture.league.id;
    
    if (!leagueGroups.has(leagueId)) {
      leagueGroups.set(leagueId, {
        league: {
          id: fixture.league.id,
          name: fixture.league.name,
          country_name: 'Unknown', // Will be populated if country data is available
          sport_id: fixture.league.sport_id
        },
        fixtures: []
      });
    }
    
    leagueGroups.get(leagueId)!.fixtures.push(fixture);
  });

  // Convert to array and add counts
  const leagues: LeagueGroupedFixtures[] = Array.from(leagueGroups.values())
    .map(group => ({
      league: group.league,
      fixtures: group.fixtures.sort((a, b) => 
        new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime()
      ),
      count: group.fixtures.length
    }))
    .sort((a, b) => b.count - a.count); // Sort leagues by fixture count (desc)

  return {
    sport,
    leagues,
    totalFixtures: fixtures.length,
    lastUpdated: new Date().toISOString()
  };
}

// Get fixtures grouped by league for all sports or a specific sport
export async function getFixturesByLeague(
  sportId?: number,
  includeUpcoming: boolean = true,
  includeLive: boolean = true,
  upcomingLimit: number = 20,
  liveLimit: number = 20
): Promise<SportGroupedFixtures[]> {
  const sports = sportId ? await getSports().then(s => s.filter(sport => sport.id === sportId)) : await getSports();
  
  if (sports.length === 0) {
    console.warn(`No sport found with ID ${sportId}`);
    return [];
  }

  const results: SportGroupedFixtures[] = [];

  // Process each sport
  for (const sport of sports) {
    try {
      const allFixtures: SportMonksFixture[] = [];
      
      // Fetch upcoming fixtures if requested
      if (includeUpcoming) {
        const upcoming = await getUpcomingFixtures(upcomingLimit, sport.id);
        allFixtures.push(...upcoming);
      }
      
      // Fetch live fixtures if requested
      if (includeLive) {
        const live = await getLiveFixtures(liveLimit, sport.id);
        allFixtures.push(...live);
      }
      
      // Skip sports with no fixtures
      if (allFixtures.length === 0) {
        continue;
      }
      
      // Group the fixtures for this sport
      const grouped = groupFixturesBySport(sport, allFixtures);
      results.push(grouped);
      
    } catch (error) {
      console.warn(`Failed to fetch fixtures for ${sport.name}:`, (error as Error).message);
      // Continue with other sports even if one fails
    }
  }

  return results.sort((a, b) => b.totalFixtures - a.totalFixtures);
}

// Export comprehensive API for external use
export const SportMonksMultiSportAPI = {
  // Core fixture functions
  getUpcomingFixtures,
  getLiveFixtures,
  getUpcomingFixturesBySport,
  getLiveFixturesBySport,
  
  // Comprehensive data functions
  getAllSportsFixtures,
  getFixturesByLeague,
  getSportsSummary,
  
  // Sport and league data
  getSports,
  getSportById,
  getLeagues,
  
  // Odds and results
  getFixtureOdds,
  getFixtureResult,
  
  // Cache and health
  getApiHealthStatus,
  getApiMetrics,
  getCacheStats,
  getCacheStatusBySport,
  clearApiCache,
  clearSportCache,
  warmUpCache,
  testApiConnectivity
};

// Get sports list (static data - doesn't require API call)
export async function getSports(): Promise<SportInfo[]> {
  // This data rarely changes, so we can keep it static
  // If needed, this could be enhanced to fetch from API and cache for 24 hours
  return [
    { id: 1, name: "Football", icon: "Football", endpoint: "football" },
    { id: 3, name: "Hockey", icon: "Hockey", endpoint: "ice-hockey" },
    { id: 5, name: "Tennis", icon: "Tennis", endpoint: "tennis" },
    { id: 2, name: "Basketball", icon: "Basketball", endpoint: "basketball" },
    { id: 4, name: "Baseball", icon: "Baseball", endpoint: "baseball" },
    { id: 6, name: "Volleyball", icon: "Volleyball", endpoint: "volleyball" },
    { id: 7, name: "Rugby", icon: "Rugby", endpoint: "rugby" },
  ];
}

// API Health and Monitoring endpoints
export function getApiHealthStatus() {
  const requestManagerHealth = requestManager.getHealthStatus();
  const circuitBreakerState = circuitBreaker.getState();
  const cacheStats = apiCache.getStats();

  const overallHealth =
    requestManagerHealth.healthy && circuitBreakerState.state !== "OPEN";

  return {
    healthy: overallHealth,
    timestamp: new Date().toISOString(),
    components: {
      api: {
        healthy: requestManagerHealth.healthy,
        status: requestManagerHealth.status,
        metrics: requestManagerHealth.metrics,
      },
      circuitBreaker: {
        state: circuitBreakerState.state,
        failures: circuitBreakerState.failures,
        lastFailureTime: circuitBreakerState.lastFailureTime,
        healthy: circuitBreakerState.state !== "OPEN",
      },
      cache: {
        size: cacheStats.size,
        maxSize: cacheStats.maxSize,
        utilization: Math.round((cacheStats.size / cacheStats.maxSize) * 100),
        healthy: cacheStats.size < cacheStats.maxSize * 0.9, // Healthy if < 90% full
      },
      authentication: {
        hasToken: Boolean(process.env.SPORTMONKS_API_TOKEN),
        healthy: Boolean(process.env.SPORTMONKS_API_TOKEN),
        tokenSource: process.env.SPORTMONKS_API_TOKEN ? 'environment' : 'missing',
      },
    },
  };
}

export function getApiMetrics() {
  return requestManager.getMetrics();
}

export function getCacheStats() {
  return apiCache.getStats();
}

// Utility to clear cache (useful for testing or manual cache invalidation)
export function clearApiCache() {
  apiCache.clear();
  console.log("[SportMonks API] Cache cleared manually");
}

// Utility to warm up the cache with essential data for all sports
export async function warmUpCache() {
  console.log("[SportMonks API] Starting multi-sport cache warm-up...");

  try {
    const sports = await getSports();
    
    // Warm up with essential data for all sports
    const promises = [
      // Football (main sport) - get more data
      getUpcomingFixtures(20, 1), 
      getLiveFixtures(50, 1),
      getLeagues(1),
      // Other sports - get fewer fixtures to avoid rate limits
      ...sports.filter(s => s.id !== 1).map(sport => 
        getUpcomingFixtures(5, sport.id).catch(error => {
          console.log(`Cache warm-up for ${sport.name} upcoming fixtures skipped:`, error.message);
          return [];
        })
      ),
      ...sports.filter(s => s.id !== 1).map(sport => 
        getLiveFixtures(5, sport.id).catch(error => {
          console.log(`Cache warm-up for ${sport.name} live fixtures skipped:`, error.message);
          return [];
        })
      ),
      // Warm up leagues for other sports (cached for 1 hour, so safe)
      ...sports.filter(s => s.id !== 1).map(sport => 
        getLeagues(sport.id).catch(error => {
          console.log(`Cache warm-up for ${sport.name} leagues skipped:`, error.message);
          return [];
        })
      )
    ];

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[SportMonks API] Multi-sport cache warm-up completed: ${successCount} successful, ${failureCount} failed`);
  } catch (error) {
    console.warn(
      "[SportMonks API] Cache warm-up failed:",
      (error as Error).message,
    );
  }
}

// Enhanced error reporting with context
export class SportMonksApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "SportMonksApiError";
  }
}

// Utility for testing API connectivity
export async function testApiConnectivity(): Promise<{
  success: boolean;
  message: string;
  responseTime?: number;
  error?: string;
}> {
  const token = getApiToken();
  if (!token) {
    return {
      success: false,
      message: "SportMonks API token not available",
    };
  }

  const startTime = Date.now();

  try {
    // Test with a simple API call
    await api.get("/football/fixtures", {
      params: {
        api_token: token,
        per_page: 1,
      },
      timeout: 10000,
    });

    const responseTime = Date.now() - startTime;

    return {
      success: true,
      message: "SportMonks API connectivity test successful",
      responseTime,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "SportMonks API connectivity test failed",
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

function getSportEndpoint(sportId?: number): string {
  const sportMap: { [key: number]: string } = {
    1: "football",
    2: "basketball",
    3: "ice-hockey",
    4: "baseball",
    5: "tennis",
    6: "volleyball",
    7: "rugby",
  };
  return sportMap[sportId || 1] || "football";
}

// Data validation and transformation utilities
function validateAndTransformFixtures(fixtures: any[]): SportMonksFixture[] {
  if (!Array.isArray(fixtures)) {
    console.warn("Invalid fixtures data received - not an array");
    return [];
  }

  return fixtures
    .filter((fixture) => {
      // Basic validation - ensure required fields exist
      const hasRequiredFields =
        fixture &&
        typeof fixture.id === "number" &&
        typeof fixture.name === "string" &&
        fixture.starting_at &&
        fixture.participants &&
        Array.isArray(fixture.participants) &&
        fixture.participants.length >= 2;

      if (!hasRequiredFields) {
        console.warn(`Invalid fixture data:`, {
          id: fixture?.id,
          name: fixture?.name,
        });
        return false;
      }

      return true;
    })
    .map((fixture) => {
      // Transform and normalize the fixture data
      return {
        id: fixture.id,
        name:
          fixture.name ||
          `${fixture.participants?.[0]?.name} vs ${fixture.participants?.[1]?.name}`,
        starting_at: fixture.starting_at,
        result_info: fixture.result_info || null,
        leg: fixture.leg || "1/1",
        details: fixture.details || null,
        length: fixture.length || 90,
        placeholder: Boolean(fixture.placeholder),
        has_odds: Boolean(fixture.has_odds),
        participants:
          fixture.participants?.map((p: any) => ({
            id: p.id || 0,
            sport_id: p.sport_id || 1,
            country_id: p.country_id || 0,
            venue_id: p.venue_id || 0,
            gender: p.gender || "male",
            name: p.name || "Unknown Team",
            short_code: p.short_code || "",
            image_path: p.image_path || "",
            founded: p.founded || 0,
            type: p.type || "domestic",
            placeholder: Boolean(p.placeholder),
            last_played_at: p.last_played_at || new Date().toISOString(),
            meta: {
              location: p.meta?.location || "unknown",
              winner: Boolean(p.meta?.winner),
              position: p.meta?.position || 0,
            },
          })) || [],
        state: {
          id: fixture.state?.id || 0,
          state: fixture.state?.state || "UNKNOWN",
          name: fixture.state?.name || "Unknown",
          short_name: fixture.state?.short_name || "UNK",
          developer_name: fixture.state?.developer_name || "UNKNOWN",
        },
        league: {
          id: fixture.league?.id || 0,
          sport_id: fixture.league?.sport_id || 1,
          country_id: fixture.league?.country_id || 0,
          name: fixture.league?.name || "Unknown League",
          active: Boolean(fixture.league?.active ?? true),
          short_code: fixture.league?.short_code || "",
          image_path: fixture.league?.image_path || "",
          type: fixture.league?.type || "league",
          sub_type: fixture.league?.sub_type || "domestic",
          last_played_at:
            fixture.league?.last_played_at || new Date().toISOString(),
        },
        scores: Array.isArray(fixture.scores)
          ? fixture.scores.map((s: any) => ({
              id: s.id || 0,
              fixture_id: s.fixture_id || fixture.id,
              type_id: s.type_id || 0,
              participant_id: s.participant_id || 0,
              score: {
                goals: Number(s.score?.goals) || 0,
                participant: s.score?.participant || "Unknown",
              },
              description: s.description || "unknown",
            }))
          : [],
      };
    });
}

function validateAndTransformOdds(odds: any[]): SportMonksOdds[] {
  if (!Array.isArray(odds)) {
    console.warn("Invalid odds data received - not an array");
    return [];
  }

  return odds
    .filter((odd) => {
      const hasRequiredFields =
        odd &&
        typeof odd.id === "number" &&
        typeof odd.fixture_id === "number" &&
        odd.value &&
        odd.market;

      if (!hasRequiredFields) {
        console.warn(`Invalid odds data:`, {
          id: odd?.id,
          fixture_id: odd?.fixture_id,
        });
        return false;
      }

      return true;
    })
    .map((odd) => ({
      id: odd.id,
      fixture_id: odd.fixture_id,
      market_id: odd.market_id || 0,
      bookmaker_id: odd.bookmaker_id || 0,
      label: odd.label || "",
      value: odd.value,
      handicap: odd.handicap || null,
      total: odd.total || null,
      winning: Boolean(odd.winning),
      stopped: Boolean(odd.stopped),
      last_update: odd.last_update || {
        date: new Date().toISOString(),
        timezone_type: 3,
        timezone: "UTC",
      },
      market: {
        id: odd.market?.id || 0,
        name: odd.market?.name || "Unknown Market",
        developer_name: odd.market?.developer_name || "unknown",
        has_winning_calculations: Boolean(odd.market?.has_winning_calculations),
      },
    }));
}

// Get odds for a fixture with enhanced error handling and multi-sport support
export async function getFixtureOdds(
  fixtureId: number,
  sportId?: number,
): Promise<SportMonksOdds[]> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `fixture_odds_${sportId || 'football'}_${fixtureId}`;

  try {
    const result = await makeApiRequest<{data: SportMonksOdds[]}>(
      `/${sportEndpoint}/odds`,
      {
        include: "market",
        filters: `fixtures:${fixtureId};markets:1,2,3,18`, // 1x2, Over/Under, Both Teams to Score, Double Chance
      },
      cacheKey,
      1, // Cache for 1 minute for odds
      2, // High priority
    );

    const odds = result.data || [];
    return validateAndTransformOdds(odds);
  } catch (error) {
    console.warn(
      `Failed to fetch odds for fixture ${fixtureId} in ${sportEndpoint}:`,
      (error as Error).message,
    );

    // For odds, we don't want to return mock data - return empty array
    // This ensures betting is disabled when real odds aren't available
    return [];
  }
}

// Get comprehensive sports summary for dashboard display
export async function getSportsSummary(): Promise<{
  sports: Array<{
    sport: SportInfo;
    upcomingCount: number;
    liveCount: number;
    topLeagues: Array<{
      id: number;
      name: string;
      fixtureCount: number;
    }>;
    lastUpdated: string;
  }>;
  totalUpcoming: number;
  totalLive: number;
  lastUpdated: string;
}> {
  try {
    const allSportsData = await getAllSportsFixtures(5, 10); // Limited data for summary
    
    const sportsSummary = allSportsData.upcoming.map(upcomingSport => {
      const liveSport = allSportsData.live.find(ls => ls.sport.id === upcomingSport.sport.id);
      
      // Get top leagues for this sport
      const allLeagues = [...upcomingSport.leagues, ...(liveSport?.leagues || [])];
      const leagueMap = new Map<number, { id: number; name: string; fixtureCount: number }>();
      
      allLeagues.forEach(league => {
        const existing = leagueMap.get(league.league.id);
        if (existing) {
          existing.fixtureCount += league.count;
        } else {
          leagueMap.set(league.league.id, {
            id: league.league.id,
            name: league.league.name,
            fixtureCount: league.count
          });
        }
      });
      
      const topLeagues = Array.from(leagueMap.values())
        .sort((a, b) => b.fixtureCount - a.fixtureCount)
        .slice(0, 3); // Top 3 leagues
      
      return {
        sport: upcomingSport.sport,
        upcomingCount: upcomingSport.totalFixtures,
        liveCount: liveSport?.totalFixtures || 0,
        topLeagues,
        lastUpdated: upcomingSport.lastUpdated
      };
    });
    
    // Also include sports that only have live fixtures
    allSportsData.live.forEach(liveSport => {
      const existingSport = sportsSummary.find(s => s.sport.id === liveSport.sport.id);
      if (!existingSport) {
        const topLeagues = liveSport.leagues
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(league => ({
            id: league.league.id,
            name: league.league.name,
            fixtureCount: league.count
          }));
          
        sportsSummary.push({
          sport: liveSport.sport,
          upcomingCount: 0,
          liveCount: liveSport.totalFixtures,
          topLeagues,
          lastUpdated: liveSport.lastUpdated
        });
      }
    });
    
    return {
      sports: sportsSummary.filter(s => s.upcomingCount > 0 || s.liveCount > 0),
      totalUpcoming: allSportsData.totalUpcoming,
      totalLive: allSportsData.totalLive,
      lastUpdated: allSportsData.lastUpdated
    };
    
  } catch (error) {
    console.error('Failed to generate sports summary:', (error as Error).message);
    return {
      sports: [],
      totalUpcoming: 0,
      totalLive: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

// Enhanced multi-sport cache management
export function getCacheStatusBySport(): {
  [sportId: number]: {
    sportName: string;
    upcoming: { cached: boolean; age: number; };
    live: { cached: boolean; age: number; };
    odds: { cachedFixtures: number; };
  };
} {
  const sports = [
    { id: 1, name: "Football" },
    { id: 2, name: "Basketball" },
    { id: 3, name: "Hockey" },
    { id: 4, name: "Baseball" },
    { id: 5, name: "Tennis" },
    { id: 6, name: "Volleyball" },
    { id: 7, name: "Rugby" }
  ];
  
  const status: ReturnType<typeof getCacheStatusBySport> = {};
  const now = Date.now();
  
  sports.forEach(sport => {
    const upcomingKey = `upcoming_fixtures_${sport.name.toLowerCase()}_20`;
    const liveKey = `live_fixtures_${sport.id}`;
    
    status[sport.id] = {
      sportName: sport.name,
      upcoming: {
        cached: apiCache.has(upcomingKey),
        age: 0 // Would need to track cache timestamp
      },
      live: {
        cached: apiCache.has(liveKey),
        age: 0 // Would need to track cache timestamp  
      },
      odds: {
        cachedFixtures: 0 // Would need to count odds cache entries
      }
    };
  });
  
  return status;
}

// Utility function to clear cache for specific sport
export function clearSportCache(sportId: number): void {
  const sportEndpoint = getSportEndpoint(sportId);
  
  // Clear upcoming fixtures cache for this sport
  for (let limit = 5; limit <= 50; limit += 5) {
    apiCache.delete(`upcoming_fixtures_${sportEndpoint}_${limit}`);
  }
  
  // Clear live fixtures cache for this sport
  apiCache.delete(`live_fixtures_${sportId}`);
  
  console.log(`[SportMonks API] Cleared cache for ${sportEndpoint} (sport ID: ${sportId})`);
}

// Utility function to get sport info by ID
export async function getSportById(sportId: number): Promise<SportInfo | null> {
  const sports = await getSports();
  return sports.find(sport => sport.id === sportId) || null;
}

// Get leagues with enhanced error handling and multi-sport support
export async function getLeagues(sportId?: number): Promise<any[]> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `${sportEndpoint}_leagues`;

  try {
    const result = await makeApiRequest<{data: any[]}>(
      `/${sportEndpoint}/leagues`,
      {
        per_page: 50, // Get more leagues
        include: "country",
        filters: "active:true", // Only active leagues
      },
      cacheKey,
      60, // Cache for 1 hour - leagues don't change often
      1, // Normal priority
    );

    const leagues = result.data || [];
    return validateAndTransformLeagues(leagues);
  } catch (error) {
    console.warn(`Failed to fetch leagues from API for ${sportEndpoint}:`, (error as Error).message);

    // Try expired cache first
    const expiredCache = apiCache.get<any[]>(cacheKey + "_backup");
    if (expiredCache) {
      console.log(`Using expired cache for ${sportEndpoint} leagues`);
      return expiredCache;
    }

    // For non-football sports, return empty array
    if (sportId && sportId !== 1) {
      console.warn(`No mock data available for ${sportEndpoint} leagues`);
      return [];
    }

    // Fallback to basic mock leagues but log it (only for football)
    console.warn("Using mock data for football leagues - API unavailable");
    return getMockLeagues().map((league) => ({
      ...league,
      country: {
        name: league.country?.name || "Unknown",
        code: "XX",
      },
    }));
  }
}

function validateAndTransformLeagues(leagues: any[]): any[] {
  if (!Array.isArray(leagues)) {
    console.warn("Invalid leagues data received - not an array");
    return [];
  }

  return leagues
    .filter((league) => {
      const hasRequiredFields =
        league &&
        typeof league.id === "number" &&
        typeof league.name === "string";

      if (!hasRequiredFields) {
        console.warn(`Invalid league data:`, {
          id: league?.id,
          name: league?.name,
        });
        return false;
      }

      return true;
    })
    .map((league) => ({
      id: league.id,
      name: league.name,
      country: {
        name: league.country?.name || "Unknown",
        code: league.country?.code || "XX",
      },
      active: Boolean(league.active ?? true),
      short_code: league.short_code || "",
      image_path: league.image_path || "",
      type: league.type || "league",
      sub_type: league.sub_type || "domestic",
    }));
}

// Mock data fallbacks
function getMockUpcomingFixtures(): SportMonksFixture[] {
  return [
    {
      id: 1,
      name: "Manchester United vs Liverpool",
      starting_at: "2024-01-16T15:00:00Z",
      result_info: null,
      leg: "1/1",
      details: null,
      length: 90,
      placeholder: false,
      has_odds: true,
      participants: [
        {
          id: 1,
          sport_id: 1,
          country_id: 17,
          venue_id: 1,
          gender: "male",
          name: "Manchester United",
          short_code: "MUN",
          image_path: "",
          founded: 1878,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-10T20:00:00Z",
          meta: { location: "home", winner: false, position: 1 },
        },
        {
          id: 2,
          sport_id: 1,
          country_id: 17,
          venue_id: 1,
          gender: "male",
          name: "Liverpool",
          short_code: "LIV",
          image_path: "",
          founded: 1892,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-10T17:30:00Z",
          meta: { location: "away", winner: false, position: 2 },
        },
      ],
      state: {
        id: 1,
        state: "NS",
        name: "Not Started",
        short_name: "NS",
        developer_name: "NOT_STARTED",
      },
      league: {
        id: 8,
        sport_id: 1,
        country_id: 17,
        name: "Premier League",
        active: true,
        short_code: "EPL",
        image_path: "",
        type: "league",
        sub_type: "domestic",
        last_played_at: "2024-01-10T20:00:00Z",
      },
      scores: [],
    },
  ];
}

function getMockLiveFixtures(sportId?: number): SportMonksFixture[] {
  return [
    {
      id: 2,
      name: "Real Madrid vs Barcelona",
      starting_at: "2024-01-15T20:00:00Z",
      result_info: "2-1",
      leg: "1/1",
      details: null,
      length: 90,
      placeholder: false,
      has_odds: true,
      participants: [
        {
          id: 3,
          sport_id: 1,
          country_id: 15,
          venue_id: 2,
          gender: "male",
          name: "Real Madrid",
          short_code: "RMA",
          image_path: "",
          founded: 1902,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-15T20:00:00Z",
          meta: { location: "home", winner: false, position: 1 },
        },
        {
          id: 4,
          sport_id: 1,
          country_id: 15,
          venue_id: 2,
          gender: "male",
          name: "Barcelona",
          short_code: "BAR",
          image_path: "",
          founded: 1899,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-15T20:00:00Z",
          meta: { location: "away", winner: false, position: 2 },
        },
      ],
      state: {
        id: 2,
        state: "LIVE",
        name: "Live",
        short_name: "LIVE",
        developer_name: "INPLAY_1ST_HALF",
      },
      league: {
        id: 564,
        sport_id: 1,
        country_id: 15,
        name: "La Liga",
        active: true,
        short_code: "LL",
        image_path: "",
        type: "league",
        sub_type: "domestic",
        last_played_at: "2024-01-15T20:00:00Z",
      },
      scores: [
        {
          id: 1,
          fixture_id: 2,
          type_id: 1525,
          participant_id: 3,
          score: { goals: 2, participant: "Real Madrid" },
          description: "current",
        },
        {
          id: 2,
          fixture_id: 2,
          type_id: 1525,
          participant_id: 4,
          score: { goals: 1, participant: "Barcelona" },
          description: "current",
        },
      ],
    },
  ];
}

function getMockLeagues(): any[] {
  return [
    {
      id: 8,
      name: "Premier League",
      country: { name: "England" },
      active: true,
    },
    { id: 564, name: "La Liga", country: { name: "Spain" }, active: true },
    { id: 82, name: "Bundesliga", country: { name: "Germany" }, active: true },
    { id: 384, name: "Serie A", country: { name: "Italy" }, active: true },
    { id: 301, name: "Ligue 1", country: { name: "France" }, active: true },
  ];
}

// Get fixture result for settlement with enhanced error handling and multi-sport support
export async function getFixtureResult(
  fixtureId: number, 
  sportId?: number
): Promise<{
  finished: boolean;
  homeScore: number;
  awayScore: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  status: "finished" | "cancelled" | "postponed" | "ongoing";
} | null> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `fixture_result_${sportEndpoint}_${fixtureId}`;

  try {
    const result = await makeApiRequest<any>(
      `/${sportEndpoint}/fixtures/${fixtureId}`,
      {
        include: "participants;scores;state",
      },
      cacheKey,
      5, // Cache for 5 minutes for match results
      3, // Highest priority for settlement data
    );

    const fixture = result.data;
    if (!fixture) {
      console.warn(`No fixture data found for ID ${fixtureId} in ${sportEndpoint}`);
      return null;
    }

    return transformFixtureResult(fixture);
  } catch (error) {
    console.warn(
      `Failed to fetch fixture result for ${fixtureId} in ${sportEndpoint}:`,
      (error as Error).message,
    );
    return null; // No fallback for settlement data - must be accurate
  }
}

function transformFixtureResult(fixture: any): {
  finished: boolean;
  homeScore: number;
  awayScore: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  status: "finished" | "cancelled" | "postponed" | "ongoing";
} {
  // Get match state
  const state =
    fixture.state?.name || fixture.state?.developer_name || "UNKNOWN";

  // Check different match states with more comprehensive coverage
  const finishedStates = ["FT", "AET", "PEN", "FINISHED", "FT_PEN"];
  const cancelledStates = ["CANCELLED", "ABANDONED", "SUSPENDED"];
  const postponedStates = ["POSTPONED", "DELAYED", "TBA"];

  const isFinished = finishedStates.includes(state);
  const isCancelled = cancelledStates.includes(state);
  const isPostponed = postponedStates.includes(state);

  let matchStatus: "finished" | "cancelled" | "postponed" | "ongoing";
  if (isFinished) {
    matchStatus = "finished";
  } else if (isCancelled) {
    matchStatus = "cancelled";
  } else if (isPostponed) {
    matchStatus = "postponed";
  } else {
    matchStatus = "ongoing";
  }

  // Get team names with better error handling
  const participants = fixture.participants || [];
  const homeTeam =
    participants.find((p: any) => p.meta?.location === "home")?.name || "Home";
  const awayTeam =
    participants.find((p: any) => p.meta?.location === "away")?.name || "Away";

  // Extract scores for finished matches with improved logic
  let homeScore = 0;
  let awayScore = 0;

  if (isFinished && fixture.scores) {
    const scores = fixture.scores;

    // Find home and away team participant IDs
    const homeParticipant = participants.find(
      (p: any) => p.meta?.location === "home",
    );
    const awayParticipant = participants.find(
      (p: any) => p.meta?.location === "away",
    );

    if (homeParticipant && awayParticipant) {
      // Look for current scores by participant ID (more reliable)
      const homeScoreEntry = scores.find(
        (s: any) =>
          s.participant_id === homeParticipant.id &&
          (s.description === "current" || s.description === "CURRENT"),
      );
      const awayScoreEntry = scores.find(
        (s: any) =>
          s.participant_id === awayParticipant.id &&
          (s.description === "current" || s.description === "CURRENT"),
      );

      homeScore = Number(homeScoreEntry?.score?.goals) || 0;
      awayScore = Number(awayScoreEntry?.score?.goals) || 0;
    } else {
      // Fallback to name-based matching
      const homeScoreEntry = scores.find((s: any) => {
        const participant = s.score?.participant?.toLowerCase();
        return (
          (participant === "home" || participant === homeTeam.toLowerCase()) &&
          (s.description === "current" || s.description === "CURRENT")
        );
      });
      const awayScoreEntry = scores.find((s: any) => {
        const participant = s.score?.participant?.toLowerCase();
        return (
          (participant === "away" || participant === awayTeam.toLowerCase()) &&
          (s.description === "current" || s.description === "CURRENT")
        );
      });

      homeScore = Number(homeScoreEntry?.score?.goals) || 0;
      awayScore = Number(awayScoreEntry?.score?.goals) || 0;
    }
  }

  return {
    finished: isFinished || isCancelled || isPostponed,
    homeScore,
    awayScore,
    homeTeam,
    awayTeam,
    matchDate: fixture.starting_at || new Date().toISOString(),
    status: matchStatus,
  };
}
