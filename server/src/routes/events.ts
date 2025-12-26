import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { sendDetectionNotification, isConfigured } from '../services/pushNotifications.js';

export const eventsRouter = Router();

// All routes require authentication
eventsRouter.use(authMiddleware);

const createEventSchema = z.object({
  roomId: z.string(),
  type: z.enum(['motion', 'sound']),
  deviceId: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  thumbnailPath: z.string().optional(),
  sendNotification: z.boolean().optional().default(true),
});

const listEventsSchema = z.object({
  roomId: z.string().optional(),
  type: z.enum(['motion', 'sound']).optional(),
  deviceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const updateEventSchema = z.object({
  markedFalsePositive: z.boolean().optional(),
  notificationSent: z.boolean().optional(),
});

// List events with filtering
eventsRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const params = listEventsSchema.parse(req.query);

    // Build where clause
    const where: Record<string, unknown> = {
      room: { userId: req.userId },
    };

    if (params.roomId) {
      where.roomId = params.roomId;
    }

    if (params.type) {
      where.type = params.type;
    }

    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }

    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) {
        (where.timestamp as Record<string, Date>).gte = new Date(params.startDate);
      }
      if (params.endDate) {
        (where.timestamp as Record<string, Date>).lte = new Date(params.endDate);
      }
    }

    const [events, total] = await Promise.all([
      prisma.detectionEvent.findMany({
        where,
        include: {
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      prisma.detectionEvent.count({ where }),
    ]);

    res.json({
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        deviceId: event.deviceId,
        confidence: event.confidence,
        thumbnailPath: event.thumbnailPath,
        notificationSent: event.notificationSent,
        markedFalsePositive: event.markedFalsePositive,
        room: event.room,
      })),
      pagination: {
        total,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + events.length < total,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('List events error:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

// Get single event
eventsRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const event = await prisma.detectionEvent.findFirst({
      where: {
        id: req.params.id,
        room: { userId: req.userId },
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({
      event: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        deviceId: event.deviceId,
        confidence: event.confidence,
        thumbnailPath: event.thumbnailPath,
        notificationSent: event.notificationSent,
        markedFalsePositive: event.markedFalsePositive,
        room: event.room,
      },
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

// Create event
eventsRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createEventSchema.parse(req.body);

    // Verify user owns the room
    const room = await prisma.room.findFirst({
      where: {
        id: data.roomId,
        userId: req.userId,
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const event = await prisma.detectionEvent.create({
      data: {
        type: data.type,
        deviceId: data.deviceId,
        confidence: data.confidence,
        thumbnailPath: data.thumbnailPath,
        roomId: data.roomId,
      },
    });

    // Send push notification if enabled and configured
    let notificationSent = false;
    if (data.sendNotification && isConfigured()) {
      try {
        const result = await sendDetectionNotification(req.userId!, {
          type: data.type,
          deviceId: data.deviceId,
          roomName: room.name,
          confidence: data.confidence,
        });
        notificationSent = result.sent > 0;

        // Update event with notification status
        if (notificationSent) {
          await prisma.detectionEvent.update({
            where: { id: event.id },
            data: { notificationSent: true },
          });
        }
      } catch (notifError) {
        console.error('[Events] Failed to send notification:', notifError);
      }
    }

    res.status(201).json({
      event: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        deviceId: event.deviceId,
        confidence: event.confidence,
        thumbnailPath: event.thumbnailPath,
        notificationSent: event.notificationSent,
        markedFalsePositive: event.markedFalsePositive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (mark as false positive, etc.)
eventsRouter.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateEventSchema.parse(req.body);

    // Verify user owns the event's room
    const existing = await prisma.detectionEvent.findFirst({
      where: {
        id: req.params.id,
        room: { userId: req.userId },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = await prisma.detectionEvent.update({
      where: { id: req.params.id },
      data,
    });

    res.json({
      event: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        deviceId: event.deviceId,
        confidence: event.confidence,
        thumbnailPath: event.thumbnailPath,
        notificationSent: event.notificationSent,
        markedFalsePositive: event.markedFalsePositive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
eventsRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    // Verify user owns the event's room
    const existing = await prisma.detectionEvent.findFirst({
      where: {
        id: req.params.id,
        room: { userId: req.userId },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await prisma.detectionEvent.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Get event statistics for a room
eventsRouter.get('/stats/:roomId', async (req: AuthRequest, res) => {
  try {
    // Verify user owns the room
    const room = await prisma.room.findFirst({
      where: {
        id: req.params.roomId,
        userId: req.userId,
      },
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, last24hCount, last7dCount, byType, byDevice] = await Promise.all([
      prisma.detectionEvent.count({
        where: { roomId: req.params.roomId },
      }),
      prisma.detectionEvent.count({
        where: {
          roomId: req.params.roomId,
          timestamp: { gte: last24h },
        },
      }),
      prisma.detectionEvent.count({
        where: {
          roomId: req.params.roomId,
          timestamp: { gte: last7d },
        },
      }),
      prisma.detectionEvent.groupBy({
        by: ['type'],
        where: { roomId: req.params.roomId },
        _count: true,
      }),
      prisma.detectionEvent.groupBy({
        by: ['deviceId'],
        where: { roomId: req.params.roomId },
        _count: true,
      }),
    ]);

    res.json({
      stats: {
        total,
        last24h: last24hCount,
        last7d: last7dCount,
        byType: byType.reduce((acc, item) => {
          acc[item.type] = item._count;
          return acc;
        }, {} as Record<string, number>),
        byDevice: byDevice.reduce((acc, item) => {
          acc[item.deviceId] = item._count;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    console.error('Get event stats error:', error);
    res.status(500).json({ error: 'Failed to get event stats' });
  }
});
