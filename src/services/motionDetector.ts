export interface MotionConfig {
  width: number;
  height: number;
  threshold: number;
  motionThreshold: number;
}

export interface MotionResult {
  hasMotion: boolean;
  score: number;
  confidence: number;
}

const DEFAULT_CONFIG: MotionConfig = {
  width: 320,
  height: 240,
  threshold: 25,
  motionThreshold: 0.02,
};

export class MotionDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private previousFrame: ImageData | null = null;
  private config: MotionConfig;

  constructor(config: Partial<MotionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get canvas 2d context');
    }
    this.ctx = ctx;
  }

  analyze(videoElement: HTMLVideoElement): MotionResult {
    if (videoElement.readyState < 2) {
      return { hasMotion: false, score: 0, confidence: 0 };
    }

    this.ctx.drawImage(
      videoElement,
      0,
      0,
      this.config.width,
      this.config.height
    );
    const currentFrame = this.ctx.getImageData(
      0,
      0,
      this.config.width,
      this.config.height
    );

    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return { hasMotion: false, score: 0, confidence: 0 };
    }

    let changedPixels = 0;
    const totalPixels = currentFrame.data.length / 4;
    const threshold3 = this.config.threshold * 3;

    for (let i = 0; i < currentFrame.data.length; i += 4) {
      const diff =
        Math.abs(currentFrame.data[i] - this.previousFrame.data[i]) +
        Math.abs(currentFrame.data[i + 1] - this.previousFrame.data[i + 1]) +
        Math.abs(currentFrame.data[i + 2] - this.previousFrame.data[i + 2]);
      if (diff > threshold3) {
        changedPixels++;
      }
    }

    this.previousFrame = currentFrame;
    const score = changedPixels / totalPixels;

    return {
      hasMotion: score > this.config.motionThreshold,
      score,
      confidence: Math.min(score / this.config.motionThreshold, 1),
    };
  }

  updateConfig(config: Partial<MotionConfig>): void {
    this.config = { ...this.config, ...config };
    if (
      config.width !== undefined ||
      config.height !== undefined
    ) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
      this.previousFrame = null;
    }
  }

  reset(): void {
    this.previousFrame = null;
  }

  getConfig(): MotionConfig {
    return { ...this.config };
  }
}
