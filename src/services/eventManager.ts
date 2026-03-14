export type EventType = 'motion' | 'sound';

export interface DetectionEvent {
  type: EventType;
  timestamp: number;
  confidence: number;
  deviceId: string;
}

export interface DetectionSettings {
  motionEnabled: boolean;
  soundEnabled: boolean;
  motionSensitivity: number; // 0-1, maps to threshold
  soundSensitivity: number; // 0-1, maps to threshold
  cooldownSeconds: number;
}

export interface EventCallbacks {
  onEvent: (event: DetectionEvent) => Promise<void>;
  onSettingsReceived?: (settings: DetectionSettings) => void;
}

const DEFAULT_SETTINGS: DetectionSettings = {
  motionEnabled: true,
  soundEnabled: true,
  motionSensitivity: 0.5,
  soundSensitivity: 0.5,
  cooldownSeconds: 30,
};

// Map sensitivity (0-1) to actual threshold values
// Higher sensitivity = lower threshold (easier to trigger)
export function sensitivityToMotionThreshold(sensitivity: number): number {
  // Sensitivity 0 = 0.05 (hard to trigger), 1 = 0.01 (easy to trigger)
  return 0.05 - sensitivity * 0.04;
}

export function sensitivityToSoundThreshold(sensitivity: number): number {
  // Sensitivity 0 = 0.3 (hard to trigger), 1 = 0.05 (easy to trigger)
  return 0.3 - sensitivity * 0.25;
}

export class EventManager {
  private lastEventTime: Record<EventType, number> = {
    motion: 0,
    sound: 0,
  };
  private callbacks: EventCallbacks;
  private settings: DetectionSettings;
  private deviceId: string;

  constructor(deviceId: string, callbacks: EventCallbacks) {
    this.deviceId = deviceId;
    this.callbacks = callbacks;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  async handleDetection(
    type: EventType,
    confidence: number
  ): Promise<boolean> {
    const now = Date.now();

    // Check if this type is enabled
    if (type === 'motion' && !this.settings.motionEnabled) {
      return false;
    }
    if (type === 'sound' && !this.settings.soundEnabled) {
      return false;
    }

    // Check cooldown
    const cooldownMs = this.settings.cooldownSeconds * 1000;
    if (now - this.lastEventTime[type] < cooldownMs) {
      return false;
    }

    // Get minimum confidence based on sensitivity
    const minConfidence = type === 'motion'
      ? 0.6 - this.settings.motionSensitivity * 0.4  // 0.6 to 0.2
      : 0.6 - this.settings.soundSensitivity * 0.4;

    if (confidence < minConfidence) {
      return false;
    }

    this.lastEventTime[type] = now;

    const event: DetectionEvent = {
      type,
      timestamp: now,
      confidence,
      deviceId: this.deviceId,
    };

    await this.callbacks.onEvent(event);
    return true;
  }

  updateSettings(settings: Partial<DetectionSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getSettings(): DetectionSettings {
    return { ...this.settings };
  }

  // Handle settings received from viewer via LiveKit data channel
  handleSettingsMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'detection_settings') {
        this.updateSettings(parsed.settings);
        this.callbacks.onSettingsReceived?.(this.settings);
        console.log('[EventManager] Settings updated from viewer:', this.settings);
      }
    } catch (err) {
      console.error('[EventManager] Failed to parse settings message:', err);
    }
  }

  // Create message to send detection event to viewer
  createEventMessage(event: DetectionEvent): string {
    return JSON.stringify({
      type: 'detection_event',
      event,
    });
  }

  // Create message to send current settings (for sync)
  createSettingsMessage(): string {
    return JSON.stringify({
      type: 'detection_settings',
      settings: this.settings,
    });
  }

  resetCooldown(type?: EventType): void {
    if (type) {
      this.lastEventTime[type] = 0;
    } else {
      this.lastEventTime = { motion: 0, sound: 0 };
    }
  }

  getLastEventTime(type: EventType): number {
    return this.lastEventTime[type];
  }

  isOnCooldown(type: EventType): boolean {
    const cooldownMs = this.settings.cooldownSeconds * 1000;
    return Date.now() - this.lastEventTime[type] < cooldownMs;
  }
}
