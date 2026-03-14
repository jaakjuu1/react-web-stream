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
    // Immediately emit current stats
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
        this.processQueue(); // Start processing
      };
      request.onerror = () => reject(request.error);
    });
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) {
      console.log('[SyncService] Skipping queue processing:', {
        isProcessing: this.isProcessing,
        online: navigator.onLine,
      });
      return;
    }
    this.isProcessing = true;

    try {
      const pendingClips = await this.getPendingClips();
      console.log('[SyncService] Processing', pendingClips.length, 'pending clips');

      for (const clip of pendingClips) {
        if (!navigator.onLine) break;

        await this.updateClipStatus(clip.id, 'uploading');

        try {
          await this.uploadClip(clip);
          await this.updateClipStatus(clip.id, 'synced');
          console.log('[SyncService] Clip uploaded successfully:', clip.id);
        } catch (error) {
          console.error('[SyncService] Upload failed:', clip.id, error);
          const attempts = clip.syncAttempts + 1;
          const status = attempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

          await this.updateClipStatus(clip.id, status, {
            syncAttempts: attempts,
            lastSyncError: error instanceof Error ? error.message : 'Upload failed',
          });

          // Schedule retry with backoff
          if (status === 'pending') {
            const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
            console.log('[SyncService] Scheduling retry in', delay, 'ms');
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

  private async getPendingClips(): Promise<SyncableClip[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('syncStatus');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
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

  async getSyncStats(): Promise<SyncStats> {
    if (!this.db) {
      return { pending: 0, uploading: 0, synced: 0, failed: 0 };
    }

    const all = await this.getAllClips();
    return {
      pending: all.filter((c) => c.syncStatus === 'pending').length,
      uploading: all.filter((c) => c.syncStatus === 'uploading').length,
      synced: all.filter((c) => c.syncStatus === 'synced').length,
      failed: all.filter((c) => c.syncStatus === 'failed').length,
    };
  }

  private async getAllClips(): Promise<SyncableClip[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async retryFailed(): Promise<void> {
    const failed = await new Promise<SyncableClip[]>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('syncStatus');
      const request = index.getAll('failed');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log('[SyncService] Retrying', failed.length, 'failed clips');

    for (const clip of failed) {
      await this.updateClipStatus(clip.id, 'pending', { syncAttempts: 0 });
    }

    this.emitStats();
    this.processQueue();
  }

  async clearSynced(): Promise<void> {
    const synced = await new Promise<SyncableClip[]>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('syncStatus');
      const request = index.getAll('synced');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = this.db!.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const clip of synced) {
      store.delete(clip.id);
    }

    console.log('[SyncService] Cleared', synced.length, 'synced clips from local DB');
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
