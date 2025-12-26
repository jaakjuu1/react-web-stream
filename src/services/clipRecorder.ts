export interface RecordingConfig {
  preBufferSeconds: number;
  postBufferSeconds: number;
  mimeType: string;
  videoBitsPerSecond: number;
}

export interface StoredClip {
  id: string;
  type: 'motion' | 'sound';
  timestamp: number;
  confidence: number;
  deviceId: string;
  videoBlob?: Blob;
  imageBlob?: Blob;
  synced: boolean;
}

const DEFAULT_CONFIG: RecordingConfig = {
  preBufferSeconds: 3,
  postBufferSeconds: 7,
  mimeType: 'video/webm;codecs=vp8,opus',
  videoBitsPerSecond: 1_000_000,
};

const DB_NAME = 'pet-portal-clips';
const DB_VERSION = 1;
const STORE_NAME = 'clips';

export class ClipRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private preBuffer: Blob[] = [];
  private config: RecordingConfig;
  private isBuffering = false;
  private db: IDBDatabase | null = null;

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[ClipRecorder] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  startBuffering(stream: MediaStream): void {
    if (this.isBuffering) {
      return;
    }

    // Check for supported mime type
    let mimeType = this.config.mimeType;
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('[ClipRecorder] No supported video mime type found');
        return;
      }
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: this.config.videoBitsPerSecond,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.preBuffer.push(e.data);
          // Keep only last N seconds
          while (this.preBuffer.length > this.config.preBufferSeconds) {
            this.preBuffer.shift();
          }
        }
      };

      this.mediaRecorder.onerror = (e) => {
        console.error('[ClipRecorder] MediaRecorder error:', e);
      };

      this.mediaRecorder.start(1000); // 1-second chunks
      this.isBuffering = true;
      console.log('[ClipRecorder] Started buffering');
    } catch (err) {
      console.error('[ClipRecorder] Failed to start MediaRecorder:', err);
    }
  }

  async captureEvent(
    type: 'motion' | 'sound',
    confidence: number,
    deviceId: string,
    videoElement?: HTMLVideoElement
  ): Promise<StoredClip | null> {
    if (!this.isBuffering || !this.mediaRecorder) {
      console.warn('[ClipRecorder] Not buffering, cannot capture event');
      return null;
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    // Grab pre-buffer
    const preBufferClips = [...this.preBuffer];
    const postBufferChunks: Blob[] = [];

    // Capture screenshot if video element provided
    let imageBlob: Blob | undefined;
    if (videoElement) {
      imageBlob = await this.captureScreenshot(videoElement) || undefined;
    }

    // Record post-buffer
    const videoBlob = await new Promise<Blob>((resolve) => {
      const captureHandler = (e: BlobEvent) => {
        if (e.data.size > 0) {
          postBufferChunks.push(e.data);
        }
      };

      this.mediaRecorder!.addEventListener('dataavailable', captureHandler);

      setTimeout(() => {
        this.mediaRecorder!.removeEventListener('dataavailable', captureHandler);
        const fullClip = new Blob(
          [...preBufferClips, ...postBufferChunks],
          { type: this.mediaRecorder!.mimeType }
        );
        resolve(fullClip);
      }, this.config.postBufferSeconds * 1000);
    });

    const clip: StoredClip = {
      id,
      type,
      timestamp,
      confidence,
      deviceId,
      videoBlob,
      imageBlob,
      synced: false,
    };

    // Save to IndexedDB
    await this.saveClip(clip);

    return clip;
  }

  private captureScreenshot(videoElement: HTMLVideoElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (videoElement.readyState < 2) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(videoElement, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    });
  }

  private async saveClip(clip: StoredClip): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(clip);

      request.onsuccess = () => {
        console.log('[ClipRecorder] Saved clip:', clip.id);
        resolve();
      };

      request.onerror = () => {
        console.error('[ClipRecorder] Failed to save clip:', request.error);
        reject(request.error);
      };
    });
  }

  async getClips(options?: {
    type?: 'motion' | 'sound';
    synced?: boolean;
    limit?: number;
  }): Promise<StoredClip[]> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');

      const results: StoredClip[] = [];
      const limit = options?.limit ?? 50;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && results.length < limit) {
          const clip = cursor.value as StoredClip;

          let include = true;
          if (options?.type !== undefined && clip.type !== options.type) {
            include = false;
          }
          if (options?.synced !== undefined && clip.synced !== options.synced) {
            include = false;
          }

          if (include) {
            results.push(clip);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async markSynced(id: string): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const clip = getRequest.result as StoredClip;
        if (clip) {
          clip.synced = true;
          const putRequest = store.put(clip);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteClip(id: string): Promise<void> {
    if (!this.db) {
      await this.initDB();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  stopBuffering(): void {
    if (this.mediaRecorder && this.isBuffering) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
      this.preBuffer = [];
      this.isBuffering = false;
      console.log('[ClipRecorder] Stopped buffering');
    }
  }

  get buffering(): boolean {
    return this.isBuffering;
  }

  updateConfig(config: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RecordingConfig {
    return { ...this.config };
  }
}
