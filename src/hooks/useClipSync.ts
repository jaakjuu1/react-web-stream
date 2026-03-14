import { useState, useEffect, useCallback, useRef } from 'react';
import { syncService, type SyncStats } from '../services/syncService';

export interface UseClipSyncOptions {
  roomId: string | null;
  enabled?: boolean;
}

export interface UseClipSyncResult {
  stats: SyncStats;
  isInitialized: boolean;
  queueClip: (clip: {
    id: string;
    type: 'motion' | 'sound';
    timestamp: number;
    confidence: number;
    deviceId: string;
    videoBlob: Blob;
  }) => Promise<void>;
  retryFailed: () => Promise<void>;
  clearSynced: () => Promise<void>;
  processQueue: () => Promise<void>;
}

export function useClipSync(options: UseClipSyncOptions): UseClipSyncResult {
  const { roomId, enabled = true } = options;
  const [stats, setStats] = useState<SyncStats>({
    pending: 0,
    uploading: 0,
    synced: 0,
    failed: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const initRef = useRef(false);

  // Initialize sync service
  useEffect(() => {
    if (!roomId || !enabled || initRef.current) return;

    initRef.current = true;
    syncService
      .init(roomId)
      .then(() => {
        setIsInitialized(true);
        console.log('[useClipSync] Sync service initialized for room:', roomId);
        // Try to process any pending clips on init
        syncService.processQueue();
      })
      .catch((err) => {
        console.error('[useClipSync] Failed to initialize sync service:', err);
        initRef.current = false;
      });

    return () => {
      // Don't destroy on unmount, keep processing in background
    };
  }, [roomId, enabled]);

  // Listen for stats updates
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = syncService.addListener(setStats);
    return unsubscribe;
  }, [isInitialized]);

  // Listen for online/offline events
  useEffect(() => {
    if (!isInitialized) return;

    const handleOnline = () => {
      console.log('[useClipSync] Back online, processing queue');
      syncService.processQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isInitialized]);

  const queueClip = useCallback(
    async (clip: {
      id: string;
      type: 'motion' | 'sound';
      timestamp: number;
      confidence: number;
      deviceId: string;
      videoBlob: Blob;
    }) => {
      if (!isInitialized) {
        console.warn('[useClipSync] Cannot queue clip - not initialized');
        return;
      }
      await syncService.queueClip(clip);
    },
    [isInitialized]
  );

  const retryFailed = useCallback(async () => {
    if (!isInitialized) return;
    await syncService.retryFailed();
  }, [isInitialized]);

  const clearSynced = useCallback(async () => {
    if (!isInitialized) return;
    await syncService.clearSynced();
  }, [isInitialized]);

  const processQueue = useCallback(async () => {
    if (!isInitialized) return;
    await syncService.processQueue();
  }, [isInitialized]);

  return {
    stats,
    isInitialized,
    queueClip,
    retryFailed,
    clearSynced,
    processQueue,
  };
}
