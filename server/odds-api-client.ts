import axios, { AxiosInstance, AxiosError } from 'axios';
import pLimit from 'p-limit';

const ODDS_API_BASE = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4';
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '6');

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseRetryDelay: 1000,
  maxRetryDelay: 10000,
};

// Concurrency limiter
const limit = pLimit(CONCURRENCY_LIMIT);

// Metrics tracking
class ApiMetrics {
  private creditsUsed: number = 0;
  private requestCount: number = 0;
  private failedRequests: number = 0;
  private rateLimitHits: number = 0;

  incrementCredits(amount: number = 1) {
    this.creditsUsed += amount;
  }

  incrementRequests() {
    this.requestCount++;
  }

  incrementFailed() {
    this.failedRequests++;
  }

  incrementRateLimitHits() {
    this.rateLimitHits++;
  }

  getStats() {
    return {
      creditsUsed: this.creditsUsed,
      requestCount: this.requestCount,
      failedRequests: this.failedRequests,
      rateLimitHits: this.rateLimitHits,
      successRate: this.requestCount > 0 
        ? ((this.requestCount - this.failedRequests) / this.requestCount * 100).toFixed(2) + '%'
        : '0%'
    };
  }
}

const metrics = new ApiMetrics();

// The Odds API client
class TheOddsApiClient {
  private client: AxiosInstance;
  private inflightRequests: Map<string, Promise<any>> = new Map();

  constructor() {
    this.client = axios.create({
      baseURL: ODDS_API_BASE,
      timeout: 30000,
      params: {
        apiKey: ODDS_API_KEY,
      },
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries: number = RATE_LIMIT_CONFIG.maxRetries
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on 4xx errors except 429
        if (axiosError.response?.status && 
            axiosError.response.status >= 400 && 
            axiosError.response.status < 500 && 
            axiosError.response.status !== 429) {
          throw error;
        }

        // Handle 429 rate limit
        if (axiosError.response?.status === 429) {
          metrics.incrementRateLimitHits();
          const retryAfter = parseInt(axiosError.response.headers['retry-after'] || '5') * 1000;
          const delay = Math.min(retryAfter, RATE_LIMIT_CONFIG.maxRetryDelay);
          
          console.warn(`Rate limited (429), retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (attempt < retries) {
          const delay = Math.min(
            RATE_LIMIT_CONFIG.baseRetryDelay * Math.pow(2, attempt - 1),
            RATE_LIMIT_CONFIG.maxRetryDelay
          );
          
          // Add jitter
          const jitter = Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
          
          console.log(`Retry attempt ${attempt}/${retries} after ${delay + jitter}ms`);
        }
      }
    }

    metrics.incrementFailed();
    throw lastError!;
  }

  private deduplicateRequest<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inflightRequests.get(key);
    if (existing) {
      console.log(`Deduplicating request: ${key}`);
      return existing as Promise<T>;
    }

    const promise = operation().finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, promise);
    return promise;
  }

  async getSports(): Promise<any[]> {
    const requestKey = 'sports:list';
    
    return this.deduplicateRequest(requestKey, async () => {
      return limit(async () => {
        metrics.incrementRequests();
        
        return this.executeWithRetry(async () => {
          const response = await this.client.get('/sports');
          metrics.incrementCredits(1);
          return response.data;
        });
      });
    });
  }

  async getOdds(
    sportKey: string, 
    options: {
      regions?: string;
      markets?: string;
      oddsFormat?: string;
      dateFormat?: string;
      status?: 'live' | 'upcoming';
    } = {}
  ): Promise<any[]> {
    const {
      regions = 'uk,eu,us',
      markets = 'h2h,spreads,totals',
      oddsFormat = 'decimal',
      dateFormat = 'iso',
      status
    } = options;

    const requestKey = `odds:${sportKey}:${status || 'upcoming'}:${markets}`;
    
    return this.deduplicateRequest(requestKey, async () => {
      return limit(async () => {
        metrics.incrementRequests();
        
        return this.executeWithRetry(async () => {
          const params: any = {
            regions,
            markets,
            oddsFormat,
            dateFormat,
          };

          if (status === 'live') {
            params.status = 'live';
          }

          const response = await this.client.get(`/sports/${sportKey}/odds`, { params });
          metrics.incrementCredits(1);
          return response.data;
        });
      });
    });
  }

  async getEventOdds(
    sportKey: string,
    eventId: string,
    options: {
      regions?: string;
      markets?: string;
      oddsFormat?: string;
      dateFormat?: string;
    } = {}
  ): Promise<any> {
    const {
      regions = 'uk,eu,us',
      markets = 'h2h,spreads,totals',
      oddsFormat = 'decimal',
      dateFormat = 'iso',
    } = options;

    const requestKey = `event:${sportKey}:${eventId}:${markets}`;
    
    return this.deduplicateRequest(requestKey, async () => {
      return limit(async () => {
        metrics.incrementRequests();
        
        return this.executeWithRetry(async () => {
          const response = await this.client.get(
            `/sports/${sportKey}/events/${eventId}/odds`,
            {
              params: {
                regions,
                markets,
                oddsFormat,
                dateFormat,
              },
            }
          );
          metrics.incrementCredits(1);
          return response.data;
        });
      });
    });
  }

  async getScores(sportKey: string, daysFrom: number = 3): Promise<any[]> {
    const requestKey = `scores:${sportKey}:${daysFrom}`;
    
    return this.deduplicateRequest(requestKey, async () => {
      return limit(async () => {
        metrics.incrementRequests();
        
        return this.executeWithRetry(async () => {
          const response = await this.client.get(`/sports/${sportKey}/scores`, {
            params: { daysFrom },
          });
          metrics.incrementCredits(1);
          return response.data;
        });
      });
    });
  }

  getMetrics() {
    return metrics.getStats();
  }
}

export const oddsApiClient = new TheOddsApiClient();
export { metrics as oddsApiMetrics };
