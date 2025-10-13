/**
 * WebSocket Hook - Professional Betting Site Streaming
 * 
 * Features:
 * - Auto-reconnect on disconnect
 * - Handles all streaming update types
 * - Patches Zustand store with diff updates
 * - Requests initial data on connection
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMatchStore } from '@/store/matchStore';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  const {
    updateMatch,
    updateOdds,
    updateMarket,
    batchUpdateMatches,
    batchUpdateOdds,
    removeMatch,
    setConnected,
    setInitialData,
  } = useMatchStore();

  const connect = useCallback(() => {
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('✅ WebSocket connected - streaming active');
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;
        
        // Only fetch initial data if store is empty and we haven't initialized yet
        // This prevents flickering from multiple reconnections (Vite HMR)
        const storeIsEmpty = useMatchStore.getState().matches.size === 0;
        const needsInitialization = !hasInitializedRef.current && storeIsEmpty;
        
        if (needsInitialization) {
          try {
            console.log('📡 Fetching initial data (store is empty)...');
            const response = await fetch('/api/initial-data');
            const result = await response.json();
            
            if (result.success) {
              setInitialData(result.data);
              hasInitializedRef.current = true;
              console.log('📊 Initial data loaded into store');
            }
          } catch (error) {
            console.error('Failed to fetch initial data:', error);
          }
        } else {
          console.log('📊 Store already has data, skipping initial fetch');
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // [LOG] WebSocket message received (lightweight - no preview)
          console.log(`[WS] Message at ${performance.now().toFixed(2)}ms`, {
            type: message.type,
            size: event.data.length,
          });

          // Handle different update types from Redis Pub/Sub
          switch (message.type) {
            case 'connection':
              console.log('📡 Connected to live updates:', message.message);
              break;

            case 'batch:matches':
              console.log(`[WS] Processing batch:matches (${message.count} updates)`);
              // Process batched match updates in a single store mutation
              const matchesToUpdate = message.updates.map((update: any) => {
                if (update.type === 'match:new') {
                  return {
                    match_id: update.match.match_id,
                    ...update.match,
                  };
                } else {
                  return {
                    match_id: update.match_id,
                    ...update.updates,
                  };
                }
              });
              // Use batch update for single store mutation
              batchUpdateMatches(matchesToUpdate);
              break;

            case 'batch:odds':
              console.log(`[WS] Processing batch:odds (${message.count} updates)`);
              // Process batched odds updates efficiently
              const oddsUpdates = message.updates.map((update: any) => ({
                match_id: update.match_id,
                ...update.odds,
                timestamp: update.timestamp,
              }));
              batchUpdateOdds(oddsUpdates);
              break;

            case 'match:update':
              console.log('[WS] Processing match:update', { match_id: message.match_id, updates: message.updates });
              // Diff patch for match update
              updateMatch({
                match_id: message.match_id,
                ...message.updates,
              });
              break;

            case 'odds:update':
              console.log('[WS] Processing odds:update', { match_id: message.match_id });
              // Odds changed
              updateOdds({
                match_id: message.match_id,
                ...message.odds,
                timestamp: message.timestamp,
              });
              break;

            case 'market:update':
              console.log('[WS] Processing market:update', { market_id: message.market_id });
              // Market status changed
              updateMarket({
                market_id: message.market_id,
                match_id: message.match_id,
                ...message,
              });
              break;

            case 'manual:update':
              console.log('[WS] Processing manual:update', { match_id: message.match_id });
              // Manual match updated
              updateMatch({
                match_id: message.match_id,
                ...message.updates,
              });
              break;

            case 'match:new':
              console.log('[WS] Processing match:new', { match_id: message.match?.match_id });
              // New match added
              updateMatch({
                match_id: message.match.match_id,
                ...message.match,
              });
              break;

            case 'match:remove':
              console.log('[WS] Processing match:remove', { match_id: message.match_id });
              // Match removed
              removeMatch(message.match_id);
              break;

            case 'pong':
              // Keep-alive response
              break;

            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        isConnectingRef.current = false;
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(
            `⏳ Reconnecting in ${RECONNECT_DELAY / 1000}s (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          console.error('❌ Max reconnect attempts reached. Please refresh the page.');
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        isConnectingRef.current = false;
      };
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      isConnectingRef.current = false;
    }
  }, [updateMatch, updateOdds, updateMarket, batchUpdateOdds, removeMatch, setConnected, setInitialData]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
    isConnectingRef.current = false;
  }, [setConnected]);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  useEffect(() => {
    connect();

    // Set up heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      sendPing();
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(heartbeatInterval);
      disconnect();
    };
  }, [connect, disconnect, sendPing]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
  };
}
