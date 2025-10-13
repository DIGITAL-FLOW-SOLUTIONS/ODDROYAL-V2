/**
 * Redis Pub/Sub Service - Professional Betting Site Streaming
 * 
 * Channels for real-time updates:
 * - match:update - Match data changes (scores, status, etc.)
 * - odds:update - Odds changes
 * - market:update - Market status changes
 * - manual:update - Manual match changes
 * - match:new - New matches added
 * - match:remove - Matches removed
 */

import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required for Pub/Sub");
}

// Pub/Sub Channels
export const CHANNELS = {
  MATCH_UPDATE: 'match:update',
  ODDS_UPDATE: 'odds:update',
  MARKET_UPDATE: 'market:update',
  MANUAL_UPDATE: 'manual:update',
  MATCH_NEW: 'match:new',
  MATCH_REMOVE: 'match:remove',
  INITIAL_DATA: 'initial:data',
} as const;

// Message types for diff patches
export interface MatchUpdateMessage {
  type: 'match:update';
  match_id: string;
  updates: Partial<{
    status: 'live' | 'upcoming' | 'completed';
    scores: { home: number; away: number };
    market_status: 'open' | 'suspended' | 'closed';
    commence_time: string;
    [key: string]: any;
  }>;
  timestamp: number;
}

export interface OddsUpdateMessage {
  type: 'odds:update';
  match_id: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
  timestamp: number;
}

export interface MarketUpdateMessage {
  type: 'market:update';
  match_id: string;
  market_id: string;
  status: 'open' | 'suspended' | 'closed';
  outcomes?: any[];
  timestamp: number;
}

export interface ManualMatchUpdateMessage {
  type: 'manual:update';
  match_id: string;
  updates: any;
  timestamp: number;
}

export interface NewMatchMessage {
  type: 'match:new';
  match: any;
  timestamp: number;
}

export interface RemoveMatchMessage {
  type: 'match:remove';
  match_id: string;
  timestamp: number;
}

export type PubSubMessage = 
  | MatchUpdateMessage 
  | OddsUpdateMessage 
  | MarketUpdateMessage
  | ManualMatchUpdateMessage
  | NewMatchMessage
  | RemoveMatchMessage;

class RedisPubSubManager {
  private publisher: Redis;
  private subscriber: Redis;
  private connected: boolean = false;
  private messageHandlers: Map<string, Set<(message: any) => void>> = new Map();

  constructor() {
    // Create separate clients for pub and sub (Redis requirement)
    this.publisher = new Redis(REDIS_URL as string, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.subscriber = new Redis(REDIS_URL as string, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    // Publisher events
    this.publisher.on("connect", () => {
      logger.success("Redis Publisher connected");
    });

    this.publisher.on("error", (err) => {
      logger.error("Redis Publisher error:", err);
    });

    // Subscriber events
    this.subscriber.on("connect", () => {
      logger.success("Redis Subscriber connected");
      this.connected = true;
    });

    this.subscriber.on("error", (err) => {
      logger.error("Redis Subscriber error:", err);
      this.connected = false;
    });

    // Handle incoming messages
    this.subscriber.on("message", (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        const handlers = this.messageHandlers.get(channel);
        
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(parsed);
            } catch (err) {
              logger.error(`Error in message handler for ${channel}:`, err);
            }
          });
        }
      } catch (err) {
        logger.error(`Failed to parse message from ${channel}:`, err);
      }
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Publish methods - called by refresh-worker and manual match updates
  
  async publishMatchUpdate(matchUpdate: Omit<MatchUpdateMessage, 'type' | 'timestamp'>): Promise<void> {
    const message: MatchUpdateMessage = {
      type: 'match:update',
      ...matchUpdate,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.MATCH_UPDATE, JSON.stringify(message));
    logger.debug(`📡 Published match update: ${matchUpdate.match_id}`);
  }

  async publishOddsUpdate(oddsUpdate: Omit<OddsUpdateMessage, 'type' | 'timestamp'>): Promise<void> {
    const message: OddsUpdateMessage = {
      type: 'odds:update',
      ...oddsUpdate,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.ODDS_UPDATE, JSON.stringify(message));
    logger.debug(`📡 Published odds update: ${oddsUpdate.match_id}`);
  }

  async publishMarketUpdate(marketUpdate: Omit<MarketUpdateMessage, 'type' | 'timestamp'>): Promise<void> {
    const message: MarketUpdateMessage = {
      type: 'market:update',
      ...marketUpdate,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.MARKET_UPDATE, JSON.stringify(message));
    logger.debug(`📡 Published market update: ${marketUpdate.match_id}`);
  }

  async publishManualUpdate(manualUpdate: Omit<ManualMatchUpdateMessage, 'type' | 'timestamp'>): Promise<void> {
    const message: ManualMatchUpdateMessage = {
      type: 'manual:update',
      ...manualUpdate,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.MANUAL_UPDATE, JSON.stringify(message));
    logger.debug(`📡 Published manual match update: ${manualUpdate.match_id}`);
  }

  async publishNewMatch(match: any): Promise<void> {
    // Send only essential fields to reduce WebSocket payload size
    // Bookmakers data is available via REST API, no need to send it via WebSocket
    const lightweightMatch = {
      match_id: match.match_id,
      sport_key: match.sport_key,
      league_id: match.league_id,
      league_name: match.league_name,
      home_team: match.home_team,
      away_team: match.away_team,
      home_team_logo: match.home_team_logo,
      away_team_logo: match.away_team_logo,
      commence_time: match.commence_time,
      status: match.status,
      scores: match.scores,
      market_status: match.market_status,
      source: match.source,
    };
    
    const message: NewMatchMessage = {
      type: 'match:new',
      match: lightweightMatch,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.MATCH_NEW, JSON.stringify(message));
    logger.debug(`📡 Published new match (lightweight): ${match.match_id}`);
  }

  async publishRemoveMatch(matchId: string): Promise<void> {
    const message: RemoveMatchMessage = {
      type: 'match:remove',
      match_id: matchId,
      timestamp: Date.now(),
    };
    
    await this.publisher.publish(CHANNELS.MATCH_REMOVE, JSON.stringify(message));
    logger.debug(`📡 Published remove match: ${matchId}`);
  }

  // Subscribe methods - called by WebSocket server
  
  async subscribe(channel: string, handler: (message: any) => void): Promise<void> {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
      await this.subscriber.subscribe(channel);
      logger.info(`✅ Subscribed to channel: ${channel}`);
    }
    
    this.messageHandlers.get(channel)!.add(handler);
  }

  async unsubscribe(channel: string, handler?: (message: any) => void): Promise<void> {
    const handlers = this.messageHandlers.get(channel);
    
    if (!handlers) return;
    
    if (handler) {
      handlers.delete(handler);
      
      // If no more handlers, unsubscribe from channel
      if (handlers.size === 0) {
        await this.subscriber.unsubscribe(channel);
        this.messageHandlers.delete(channel);
        logger.info(`❌ Unsubscribed from channel: ${channel}`);
      }
    } else {
      // Unsubscribe all
      await this.subscriber.unsubscribe(channel);
      this.messageHandlers.delete(channel);
      logger.info(`❌ Unsubscribed from channel: ${channel}`);
    }
  }

  async subscribeAll(handler: (message: any) => void): Promise<void> {
    // Subscribe to all channels
    await Promise.all([
      this.subscribe(CHANNELS.MATCH_UPDATE, handler),
      this.subscribe(CHANNELS.ODDS_UPDATE, handler),
      this.subscribe(CHANNELS.MARKET_UPDATE, handler),
      this.subscribe(CHANNELS.MANUAL_UPDATE, handler),
      this.subscribe(CHANNELS.MATCH_NEW, handler),
      this.subscribe(CHANNELS.MATCH_REMOVE, handler),
    ]);
    
    logger.success('✅ Subscribed to all channels');
  }

  // Get active channels
  getActiveChannels(): string[] {
    return Array.from(this.messageHandlers.keys());
  }

  // Get subscriber count for a channel
  getSubscriberCount(channel: string): number {
    return this.messageHandlers.get(channel)?.size || 0;
  }
}

export const redisPubSub = new RedisPubSubManager();
