export interface SoundConfig {
  volumeThreshold: number;
  fftSize: number;
}

export interface SoundResult {
  hasSound: boolean;
  volume: number;
}

const DEFAULT_CONFIG: SoundConfig = {
  volumeThreshold: 0.15,
  fftSize: 2048,
};

export class SoundDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private config: SoundConfig;
  private isConnected = false;

  constructor(config: Partial<SoundConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(stream: MediaStream): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      this.audioContext = new AudioContext();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isConnected = true;
    } catch (err) {
      console.error('[SoundDetector] Failed to connect:', err);
      throw err;
    }
  }

  analyze(): SoundResult {
    if (!this.analyser || !this.dataArray) {
      return { hasSound: false, volume: 0 };
    }

    this.analyser.getByteTimeDomainData(this.dataArray);

    // Calculate RMS volume
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const volume = Math.sqrt(sum / this.dataArray.length);

    return {
      hasSound: volume > this.config.volumeThreshold,
      volume,
    };
  }

  updateConfig(config: Partial<SoundConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.analyser && config.fftSize !== undefined) {
      this.analyser.fftSize = config.fftSize;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }
  }

  disconnect(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.isConnected = false;
  }

  getConfig(): SoundConfig {
    return { ...this.config };
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
