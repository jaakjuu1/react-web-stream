import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateLiveKitToken, getLiveKitUrl } from '../services/livekit.service.js';
import crypto from 'crypto';

export const tokensRouter = Router();

const cameraTokenSchema = z.object({
  roomId: z.string(),
  deviceName: z.string().optional(),
});

const viewerTokenSchema = z.object({
  roomId: z.string(),
});

// Get token for camera (publishing)
tokensRouter.post('/camera', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { roomId, deviceName } = cameraTokenSchema.parse(req.body);

    // Verify room belongs to user
    const room = await prisma.room.findFirst({
      where: { id: roomId, userId: req.userId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Generate participant ID
    const participantId = `cam_${crypto.randomBytes(4).toString('hex')}`;

    // Create or update device
    const device = await prisma.device.upsert({
      where: { participantId },
      create: {
        name: deviceName || `Camera ${participantId.slice(-4)}`,
        participantId,
        deviceType: 'mobile',
        userId: req.userId!,
        roomId: room.id,
        isOnline: true,
        lastSeen: new Date(),
      },
      update: {
        roomId: room.id,
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    const token = await generateLiveKitToken({
      roomName: room.livekitRoom,
      participantName: participantId,
      role: 'camera',
    });

    res.json({
      token,
      livekitUrl: getLiveKitUrl(),
      roomName: room.livekitRoom,
      participantId,
      deviceId: device.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Camera token error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Get token for viewer (subscribing)
tokensRouter.post('/viewer', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { roomId } = viewerTokenSchema.parse(req.body);

    // Verify room belongs to user
    const room = await prisma.room.findFirst({
      where: { id: roomId, userId: req.userId },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participantId = `viewer_${crypto.randomBytes(4).toString('hex')}`;

    const token = await generateLiveKitToken({
      roomName: room.livekitRoom,
      participantName: participantId,
      role: 'viewer',
    });

    res.json({
      token,
      livekitUrl: getLiveKitUrl(),
      roomName: room.livekitRoom,
      participantId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Viewer token error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Demo tokens (no auth required) - for development/testing
tokensRouter.post('/demo/camera', async (req, res) => {
  try {
    const participantId = `cam_${crypto.randomBytes(4).toString('hex')}`;

    const token = await generateLiveKitToken({
      roomName: 'demo-room',
      participantName: participantId,
      role: 'camera',
    });

    res.json({
      token,
      livekitUrl: getLiveKitUrl(),
      roomName: 'demo-room',
      participantId,
    });
  } catch (error) {
    console.error('Demo camera token error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

tokensRouter.post('/demo/viewer', async (req, res) => {
  try {
    const participantId = `viewer_${crypto.randomBytes(4).toString('hex')}`;

    const token = await generateLiveKitToken({
      roomName: 'demo-room',
      participantName: participantId,
      role: 'viewer',
    });

    res.json({
      token,
      livekitUrl: getLiveKitUrl(),
      roomName: 'demo-room',
      participantId,
    });
  } catch (error) {
    console.error('Demo viewer token error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});
