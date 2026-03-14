import { api } from '../lib/api';

export type SyncStatus = 'pending' | 'uploading' | 'synced' | 'failed';

export interface SyncableClip {
  id: string;
  type: 'motion' | 'sound';
  timestamp: number;
  confidence: number;
  deviceId: string;
  videoBlob: Blob;
  syncStatus: SyncStatus;
  syncAttempts: number;
  lastSyncError?: string;
}

export interface SyncStats {
  pending: number;
  uploading: number;
  synced: number;
  failed: number;
}

const DB_NAME = 'pet-portal-sync';
const STORE_NAME = 'clips';
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

type SyncEventListener = (stats: SyncStats) => void;

/** Count records matching a key on an IDBIndex without deserializing blobs. */
function countByIndex(index: IDBIndex, key: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = index.count(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get only the IDs of records matching a key on an IDBIndex. */
function getKeysByIndex(index: IDBIndex, key: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const keys: string[] = [];
    const request = index.openKeyCursor(key);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        keys.push(cursor.primaryKey as string);
        cursor.continue();
      } else {
        resolve(keys);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

class SyncService {
  private db: IDBDatabase | null = null;
  private isProcessing = false;
  private roomId: string | null = null;
  private listeners: Set<SyncEventListener> = new Set();
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

  async init(roomId: string): Promise<void> {
    this.roomId = roomId;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[SyncService] Initialized for room:', roomId);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('syncStatus', 'syncStatus');
          store.createIndex('timestamp', 'timestamp');
        }
      };
    });
  }

  addListener(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    this.emitStats();
    return () => this.listeners.delete(listener);
  }

  private async emitStats(): Promise<void> {
    const stats = await this.getSyncStats();
    this.listeners.forEach((listener) => listener(stats));
  }

  async queueClip(clip: Omit<SyncableClip, 'syncStatus' | 'syncAttempts'>): Promise<void> {
    if (!this.db) throw new Error('SyncService not initialized');

    const syncableClip: SyncableClip = {
      ...clip,
      syncStatus: 'pending',
      syncAttempts: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(syncableClip);

      request.onsuccess = () => {
        console.log('[SyncService] Clip queued:', clip.id);
        this.emitStats();
        resolve();
        this.processQueue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) {
      return;
    }
    this.isProcessing = true;

    try {
      // Get only IDs of pending clips to avoid loading blobs into memory
      const pendingIds = await this.getPendingClipIds();
      console.log('[SyncService] Processing', pendingIds.length, 'pending clips');

      for (const clipId of pendingIds) {
        if (!navigator.onLine) break;

        await this.updateClipStatus(clipId, 'uploading');

        // Load one clip at a time to limit memory usage
        const clip = await this.getClipById(clipId);
        if (!clip) continue;

        try {
          await this.uploadClip(clip);
          await this.updateClipStatus(clipId, 'synced');
          console.log('[SyncService] Clip uploaded successfully:', clipId);
        } catch (error) {
          console.error('[SyncService] Upload failed:', clipId, error);
          const attempts = clip.syncAttempts + 1;
          const status = attempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

          await this.updateClipStatus(clipId, status, {
            syncAttempts: attempts,
            lastSyncError: error instanceof Error ? error.message : 'Upload failed',
          });

          if (status === 'pending') {
            const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
            this.retryTimeoutId = setTimeout(() => this.processQueue(), delay);
          }
        }
      }
    } finally {
      this.isProcessing = false;
      this.emitStats();
    }
  }

  private async uploadClip(clip: SyncableClip): Promise<void> {
    if (!this.roomId) throw new Error('Room ID not set');

    const formData = new FormData();
    formData.append('video', clip.videoBlob, `clip-${clip.id}.webm`);
    formData.append('roomId', this.roomId);
    formData.append('deviceId', clip.deviceId);
    formData.append('detectionType', clip.type);
    formData.append('confidence', clip.confidence.toString());
    formData.append('recordedAt', new Date(clip.timestamp).toISOString());

    await api.uploadClip(formData);
  }

  /** Get IDs only — no blob deserialization. */
  private async getPendingClipIds(): Promise<string[]> {
    const tx = this.db!.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('syncStatus');
    return getKeysByIndex(index, 'pending');
  }

  /** Load a single clip by ID (including blob). */
  private async getClipById(id: string): Promise<SyncableClip | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async updateClipStatus(
    id: string,
    status: SyncStatus,
    extra?: Partial<SyncableClip>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const clip = getRequest.result;
        if (clip) {
          const updated = { ...clip, syncStatus: status, ...extra };
          store.put(updated);
        }
        resolve();
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /** Count clips per status using index counts — no blob deserialization. */
  async getSyncStats(): Promise<SyncStats> {
    if (!this.db) {
      return { pending: 0, uploading: 0, synced: 0, failed: 0 };
    }

    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('syncStatus');

    const [pending, uploading, synced, failed] = await Promise.all([
      countByIndex(index, 'pending'),
      countByIndex(index, 'uploading'),
      countByIndex(index, 'synced'),
      countByIndex(index, 'failed'),
    ]);

    return { pending, uploading, synced, failed };
  }

  async retryFailed(): Promise<void> {
    const tx = this.db!.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('syncStatus');
    const failedIds = await getKeysByIndex(index, 'failed');

    console.log('[SyncService] Retrying', failedIds.length, 'failed clips');

    for (const id of failedIds) {
      await this.updateClipStatus(id, 'pending', { syncAttempts: 0 });
    }

    this.emitStats();
    this.processQueue();
  }

  async clearSynced(): Promise<void> {
    const tx = this.db!.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('syncStatus');
    const syncedIds = await getKeysByIndex(index, 'synced');

    const deleteTx = this.db!.transaction(STORE_NAME, 'readwrite');
    const store = deleteTx.objectStore(STORE_NAME);

    for (const id of syncedIds) {
      store.delete(id);
    }

    console.log('[SyncService] Cleared', syncedIds.length, 'synced clips from local DB');
    this.emitStats();
  }

  destroy(): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
    this.listeners.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const syncService = new SyncService();
