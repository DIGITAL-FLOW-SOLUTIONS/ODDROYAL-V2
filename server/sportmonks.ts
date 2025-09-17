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
      RATE_LIMIT_CONFIG.requestsPerMinute / 60
    );
  }

  async makeRequest<T>(requestFn: () => Promise<T>, priority: number = 1): Promise<T> {
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
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
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
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  private async executeWithRetry<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= RATE_LIMIT_CONFIG.retryAttempts; attempt++) {
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
            RATE_LIMIT_CONFIG.maxRetryDelay
          );
          
          console.log(`API request failed (attempt ${attempt}/${RATE_LIMIT_CONFIG.retryAttempts}), retrying in ${delay}ms:`, (error as Error).message);
          await new Promise(resolve => setTimeout(resolve, delay));
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
    const successRate = this.metrics.totalRequests > 0 
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
      status: metrics.successRate > 95 ? 'excellent' : 
             metrics.successRate > 80 ? 'good' : 
             metrics.successRate > 50 ? 'poor' : 'critical'
    };
  }
}

// Global request manager instance
const requestManager = new ApiRequestManager();

function getApiToken(): string | undefined {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token && !warnedAboutMissingToken) {
    console.warn("SportMonks API token not found in environment variables. API functionality will be limited.");
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
  private cache = new Map<string, CacheEntry<any>>();
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
    
    expiredKeys.forEach(key => this.cache.delete(key));
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
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const sensitiveFields = ['api_token', 'token', 'password', 'secret', 'key', 'auth'];
    const redacted = { ...obj };
    
    for (const field of sensitiveFields) {
      if (redacted[field]) {
        redacted[field] = '[REDACTED]';
      }
    }
    
    return redacted;
  }

  static logRequest(endpoint: string, params: any, method: string = 'GET') {
    console.log(`[SportMonks API] ${method} ${endpoint}`, {
      params: this.redactSensitiveData(params),
      timestamp: new Date().toISOString(),
    });
  }

  static logResponse(endpoint: string, success: boolean, responseTime: number, error?: any) {
    const level = success ? 'info' : 'error';
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
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly failureThreshold = 5;
  private readonly timeoutDuration = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeoutDuration) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - API is temporarily unavailable');
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
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[SportMonks API] Circuit breaker opened after ${this.failures} failures`);
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

// Enhanced API wrapper with caching and error handling
async function makeApiRequest<T>(
  endpoint: string, 
  params: any, 
  cacheKey: string, 
  cacheTtlMinutes: number = 5,
  priority: number = 1
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
    throw new Error('SportMonks API token not available');
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

// Get upcoming fixtures with enhanced error handling
export async function getUpcomingFixtures(
  limit: number = 20,
): Promise<SportMonksFixture[]> {
  const cacheKey = `upcoming_fixtures_${limit}`;
  
  try {
    const result = await makeApiRequest<any>(
      '/football/fixtures',
      {
        include: 'participants;league;state;scores',
        per_page: limit,
        filters: 'fixtureStates:1', // Upcoming matches
      },
      cacheKey,
      2, // Cache for 2 minutes for upcoming matches
      2 // High priority
    );
    
    const fixtures = result.data || [];
    return validateAndTransformFixtures(fixtures);
  } catch (error) {
    console.warn('Failed to fetch upcoming fixtures from API:', (error as Error).message);
    
    // Gradual degradation: try to return stale cached data (up to 60 minutes old)
    const staleCache = apiCache.getStale<any>(cacheKey, 60);
    if (staleCache) {
      console.log('Using stale cache for upcoming fixtures (graceful degradation)');
      const fixtures = staleCache.data || [];
      return validateAndTransformFixtures(fixtures);
    }
    
    // Last resort: return a limited set of mock data but log it
    console.warn('Using mock data for upcoming fixtures - API and stale cache unavailable');
    return getMockUpcomingFixtures().slice(0, Math.min(3, limit)); // Limit mock data
  }
}

// Get live fixtures by sport with enhanced error handling
export async function getLiveFixtures(
  sportId?: number,
): Promise<SportMonksFixture[]> {
  const sportEndpoint = getSportEndpoint(sportId);
  const cacheKey = `live_fixtures_${sportId || 'all'}`;
  
  try {
    const result = await makeApiRequest<any>(
      `/${sportEndpoint}/fixtures`,
      {
        include: 'participants;league;state;scores',
        per_page: 50,
        filters: 'fixtureStates:2', // Live matches
      },
      cacheKey,
      0.5, // Cache for 30 seconds for live data
      3 // Highest priority for live data
    );
    
    const fixtures = result.data || [];
    return validateAndTransformFixtures(fixtures);
  } catch (error) {
    console.warn('Failed to fetch live fixtures from API:', (error as Error).message);
    
    // For live data, don't fall back to mock data - return empty array
    // This ensures we don't show stale or fake live matches
    console.log('No live fixtures available due to API error');
    return [];
  }
}

// Get live Football fixtures only
export async function getLiveFootballFixtures(): Promise<SportMonksFixture[]> {
  return getLiveFixtures(1); // Football sport ID is 1
}

// Get sports list (static data - doesn't require API call)
export async function getSports(): Promise<any[]> {
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
  
  const overallHealth = requestManagerHealth.healthy && circuitBreakerState.state !== 'OPEN';
  
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
        healthy: circuitBreakerState.state !== 'OPEN',
      },
      cache: {
        size: cacheStats.size,
        maxSize: cacheStats.maxSize,
        utilization: Math.round((cacheStats.size / cacheStats.maxSize) * 100),
        healthy: cacheStats.size < cacheStats.maxSize * 0.9, // Healthy if < 90% full
      },
      authentication: {
        hasToken: Boolean(getApiToken()),
        healthy: Boolean(getApiToken()),
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
  console.log('[SportMonks API] Cache cleared manually');
}

// Utility to warm up the cache with essential data
export async function warmUpCache() {
  console.log('[SportMonks API] Starting cache warm-up...');
  
  try {
    // Warm up with essential data that's frequently accessed
    const promises = [
      getUpcomingFixtures(10),
      getLiveFixtures(),
      getLeagues(),
    ];
    
    await Promise.allSettled(promises);
    console.log('[SportMonks API] Cache warm-up completed');
  } catch (error) {
    console.warn('[SportMonks API] Cache warm-up failed:', (error as Error).message);
  }
}

// Enhanced error reporting with context
export class SportMonksApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'SportMonksApiError';
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
      message: 'SportMonks API token not available',
    };
  }

  const startTime = Date.now();
  
  try {
    // Test with a simple API call
    await api.get('/football/fixtures', {
      params: {
        api_token: token,
        per_page: 1,
      },
      timeout: 10000,
    });
    
    const responseTime = Date.now() - startTime;
    
    return {
      success: true,
      message: 'SportMonks API connectivity test successful',
      responseTime,
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'SportMonks API connectivity test failed',
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
    console.warn('Invalid fixtures data received - not an array');
    return [];
  }

  return fixtures
    .filter(fixture => {
      // Basic validation - ensure required fields exist
      const hasRequiredFields = 
        fixture &&
        typeof fixture.id === 'number' &&
        typeof fixture.name === 'string' &&
        fixture.starting_at &&
        fixture.participants &&
        Array.isArray(fixture.participants) &&
        fixture.participants.length >= 2;
      
      if (!hasRequiredFields) {
        console.warn(`Invalid fixture data:`, { id: fixture?.id, name: fixture?.name });
        return false;
      }
      
      return true;
    })
    .map(fixture => {
      // Transform and normalize the fixture data
      return {
        id: fixture.id,
        name: fixture.name || `${fixture.participants?.[0]?.name} vs ${fixture.participants?.[1]?.name}`,
        starting_at: fixture.starting_at,
        result_info: fixture.result_info || null,
        leg: fixture.leg || '1/1',
        details: fixture.details || null,
        length: fixture.length || 90,
        placeholder: Boolean(fixture.placeholder),
        has_odds: Boolean(fixture.has_odds),
        participants: fixture.participants?.map((p: any) => ({
          id: p.id || 0,
          sport_id: p.sport_id || 1,
          country_id: p.country_id || 0,
          venue_id: p.venue_id || 0,
          gender: p.gender || 'male',
          name: p.name || 'Unknown Team',
          short_code: p.short_code || '',
          image_path: p.image_path || '',
          founded: p.founded || 0,
          type: p.type || 'domestic',
          placeholder: Boolean(p.placeholder),
          last_played_at: p.last_played_at || new Date().toISOString(),
          meta: {
            location: p.meta?.location || 'unknown',
            winner: Boolean(p.meta?.winner),
            position: p.meta?.position || 0,
          },
        })) || [],
        state: {
          id: fixture.state?.id || 0,
          state: fixture.state?.state || 'UNKNOWN',
          name: fixture.state?.name || 'Unknown',
          short_name: fixture.state?.short_name || 'UNK',
          developer_name: fixture.state?.developer_name || 'UNKNOWN',
        },
        league: {
          id: fixture.league?.id || 0,
          sport_id: fixture.league?.sport_id || 1,
          country_id: fixture.league?.country_id || 0,
          name: fixture.league?.name || 'Unknown League',
          active: Boolean(fixture.league?.active ?? true),
          short_code: fixture.league?.short_code || '',
          image_path: fixture.league?.image_path || '',
          type: fixture.league?.type || 'league',
          sub_type: fixture.league?.sub_type || 'domestic',
          last_played_at: fixture.league?.last_played_at || new Date().toISOString(),
        },
        scores: Array.isArray(fixture.scores) ? fixture.scores.map((s: any) => ({
          id: s.id || 0,
          fixture_id: s.fixture_id || fixture.id,
          type_id: s.type_id || 0,
          participant_id: s.participant_id || 0,
          score: {
            goals: Number(s.score?.goals) || 0,
            participant: s.score?.participant || 'Unknown',
          },
          description: s.description || 'unknown',
        })) : [],
      };
    });
}

function validateAndTransformOdds(odds: any[]): SportMonksOdds[] {
  if (!Array.isArray(odds)) {
    console.warn('Invalid odds data received - not an array');
    return [];
  }

  return odds
    .filter(odd => {
      const hasRequiredFields = 
        odd &&
        typeof odd.id === 'number' &&
        typeof odd.fixture_id === 'number' &&
        odd.value &&
        odd.market;
      
      if (!hasRequiredFields) {
        console.warn(`Invalid odds data:`, { id: odd?.id, fixture_id: odd?.fixture_id });
        return false;
      }
      
      return true;
    })
    .map(odd => ({
      id: odd.id,
      fixture_id: odd.fixture_id,
      market_id: odd.market_id || 0,
      bookmaker_id: odd.bookmaker_id || 0,
      label: odd.label || '',
      value: odd.value,
      handicap: odd.handicap || null,
      total: odd.total || null,
      winning: Boolean(odd.winning),
      stopped: Boolean(odd.stopped),
      last_update: odd.last_update || {
        date: new Date().toISOString(),
        timezone_type: 3,
        timezone: 'UTC',
      },
      market: {
        id: odd.market?.id || 0,
        name: odd.market?.name || 'Unknown Market',
        developer_name: odd.market?.developer_name || 'unknown',
        has_winning_calculations: Boolean(odd.market?.has_winning_calculations),
      },
    }));
}

// Get odds for a fixture with enhanced error handling
export async function getFixtureOdds(
  fixtureId: number,
): Promise<SportMonksOdds[]> {
  const cacheKey = `fixture_odds_${fixtureId}`;
  
  try {
    const result = await makeApiRequest<any>(
      '/football/odds',
      {
        include: 'market',
        filters: `fixtures:${fixtureId};markets:1,2,3,18`, // 1x2, Over/Under, Both Teams to Score, Double Chance
      },
      cacheKey,
      1, // Cache for 1 minute for odds
      2 // High priority
    );
    
    const odds = result.data || [];
    return validateAndTransformOdds(odds);
  } catch (error) {
    console.warn(`Failed to fetch odds for fixture ${fixtureId}:`, (error as Error).message);
    
    // For odds, we don't want to return mock data - return empty array
    // This ensures betting is disabled when real odds aren't available
    return [];
  }
}

// Get leagues with enhanced error handling
export async function getLeagues(): Promise<any[]> {
  const cacheKey = 'football_leagues';
  
  try {
    const result = await makeApiRequest<any>(
      '/football/leagues',
      {
        per_page: 50, // Get more leagues
        include: 'country',
        filters: 'active:true', // Only active leagues
      },
      cacheKey,
      60, // Cache for 1 hour - leagues don't change often
      1 // Normal priority
    );
    
    const leagues = result.data || [];
    return validateAndTransformLeagues(leagues);
  } catch (error) {
    console.warn('Failed to fetch leagues from API:', (error as Error).message);
    
    // Try expired cache first
    const expiredCache = apiCache.get<any[]>(cacheKey + '_backup');
    if (expiredCache) {
      console.log('Using expired cache for leagues');
      return expiredCache;
    }
    
    // Fallback to basic mock leagues but log it
    console.warn('Using mock data for leagues - API unavailable');
    return getMockLeagues().map(league => ({
    ...league,
    country: {
      name: league.country?.name || 'Unknown',
      code: 'XX',
    },
  }));
  }
}

function validateAndTransformLeagues(leagues: any[]): any[] {
  if (!Array.isArray(leagues)) {
    console.warn('Invalid leagues data received - not an array');
    return [];
  }

  return leagues
    .filter(league => {
      const hasRequiredFields = 
        league &&
        typeof league.id === 'number' &&
        typeof league.name === 'string';
      
      if (!hasRequiredFields) {
        console.warn(`Invalid league data:`, { id: league?.id, name: league?.name });
        return false;
      }
      
      return true;
    })
    .map(league => ({
      id: league.id,
      name: league.name,
      country: {
        name: league.country?.name || 'Unknown',
        code: league.country?.code || 'XX',
      },
      active: Boolean(league.active ?? true),
      short_code: league.short_code || '',
      image_path: league.image_path || '',
      type: league.type || 'league',
      sub_type: league.sub_type || 'domestic',
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

// Get fixture result for settlement with enhanced error handling
export async function getFixtureResult(fixtureId: number): Promise<{
  finished: boolean;
  homeScore: number;
  awayScore: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  status: "finished" | "cancelled" | "postponed" | "ongoing";
} | null> {
  const cacheKey = `fixture_result_${fixtureId}`;
  
  try {
    const result = await makeApiRequest<any>(
      `/football/fixtures/${fixtureId}`,
      {
        include: 'participants;scores;state',
      },
      cacheKey,
      5, // Cache for 5 minutes for match results
      3 // Highest priority for settlement data
    );
    
    const fixture = result.data;
    if (!fixture) {
      console.warn(`No fixture data found for ID ${fixtureId}`);
      return null;
    }
    
    return transformFixtureResult(fixture);
  } catch (error) {
    console.warn(`Failed to fetch fixture result for ${fixtureId}:`, (error as Error).message);
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
  const state = fixture.state?.name || fixture.state?.developer_name || 'UNKNOWN';

  // Check different match states with more comprehensive coverage
  const finishedStates = ['FT', 'AET', 'PEN', 'FINISHED', 'FT_PEN'];
  const cancelledStates = ['CANCELLED', 'ABANDONED', 'SUSPENDED'];
  const postponedStates = ['POSTPONED', 'DELAYED', 'TBA'];

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
  const homeTeam = participants.find((p: any) => p.meta?.location === "home")?.name || "Home";
  const awayTeam = participants.find((p: any) => p.meta?.location === "away")?.name || "Away";

  // Extract scores for finished matches with improved logic
  let homeScore = 0;
  let awayScore = 0;

  if (isFinished && fixture.scores) {
    const scores = fixture.scores;
    
    // Find home and away team participant IDs
    const homeParticipant = participants.find((p: any) => p.meta?.location === "home");
    const awayParticipant = participants.find((p: any) => p.meta?.location === "away");
    
    if (homeParticipant && awayParticipant) {
      // Look for current scores by participant ID (more reliable)
      const homeScoreEntry = scores.find((s: any) => 
        s.participant_id === homeParticipant.id && 
        (s.description === 'current' || s.description === 'CURRENT')
      );
      const awayScoreEntry = scores.find((s: any) => 
        s.participant_id === awayParticipant.id && 
        (s.description === 'current' || s.description === 'CURRENT')
      );
      
      homeScore = Number(homeScoreEntry?.score?.goals) || 0;
      awayScore = Number(awayScoreEntry?.score?.goals) || 0;
    } else {
      // Fallback to name-based matching
      const homeScoreEntry = scores.find((s: any) => {
        const participant = s.score?.participant?.toLowerCase();
        return (participant === "home" || participant === homeTeam.toLowerCase()) &&
               (s.description === 'current' || s.description === 'CURRENT');
      });
      const awayScoreEntry = scores.find((s: any) => {
        const participant = s.score?.participant?.toLowerCase();
        return (participant === "away" || participant === awayTeam.toLowerCase()) &&
               (s.description === 'current' || s.description === 'CURRENT');
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
