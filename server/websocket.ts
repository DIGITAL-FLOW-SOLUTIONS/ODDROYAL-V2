import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { logger } from "./logger";

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

export function initializeWebSocket(server: any) {
  wss = new WebSocketServer({ 
    server,
    path: '/ws' // Use a specific path to avoid conflicts with Vite's WebSocket
  });
  
  wss.on('connection', (ws: WebSocket, req: any) => {
    logger.info('New WebSocket connection established');
    connectedClients.add(ws);
    
    // Send welcome message with connection info
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to OddRoyal live updates',
      timestamp: new Date().toISOString()
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
  
  logger.success('WebSocket server initialized');
  return wss;
}

export function broadcastPriceUpdate(update: PriceUpdate) {
  if (!wss) return;
  
  const message = JSON.stringify({
    type: 'price_update',
    data: update
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