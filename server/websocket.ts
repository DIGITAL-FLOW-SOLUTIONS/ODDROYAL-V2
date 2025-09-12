import WebSocket, { WebSocketServer } from 'ws';
import { createServer } from 'http';

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

let wss: WebSocketServer | null = null;
const connectedClients = new Set<WebSocket>();

export function initializeWebSocket(server: any) {
  wss = new WebSocketServer({ 
    server,
    path: '/ws' // Use a specific path to avoid conflicts with Vite's WebSocket
  });
  
  wss.on('connection', (ws: WebSocket, req: any) => {
    console.log('New WebSocket connection established');
    connectedClients.add(ws);
    
    // Send welcome message with connection info
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to PRIMESTAKE live updates',
      timestamp: new Date().toISOString()
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received WebSocket message:', message);
        
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
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      connectedClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });
  
  console.log('WebSocket server initialized');
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
        console.error('Error sending price update:', error);
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
        console.error('Error sending bet update:', error);
        connectedClients.delete(ws);
      }
    }
  });
}

export function getConnectedClients() {
  return connectedClients.size;
}