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

export async function initializeWebSocket(server: any) {
  wss = new WebSocketServer({ 
    server,
    path: '/ws' // Use a specific path to avoid conflicts with Vite's WebSocket
  });
  
  // Connect to Redis Pub/Sub and subscribe to all channels
  try {
    await redisPubSub.connect();
    
    // Subscribe to all streaming channels and broadcast to WebSocket clients
    await redisPubSub.subscribeAll((message) => {
      // Broadcast Redis Pub/Sub messages to all connected WebSocket clients
      broadcastToAll(message);
    });
    
    logger.success('✅ WebSocket subscribed to Redis Pub/Sub channels');
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

// Broadcast message to all connected clients
function broadcastToAll(message: any) {
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