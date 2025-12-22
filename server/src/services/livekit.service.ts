import { AccessToken, VideoGrant } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.warn('Warning: LiveKit credentials not configured');
}

export interface TokenOptions {
  roomName: string;
  participantName: string;
  role: 'camera' | 'viewer';
}

export async function generateLiveKitToken(options: TokenOptions): Promise<string> {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials not configured');
  }

  const { roomName, participantName, role } = options;

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '24h',
  });

  // Two-way audio: cameras publish video+audio, viewers publish audio only
  // Both roles can subscribe to hear each other
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublishSources: role === 'camera'
      ? ['camera', 'microphone']
      : ['microphone'], // Viewers can only publish audio (for talking to pet)
    canSubscribe: true, // Both roles can subscribe
    canPublishData: true,
  };

  token.addGrant(grant);

  return await token.toJwt();
}

export function getLiveKitUrl(): string {
  if (!LIVEKIT_URL) {
    throw new Error('LiveKit URL not configured');
  }
  return LIVEKIT_URL;
}
