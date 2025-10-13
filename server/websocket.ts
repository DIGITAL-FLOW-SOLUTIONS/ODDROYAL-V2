import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { logger } from "./logger";
import { redisPubSub, CHANNELS } from "./redis-pubsub";

interface PriceUpdate {
  fixtureId: string;
  market: string;
  odds: {
    home: string;
    away: string;
    draw: string;
  };
  timestamp: string;
}

interface BetUpdate {
  type: 'bet_placed' | 'bet_settled';
  betId: string;
  userId: string;
  timestamp: string;
  details?: any;
}

interface MatchUpdate {
  type: 'match_started' | 'match_update' | 'match_finished';
  matchId: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  timestamp: string;
}

interface EventUpdate {
  type: 'match_event';
  matchId: string;
  eventType: string;
  minute: number;
  team: 'home' | 'away';
  playerName?: string;
  description?: string;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

interface MarketUpdate {
  type: 'markets_suspended' | 'markets_reopened' | 'odds_updated';
  matchId: string;
  marketId?: string;
  reason?: string;
  odds?: any;
  timestamp: string;
}

let wss: WebSocketServer | null = null;
const connectedClients = new Set<WebSocket>();

// Batching mechanism to reduce message flooding
const messageBatcher = {
  matchUpdates: new Map<string, any>(),
  oddsUpdates: new Map<string, any>(),
  otherMessages: [] as any[],
  batchTimer: null as NodeJS.Timeout | null,
  BATCH_INTERVAL: 2000, // 2000ms batching window - reduces to ~0.5 updates/second
};

function scheduleFlush() {
  if (messageBatcher.batchTimer) return;
  
  messageBatcher.batchTimer = setTimeout(() => {
    flushBatch();
    messageBatcher.batchTimer = null;
  }, messageBatcher.BATCH_INTERVAL);
}

function flushBatch() {
  const matchUpdates = Array.from(messageBatcher.matchUpdates.values());
  const oddsUpdates = Array.from(messageBatcher.oddsUpdates.values());
  const otherMessages = [...messageBatcher.otherMessages];
  
  // Clear batches
  messageBatcher.matchUpdates.clear();
  messageBatcher.oddsUpdates.clear();
  messageBatcher.otherMessages = [];
  
  // Send batched updates
  if (matchUpdates.length > 0) {
    broadcastDirect({
      type: 'batch:matches',
      updates: matchUpdates,
      count: matchUpdates.length,
      timestamp: Date.now(),
    });
  }
  
  if (oddsUpdates.length > 0) {
    broadcastDirect({
      type: 'batch:odds',
      updates: oddsUpdates,
      count: oddsUpdates.length,
      timestamp: Date.now(),
    });
  }
  
  // Send other messages individually (they're less frequent)
  otherMessages.forEach(msg => broadcastDirect(msg));
}

function batchMessage(message: any) {
  switch (message.type) {
    case 'match:update':
    case 'match:new':
    case 'manual:update':
      // Batch match updates by match_id
      messageBatcher.matchUpdates.set(message.match_id || message.match?.match_id, message);
      break;
      
    case 'odds:update':
      // Batch odds updates by match_id
      messageBatcher.oddsUpdates.set(message.match_id, message);
      break;
      
    default:
      // Other messages (connection, pong, etc.) sent immediately
      messageBatcher.otherMessages.push(message);
      break;
  }
  
  scheduleFlush();
}

export async function initializeWebSocket(server: any) {
  wss = new WebSocketServer({ 
    server,
    path: '/ws' // Use a specific path to avoid conflicts with Vite's WebSocket
  });
  
  // Connect to Redis Pub/Sub and subscribe to all channels
  try {
    await redisPubSub.connect();
    
    // Subscribe to all streaming channels and use batching
    await redisPubSub.subscribeAll((message) => {
      // Batch messages instead of broadcasting immediately
      batchMessage(message);
    });
    
    logger.success('✅ WebSocket subscribed to Redis Pub/Sub channels with batching enabled');
  } catch (error) {
    logger.error('❌ Failed to connect WebSocket to Redis Pub/Sub:', error);
  }
  
  wss.on('connection', (ws: WebSocket, req: any) => {
    logger.info('New WebSocket connection established');
    connectedClients.add(ws);
    
    // Send welcome message with connection info
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to OddRoyal live updates',
      timestamp: new Date().toISOString(),
      streaming: true
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('Received WebSocket message:', message);
        
        // Handle different message types
        switch (message.type) {
          case 'subscribe_fixture':
            // In a real implementation, we'd track which fixtures each client is subscribed to
            ws.send(JSON.stringify({
              type: 'subscription_confirmed',
              fixtureId: message.fixtureId,
              timestamp: new Date().toISOString()
            }));
            break;
            
          case 'ping':
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString()
            }));
            break;
          
          case 'request_initial_data':
            // Client requesting initial data preload
            // Will be handled by the routes endpoint
            break;
            
          default:
            logger.debug('Unknown message type:', message.type);
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      logger.info('WebSocket connection closed');
      connectedClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });
  
  logger.success('WebSocket server initialized with streaming');
  return wss;
}

// Broadcast message to all connected clients (renamed from broadcastToAll for batching)
function broadcastDirect(message: any) {
  if (!wss) return;
  
  const messageStr = JSON.stringify(message);
  
  // [LOG] Server broadcast tracking (lightweight)
  console.log(`[SERVER WS] Emitting ${message.type}`, {
    size: messageStr.length,
    clients: connectedClients.size,
    time: new Date().toISOString(),
  });
  
  let successCount = 0;
  let failCount = 0;
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
        successCount++;
      } catch (error) {
        logger.error('Error broadcasting message:', error);
        connectedClients.delete(ws);
        failCount++;
      }
    }
  });
  
  if (successCount > 0) {
    logger.debug(`📡 Broadcasted ${message.type} to ${successCount} clients`);
  }
  
  console.log(`[SERVER WS] Broadcast complete:`, {
    successCount,
    failCount,
    messageType: message.type,
  });
}

export function broadcastPriceUpdate(update: PriceUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'price_update',
    data: update
  });
  
  console.log('[SERVER WS] Broadcasting price_update', {
    fixtureId: update.fixtureId,
    size: message.length,
    timestamp: new Date().toISOString(),
  });
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Error sending price update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function broadcastBetUpdate(update: BetUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'bet_update',
    data: update
  });
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Error sending bet update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function broadcastMatchUpdate(update: MatchUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'match_update',
    data: update
  });
  
  console.log('[SERVER WS] Broadcasting match_update', {
    matchId: update.matchId,
    updateType: update.type,
    size: message.length,
    timestamp: new Date().toISOString(),
  });
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Error sending match update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function broadcastEventUpdate(update: EventUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'event_update',
    data: update
  });
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Error sending event update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function broadcastMarketUpdate(update: MarketUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'market_update',
    data: update
  });
  
  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Error sending market update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function getConnectedClients() {
  return connectedClients.size;
}