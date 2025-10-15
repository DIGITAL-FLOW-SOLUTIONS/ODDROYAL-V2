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
import Ably from 'ably/promises';
import { useMatchStore } from '@/store/matchStore';

const BATCH_INTERVAL = 250; // 250ms batching window for smooth updates

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

export function useAbly() {
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const channelsRef = useRef<Map<string, Ably.Types.RealtimeChannelPromise>>(new Map());
  const updateQueueRef = useRef<AblyUpdate[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  const {
    updateMatch,
    setConnected,
    setInitialData,
  } = useMatchStore();

  /**
   * Flush batched updates to store using React 18 startTransition
   */
  const flushBatch = useCallback(() => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    const batch = updateQueueRef.current.splice(0);
    if (batch.length === 0) return;

    console.log(`[Ably] Flushing ${batch.length} updates with startTransition`);

    // Use startTransition for non-blocking UI updates
    startTransition(() => {
      batch.forEach(diff => {
        applyPatch(diff);
      });
    });
  }, []);

  /**
   * Apply a patch diff to the match store
   */
  const applyPatch = useCallback((diff: AblyUpdate) => {
    // Handle "new" match case
    if (diff.changes.length === 1 && diff.changes[0].path === 'new') {
      updateMatch({
        match_id: diff.fixture_id,
        ...diff.changes[0].value,
      });
      return;
    }

    // Apply incremental changes
    const updates: any = { match_id: diff.fixture_id };
    
    diff.changes.forEach(change => {
      if (change.path === 'status') {
        updates.status = change.value;
      } else if (change.path === 'market_status') {
        updates.market_status = change.value;
      } else if (change.path === 'scores') {
        updates.scores = change.value;
      } else if (change.path === 'odds') {
        updates.odds = change.value;
      } else if (change.path === 'commence_time') {
        updates.commence_time = change.value;
      }
    });

    updateMatch(updates);
  }, [updateMatch]);

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
      console.log('[Ably] Fetching auth token...');
      
      // Get token from backend
      const response = await fetch('/api/ably/token');
      const result = await response.json();
      
      if (!result.success || !result.tokenRequest) {
        throw new Error('Failed to get Ably token');
      }

      console.log('[Ably] Creating Ably client...');
      
      // Create Ably client with token auth
      const client = new Ably.Realtime({
        authUrl: '/api/ably/token',
        authMethod: 'GET',
      });

      ablyClientRef.current = client;

      // Connection state handling
      client.connection.on('connected', () => {
        console.log('✅ Ably connected');
        setConnected(true);
      });

      client.connection.on('disconnected', () => {
        console.log('❌ Ably disconnected');
        setConnected(false);
      });

      client.connection.on('failed', (error: any) => {
        console.error('❌ Ably connection failed:', error);
        setConnected(false);
      });

      // Hydrate initial data from Redis
      const storeIsEmpty = useMatchStore.getState().matches.size === 0;
      const needsInitialization = !hasInitializedRef.current && storeIsEmpty;
      
      if (needsInitialization) {
        try {
          console.log('[Ably] Hydrating initial data from Redis...');
          const hydrateResponse = await fetch('/api/hydrate');
          const hydrateResult = await hydrateResponse.json();
          
          if (hydrateResult.success) {
            setInitialData(hydrateResult.data);
            hasInitializedRef.current = true;
            console.log('[Ably] Initial data loaded:', hydrateResult.data.matches.length, 'matches');
          }
        } catch (error) {
          console.error('[Ably] Failed to hydrate initial data:', error);
        }
      } else {
        console.log('[Ably] Store already has data, skipping hydration');
      }

      // Subscribe to sports channels
      // Start with football (most popular)
      const sportsToSubscribe = ['football', 'basketball', 'americanfootball', 'baseball', 'icehockey'];
      
      for (const sport of sportsToSubscribe) {
        const channelName = `sports:${sport}`;
        const channel = client.channels.get(channelName);
        
        await channel.subscribe('update', (message: Ably.Types.Message) => {
          try {
            const data = message.data;
            
            // Handle batch updates
            if (data.type === 'batch:updates') {
              console.log(`[Ably] Received batch from ${channelName}: ${data.count} updates`);
              
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
      setConnected(false);
    }
  }, [setConnected, setInitialData, queueUpdate]);

  /**
   * Cleanup Ably connection
   */
  const cleanup = useCallback(() => {
    // Flush any pending updates
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    flushBatch();

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

    setConnected(false);
  }, [flushBatch, setConnected]);

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
