import { Router, Response } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { clerkAuth, type ClerkRequest } from '../middleware/clerk.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { generateDeviceSecret, hashDeviceSecret } from '../middleware/deviceAuth.js';
import { generateLiveKitToken, getLiveKitUrl } from '../services/livekit.service.js';

export const pairingRouter = Router();

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes — enough to dig out the old phone

const generatePairingSchema = z.object({
  roomId: z.string(),
});

const completePairingSchema = z.object({
  code: z.string(),
  deviceName: z.string().optional(),
});

// Generate pairing code for a room (requires auth + subscription)
pairingRouter.post('/generate', clerkAuth(), requireActiveSubscription(), async (req: ClerkRequest, res: Response) => {
  try {
    const { roomId } = generatePairingSchema.parse(req.body);

    // Verify room belongs to user
    const room = await prisma.room.findFirst({
      where: { id: roomId, userId: req.userId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    // Create pairing code
    await prisma.pairingCode.create({
      data: {
        code,
        expiresAt,
        roomId: room.id,
        userId: req.userId!,
      },
    });

    // QR encodes a plain URL so the phone's native camera app can open it
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const pairUrl = `${frontendUrl}/camera?code=${code}`;

    const qrCodeDataUrl = await QRCode.toDataURL(pairUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.json({
      code,
      pairUrl,
      qrCode: qrCodeDataUrl,
      expiresAt: expiresAt.toISOString(),
      roomName: room.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Generate pairing error:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// Complete pairing (camera submits code, no auth required)
pairingRouter.post('/complete', async (req, res) => {
  try {
    const { code, deviceName } = completePairingSchema.parse(req.body);

    // Find valid pairing code
    const pairingCode = await prisma.pairingCode.findFirst({
      where: {
        code: code.toUpperCase(),
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        room: true,
      },
    });

    if (!pairingCode) {
      return res.status(400).json({ error: 'Invalid or expired pairing code' });
    }

    // Mark code as used; the used:false guard makes concurrent redeems lose
    const consumed = await prisma.pairingCode.updateMany({
      where: { id: pairingCode.id, used: false },
      data: { used: true },
    });

    if (consumed.count === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing code' });
    }

    // Create device with a long-lived secret for re-authentication
    const participantId = `cam_${crypto.randomBytes(4).toString('hex')}`;
    const deviceSecret = generateDeviceSecret();

    const device = await prisma.device.create({
      data: {
        name: deviceName || `Camera ${participantId.slice(-4)}`,
        participantId,
        deviceType: 'mobile',
        secretHash: hashDeviceSecret(deviceSecret),
        userId: pairingCode.userId,
        roomId: pairingCode.roomId,
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    // Generate LiveKit token
    const token = await generateLiveKitToken({
      roomName: pairingCode.room.livekitRoom,
      participantName: participantId,
      role: 'camera',
    });

    res.json({
      success: true,
      token,
      livekitUrl: getLiveKitUrl(),
      roomName: pairingCode.room.livekitRoom,
      roomDisplayName: pairingCode.room.name,
      roomId: pairingCode.roomId,
      participantId,
      deviceId: device.id,
      deviceSecret,
      deviceName: device.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Complete pairing error:', error);
    res.status(500).json({ error: 'Failed to complete pairing' });
  }
});

// Check pairing status (viewer polls this)
pairingRouter.get('/status/:code', clerkAuth(), async (req: ClerkRequest, res: Response) => {
  try {
    const pairingCode = await prisma.pairingCode.findFirst({
      where: {
        code: req.params.code.toUpperCase(),
        userId: req.userId,
      },
    });

    if (!pairingCode) {
      return res.status(404).json({ error: 'Pairing code not found' });
    }

    res.json({
      code: pairingCode.code,
      used: pairingCode.used,
      expired: pairingCode.expiresAt < new Date(),
      expiresAt: pairingCode.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Pairing status error:', error);
    res.status(500).json({ error: 'Failed to get pairing status' });
  }
});
