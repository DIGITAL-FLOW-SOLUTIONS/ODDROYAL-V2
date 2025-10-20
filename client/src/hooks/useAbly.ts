/**
 * Ably Realtime Hook - Managed Push Gateway Integration
 * 
 * Architecture: Ably Channels → Client (React app)
 * 
 * Features:
 * - Token-based auth (short-lived, secure)
 * - Auto-reconnect managed by Ably SDK
 * - Subscribes to sports channels for live updates
 * - Batched patch merging with React 18 startTransition
 * - Reuses existing PageLoader integration
 */

import { useEffect, useRef, useCallback, startTransition } from 'react';
import Ably from 'ably';
import { useMatchStore } from '@/store/matchStore';

const BATCH_INTERVAL = 250; // 250ms batching window for smooth updates
const THROTTLE_INTERVAL = 400; // 400ms throttle for applying updates to store

interface AblyUpdate {
  fixture_id: string;
  sport_key: string;
  changes: Array<{
    path: string;
    value: any;
    oldValue?: any;
  }>;
  timestamp: number;
}

// Shallow equality check for objects
function shallowEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}

export function useAbly() {
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelsRef = useRef<Map<string, any>>(new Map());
  const updateQueueRef = useRef<AblyUpdate[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());


  /**
   * Apply throttled batch updates to store - only updates changed matches
   */
  const applyThrottledBatch = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }

    const updates = pendingUpdatesRef.current;
    if (updates.size === 0) return;

    const currentState = useMatchStore.getState();
    const matchesMap = new Map(currentState.matches);
    let changeCount = 0;

    // Apply all pending updates to the map
    updates.forEach((update, matchId) => {
      const existing = matchesMap.get(matchId);
      
      if (existing) {
        // Check if anything actually changed
        if (!shallowEqual(existing, { ...existing, ...update })) {
          matchesMap.set(matchId, { ...existing, ...update });
          changeCount++;
        }
      } else {
        // New match
        matchesMap.set(matchId, update);
        changeCount++;
      }
    });

    // Clear pending updates
    pendingUpdatesRef.current.clear();

    if (changeCount > 0) {
      // Single store update with startTransition
      startTransition(() => {
        useMatchStore.setState({ 
          matches: matchesMap,
          lastUpdate: Date.now() 
        });
      });
    }
  }, []);

  /**
   * Flush batched Ably messages and schedule throttled store update
   */
  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    const batch = updateQueueRef.current.splice(0);
    if (batch.length === 0) return;

    // Merge all diffs into pending updates map
    batch.forEach(diff => {
      const matchId = diff.fixture_id;
      const existing = pendingUpdatesRef.current.get(matchId) || { match_id: matchId };
      
      // Handle "new" match case
      if (diff.changes.length === 1 && diff.changes[0].path === 'new') {
        pendingUpdatesRef.current.set(matchId, {
          match_id: matchId,
          ...diff.changes[0].value,
        });
        return;
      }

      // Apply incremental changes
      diff.changes.forEach(change => {
        if (change.path === 'status') {
          existing.status = change.value;
        } else if (change.path === 'market_status') {
          existing.market_status = change.value;
        } else if (change.path === 'scores') {
          existing.scores = change.value;
        } else if (change.path === 'odds') {
          existing.odds = change.value;
        } else if (change.path === 'commence_time') {
          existing.commence_time = change.value;
        }
      });

      pendingUpdatesRef.current.set(matchId, existing);
    });

    // Schedule throttled application of updates
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        applyThrottledBatch();
      }, THROTTLE_INTERVAL);
    }
  }, [applyThrottledBatch]);

  /**
   * Queue update for batched processing
   */
  const queueUpdate = useCallback((diff: AblyUpdate) => {
    updateQueueRef.current.push(diff);

    // Schedule flush if not already scheduled
    if (!batchTimerRef.current) {
      batchTimerRef.current = setTimeout(() => {
        flushBatch();
      }, BATCH_INTERVAL);
    }
  }, [flushBatch]);

  /**
   * Initialize Ably client with token auth
   */
  const initializeAbly = useCallback(async () => {
    try {
      console.log('[Ably] Creating Ably client with token auth...');
      
      // Create Ably client with token auth endpoint
      // Ably SDK will automatically fetch tokens from authUrl
      const client = new Ably.Realtime({
        authUrl: '/api/ably/token',
        authMethod: 'GET',
      });

      ablyClientRef.current = client;

      // Connection state handling
      client.connection.on('connected', () => {
        console.log('✅ Ably connected');
        useMatchStore.getState().setConnected(true);
      });

      client.connection.on('disconnected', () => {
        console.log('❌ Ably disconnected');
        useMatchStore.getState().setConnected(false);
      });

      client.connection.on('failed', (error: any) => {
        console.error('❌ Ably connection failed:', error);
        useMatchStore.getState().setConnected(false);
      });

      // Hydrate initial data from Redis
      const storeIsEmpty = useMatchStore.getState().matches.size === 0;
      const needsInitialization = !hasInitializedRef.current && storeIsEmpty;
      
      let hydrateResult: any = null;
      
      if (needsInitialization) {
        try {
          console.log('[Ably] Hydrating initial data from Redis...');
          const hydrateResponse = await fetch('/api/hydrate');
          hydrateResult = await hydrateResponse.json();
          
          if (hydrateResult.success) {
            useMatchStore.getState().setInitialData(hydrateResult.data);
            hasInitializedRef.current = true;
            console.log('[Ably] Initial data loaded:', hydrateResult.data.matches.length, 'matches');
            
            // Start background live status checker
            useMatchStore.getState().startLiveStatusChecker();
            console.log('[Ably] Started live status background checker');
          }
        } catch (error) {
          console.error('[Ably] Failed to hydrate initial data:', error);
        }
      } else {
        console.log('[Ably] Store already has data, skipping hydration');
      }

      // Subscribe to all sports channels
      // Get sports list from hydrated data or use comprehensive list
      let sportsToSubscribe: string[] = [];
      
      if (hydrateResult?.success && hydrateResult.data?.sports) {
        // Use sports from hydration data
        sportsToSubscribe = hydrateResult.data.sports.map((s: any) => s.sport_key);
      } else {
        // Fallback to comprehensive list (matches aggregator)
        sportsToSubscribe = ['football', 'basketball', 'americanfootball', 'baseball', 'icehockey', 'cricket', 'mma'];
      }
      
      console.log(`[Ably] Subscribing to ${sportsToSubscribe.length} sports:`, sportsToSubscribe);
      
      for (const sport of sportsToSubscribe) {
        const channelName = `sports:${sport}`;
        const channel = client.channels.get(channelName);
        
        await channel.subscribe('update', (message: any) => {
          try {
            const data = message.data;
            
            // Handle batch updates
            if (data.type === 'batch:updates') {
              data.updates.forEach((diff: AblyUpdate) => {
                queueUpdate(diff);
              });
            }
          } catch (error) {
            console.error(`[Ably] Error processing message from ${channelName}:`, error);
          }
        });
        
        channelsRef.current.set(channelName, channel);
        console.log(`[Ably] Subscribed to ${channelName}`);
      }

    } catch (error) {
      console.error('[Ably] Initialization error:', error);
      console.error('[Ably] Error details:', (error as Error).message, (error as Error).stack);
      useMatchStore.getState().setConnected(false);
    }
  }, [queueUpdate]);

  /**
   * Cleanup Ably connection
   */
  const cleanup = useCallback(() => {
    // Flush any pending updates
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    flushBatch();
    applyThrottledBatch();

    // Unsubscribe from all channels
    channelsRef.current.forEach((channel) => {
      channel.unsubscribe();
    });
    channelsRef.current.clear();

    // Close Ably connection
    if (ablyClientRef.current) {
      ablyClientRef.current.close();
      ablyClientRef.current = null;
    }

    useMatchStore.getState().setConnected(false);
  }, [flushBatch, applyThrottledBatch]);

  useEffect(() => {
    initializeAbly();

    return () => {
      cleanup();
    };
  }, [initializeAbly, cleanup]);

  return {
    isConnected: ablyClientRef.current?.connection.state === 'connected',
    reconnect: initializeAbly,
  };
}
