import { VideoPresets, type RoomOptions } from 'livekit-client';

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
