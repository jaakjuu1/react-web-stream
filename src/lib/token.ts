import { SignJWT } from 'jose';
import type { ParticipantRole } from '../types';

const API_KEY = import.meta.env.VITE_LIVEKIT_API_KEY;
const API_SECRET = import.meta.env.VITE_LIVEKIT_API_SECRET;

interface TokenOptions {
  roomName: string;
  participantName: string;
  role: ParticipantRole;
}

export async function generateToken({
  roomName,
  participantName,
  role,
}: TokenOptions): Promise<string> {
  if (!API_KEY || !API_SECRET) {
    throw new Error(
      'LiveKit API key and secret must be set in environment variables'
    );
  }

  const encoder = new TextEncoder();
  const secret = encoder.encode(API_SECRET);

  // Set permissions based on role
  const canPublish = role === 'camera';
  const canSubscribe = role === 'viewer';

  const token = await new SignJWT({
    video: {
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe,
      canPublishData: true,
    },
    sub: participantName,
    iss: API_KEY,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(secret);

  return token;
}
