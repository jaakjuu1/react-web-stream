import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const devicesRouter = Router();

devicesRouter.use(authMiddleware);

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  roomId: z.string().nullable().optional(),
});

// List user's devices
devicesRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const devices = await prisma.device.findMany({
      where: { userId: req.userId },
      include: {
        room: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ devices });
  } catch (error) {
    console.error('List devices error:', error);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

// Get device details
devicesRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const device = await prisma.device.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        room: { select: { id: true, name: true, livekitRoom: true } },
      },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Failed to get device' });
  }
});

// Update device (name or room assignment)
devicesRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const updates = updateDeviceSchema.parse(req.body);

    // If assigning to a room, verify the room belongs to user
    if (updates.roomId) {
      const room = await prisma.room.findFirst({
        where: { id: updates.roomId, userId: req.userId },
      });
      if (!room) {
        return res.status(400).json({ error: 'Invalid room' });
      }
    }

    const device = await prisma.device.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      data: updates,
    });

    if (device.count === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const updated = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: { room: { select: { id: true, name: true } } },
    });

    res.json({ device: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
devicesRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const result = await prisma.device.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Update device online status (called by camera)
devicesRouter.post('/:id/heartbeat', async (req: AuthRequest, res) => {
  try {
    await prisma.device.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      data: {
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update heartbeat' });
  }
});
