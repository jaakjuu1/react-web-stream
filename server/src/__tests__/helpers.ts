import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { generateDeviceSecret, hashDeviceSecret } from '../middleware/deviceAuth.js';

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}_${crypto.randomBytes(3).toString('hex')}`;
}

export async function createTestUser(
  overrides: { subscriptionStatus?: string | null } = {}
) {
  return prisma.user.create({
    data: {
      clerkId: unique('clerk'),
      subscriptionStatus:
        'subscriptionStatus' in overrides ? overrides.subscriptionStatus : 'active',
    },
  });
}

export async function createTestRoom(userId: string) {
  return prisma.room.create({
    data: {
      name: 'Test Room',
      livekitRoom: unique('room'),
      userId,
    },
  });
}

export async function createTestPairingCode(
  roomId: string,
  userId: string,
  overrides: { expired?: boolean; used?: boolean } = {}
) {
  return prisma.pairingCode.create({
    data: {
      code: crypto.randomBytes(4).toString('hex').toUpperCase(),
      expiresAt: new Date(Date.now() + (overrides.expired ? -1 : 1) * 10 * 60 * 1000),
      used: overrides.used ?? false,
      roomId,
      userId,
    },
  });
}

export async function createTestDevice(roomId: string, userId: string) {
  const secret = generateDeviceSecret();
  const device = await prisma.device.create({
    data: {
      name: 'Test Camera',
      participantId: unique('cam'),
      secretHash: hashDeviceSecret(secret),
      userId,
      roomId,
    },
  });
  return { device, secret, authHeader: `Device ${device.id}.${secret}` };
}
