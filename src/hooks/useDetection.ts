import { useRef, useEffect, useCallback, useState } from 'react';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { MotionDetector } from '../services/motionDetector';
import { SoundDetector } from '../services/soundDetector';
import { ClipRecorder, StoredClip } from '../services/clipRecorder';
import {
  EventManager,
  DetectionSettings,
  DetectionEvent,
  sensitivityToMotionThreshold,
  sensitivityToSoundThreshold,
} from '../services/eventManager';

export interface UseDetectionOptions {
  room: Room | null;
  deviceId: string;
  videoElement: HTMLVideoElement | null;
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
  enabled?: boolean;
}

export interface DetectionState {
  isActive: boolean;
  lastMotionEvent: DetectionEvent | null;
  lastSoundEvent: DetectionEvent | null;
  motionLevel: number;
  soundLevel: number;
  settings: DetectionSettings;
  isCapturing: boolean;
}

const DETECTION_INTERVAL = 200; // ms between detection checks

export function useDetection(options: UseDetectionOptions) {
  const { room, deviceId, videoElement, audioStream, videoStream, enabled = true } = options;

  const [state, setState] = useState<DetectionState>({
    isActive: false,
    lastMotionEvent: null,
    lastSoundEvent: null,
    motionLevel: 0,
    soundLevel: 0,
    settings: {
      motionEnabled: true,
      soundEnabled: true,
      motionSensitivity: 0.5,
      soundSensitivity: 0.5,
      cooldownSeconds: 30,
    },
    isCapturing: false,
  });

  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const soundDetectorRef = useRef<SoundDetector | null>(null);
  const clipRecorderRef = useRef<ClipRecorder | null>(null);
  const eventManagerRef = useRef<EventManager | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastCheckRef = useRef<number>(0);

  // Handle detection event
  const handleEvent = useCallback(async (event: DetectionEvent) => {
    console.log('[useDetection] Event detected:', event);

    setState((prev) => ({
      ...prev,
      isCapturing: true,
      ...(event.type === 'motion'
        ? { lastMotionEvent: event }
        : { lastSoundEvent: event }),
    }));

    // Capture clip
    const clip = await clipRecorderRef.current?.captureEvent(
      event.type,
      event.confidence,
      event.deviceId,
      videoElement || undefined
    );

    setState((prev) => ({ ...prev, isCapturing: false }));

    // Send event to viewers via LiveKit data channel
    if (room && eventManagerRef.current) {
      const message = eventManagerRef.current.createEventMessage(event);
      const encoder = new TextEncoder();
      const data = encoder.encode(message);

      try {
        await room.localParticipant.publishData(data, {
          reliable: true,
          topic: 'detection',
        });
        console.log('[useDetection] Sent event to viewers');
      } catch (err) {
        console.error('[useDetection] Failed to send event:', err);
      }
    }

    return clip;
  }, [room, videoElement]);

  // Handle settings received from viewer
  const handleSettingsReceived = useCallback((settings: DetectionSettings) => {
    setState((prev) => ({ ...prev, settings }));

    // Update detector thresholds
    if (motionDetectorRef.current) {
      motionDetectorRef.current.updateConfig({
        motionThreshold: sensitivityToMotionThreshold(settings.motionSensitivity),
      });
    }
    if (soundDetectorRef.current) {
      soundDetectorRef.current.updateConfig({
        volumeThreshold: sensitivityToSoundThreshold(settings.soundSensitivity),
      });
    }
  }, []);

  // Initialize services
  useEffect(() => {
    if (!deviceId) return;

    motionDetectorRef.current = new MotionDetector();
    soundDetectorRef.current = new SoundDetector();
    clipRecorderRef.current = new ClipRecorder();
    eventManagerRef.current = new EventManager(deviceId, {
      onEvent: handleEvent,
      onSettingsReceived: handleSettingsReceived,
    });

    return () => {
      soundDetectorRef.current?.disconnect();
      clipRecorderRef.current?.stopBuffering();
    };
  }, [deviceId, handleEvent, handleSettingsReceived]);

  // Connect audio analyzer
  useEffect(() => {
    if (audioStream && soundDetectorRef.current) {
      soundDetectorRef.current.connect(audioStream).catch((err) => {
        console.error('[useDetection] Failed to connect audio:', err);
      });
    }

    return () => {
      soundDetectorRef.current?.disconnect();
    };
  }, [audioStream]);

  // Start/stop clip buffering
  useEffect(() => {
    if (enabled && videoStream && clipRecorderRef.current) {
      clipRecorderRef.current.startBuffering(videoStream);
    } else {
      clipRecorderRef.current?.stopBuffering();
    }

    return () => {
      clipRecorderRef.current?.stopBuffering();
    };
  }, [enabled, videoStream]);

  // Listen for settings messages from viewers
  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: { identity: string } | undefined,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (topic !== 'detection') return;
      if (!participant?.identity.startsWith('viewer_')) return;

      const decoder = new TextDecoder();
      const message = decoder.decode(payload);
      eventManagerRef.current?.handleSettingsMessage(message);
    };

    room.on(RoomEvent.DataReceived, handleData);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Main detection loop
  useEffect(() => {
    if (!enabled || !videoElement) {
      setState((prev) => ({ ...prev, isActive: false }));
      return;
    }

    setState((prev) => ({ ...prev, isActive: true }));

    const runDetection = () => {
      const now = Date.now();

      if (now - lastCheckRef.current >= DETECTION_INTERVAL) {
        lastCheckRef.current = now;

        // Motion detection
        if (
          motionDetectorRef.current &&
          state.settings.motionEnabled &&
          videoElement.readyState >= 2
        ) {
          const motionResult = motionDetectorRef.current.analyze(videoElement);
          setState((prev) => ({ ...prev, motionLevel: motionResult.score }));

          if (motionResult.hasMotion && eventManagerRef.current) {
            eventManagerRef.current.handleDetection('motion', motionResult.confidence);
          }
        }

        // Sound detection
        if (soundDetectorRef.current?.connected && state.settings.soundEnabled) {
          const soundResult = soundDetectorRef.current.analyze();
          setState((prev) => ({ ...prev, soundLevel: soundResult.volume }));

          if (soundResult.hasSound && eventManagerRef.current) {
            // Use volume as confidence (normalized)
            const confidence = Math.min(soundResult.volume / 0.3, 1);
            eventManagerRef.current.handleDetection('sound', confidence);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(runDetection);
    };

    animationFrameRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setState((prev) => ({ ...prev, isActive: false }));
    };
  }, [enabled, videoElement, state.settings.motionEnabled, state.settings.soundEnabled]);

  // Update settings
  const updateSettings = useCallback((settings: Partial<DetectionSettings>) => {
    eventManagerRef.current?.updateSettings(settings);
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));

    // Update detector thresholds
    if (settings.motionSensitivity !== undefined && motionDetectorRef.current) {
      motionDetectorRef.current.updateConfig({
        motionThreshold: sensitivityToMotionThreshold(settings.motionSensitivity),
      });
    }
    if (settings.soundSensitivity !== undefined && soundDetectorRef.current) {
      soundDetectorRef.current.updateConfig({
        volumeThreshold: sensitivityToSoundThreshold(settings.soundSensitivity),
      });
    }

    // Send updated settings to viewers
    if (room && eventManagerRef.current) {
      const message = eventManagerRef.current.createSettingsMessage();
      const encoder = new TextEncoder();
      const data = encoder.encode(message);

      room.localParticipant.publishData(data, {
        reliable: true,
        topic: 'detection',
      }).catch((err) => {
        console.error('[useDetection] Failed to send settings:', err);
      });
    }
  }, [room]);

  // Get stored clips
  const getClips = useCallback(async (options?: {
    type?: 'motion' | 'sound';
    synced?: boolean;
    limit?: number;
  }): Promise<StoredClip[]> => {
    return clipRecorderRef.current?.getClips(options) || [];
  }, []);

  return {
    ...state,
    updateSettings,
    getClips,
  };
}
