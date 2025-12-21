import { VideoPresets, type RoomOptions } from 'livekit-client';

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;

// Default room name for the shared demo room
export const DEFAULT_ROOM_NAME = 'demo-room';

// Generate a random participant ID
export function generateParticipantId(prefix: string): string {
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${randomId}`;
}

// Room options for camera (publisher)
export const cameraRoomOptions: RoomOptions = {
  adaptiveStream: false, // Camera doesn't need adaptive stream (it's publishing)
  dynacast: true, // Enable dynacast to save bandwidth
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
    facingMode: 'environment', // Back camera by default
  },
  publishDefaults: {
    simulcast: true,
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
      VideoPresets.h720,
    ],
    videoCodec: 'vp8',
  },
};

// Room options for viewer (subscriber)
export const viewerRoomOptions: RoomOptions = {
  adaptiveStream: true, // Enable adaptive stream for viewers
  dynacast: true,
};
