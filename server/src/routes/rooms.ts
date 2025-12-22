import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

export const roomsRouter = Router();

// All routes require authentication
roomsRouter.use(authMiddleware);

const createRoomSchema = z.object({
  name: z.string().min(1).max(50),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).max(50),
});

// List user's rooms
roomsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { userId: req.userId },
      include: {
        _count: { select: { devices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        livekitRoom: room.livekitRoom,
        deviceCount: room._count.devices,
        createdAt: room.createdAt,
      })),
    });
  } catch (error) {
    console.error('List rooms error:', error);
    res.status(500).json({ error: 'Failed to list rooms' });
  }
});

// Create room
roomsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { name } = createRoomSchema.parse(req.body);

    const livekitRoom = `room_${crypto.randomBytes(8).toString('hex')}`;

    const room = await prisma.room.create({
      data: {
        name,
        livekitRoom,
        userId: req.userId!,
      },
    });

    res.status(201).json({
      room: {
        id: room.id,
        name: room.name,
        livekitRoom: room.livekitRoom,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Get room details
roomsRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const room = await prisma.room.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        devices: {
          select: {
            id: true,
            name: true,
            deviceType: true,
            participantId: true,
            isOnline: true,
            lastSeen: true,
          },
        },
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      room: {
        id: room.id,
        name: room.name,
        livekitRoom: room.livekitRoom,
        devices: room.devices,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// Update room
roomsRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { name } = updateRoomSchema.parse(req.body);

    const room = await prisma.room.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      data: { name },
    });

    if (room.count === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const updated = await prisma.room.findUnique({
      where: { id: req.params.id },
    });

    res.json({ room: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update room error:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// Delete room
roomsRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await prisma.room.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});
