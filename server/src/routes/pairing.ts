import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateLiveKitToken, getLiveKitUrl } from '../services/livekit.service.js';

export const pairingRouter = Router();

const generatePairingSchema = z.object({
  roomId: z.string(),
});

const completePairingSchema = z.object({
  code: z.string(),
  deviceName: z.string().optional(),
});

// Generate pairing code for a room (requires auth)
pairingRouter.post('/generate', authMiddleware, async (req: AuthRequest, res) => {
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
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Create pairing code
    await prisma.pairingCode.create({
      data: {
        code,
        expiresAt,
        roomId: room.id,
        userId: req.userId!,
      },
    });

    // Generate QR payload
    const qrPayload = JSON.stringify({
      type: 'babycam-pair',
      code,
      apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
      roomId: room.id,
      expiresAt: expiresAt.getTime(),
    });

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.json({
      code,
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

    // Mark code as used
    await prisma.pairingCode.update({
      where: { id: pairingCode.id },
      data: { used: true },
    });

    // Create device
    const participantId = `cam_${crypto.randomBytes(4).toString('hex')}`;

    const device = await prisma.device.create({
      data: {
        name: deviceName || `Camera ${participantId.slice(-4)}`,
        participantId,
        deviceType: 'mobile',
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
      participantId,
      deviceId: device.id,
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
pairingRouter.get('/status/:code', authMiddleware, async (req: AuthRequest, res) => {
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
