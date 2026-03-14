import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { clerkAuth, type ClerkRequest } from '../middleware/clerk.js';
import {
  uploadClip,
  deleteClip,
  getPresignedUrl,
  getClipStream,
  getClipStats,
  isR2,
} from '../services/storage.service.js';

export const clipsRouter = Router();

const ALLOWED_MIME_TYPES = ['video/webm', 'video/mp4', 'video/ogg'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are accepted.'));
    }
  },
});

// All routes require authentication
clipsRouter.use(clerkAuth());

const uploadClipSchema = z.object({
  roomId: z.string(),
  deviceId: z.string(),
  detectionType: z.enum(['motion', 'sound']),
  confidence: z.string().transform((v) => parseFloat(v)),
  duration: z.string().optional().transform((v) => (v ? parseInt(v) : null)),
  recordedAt: z.string(),
});

// POST /api/clips - Upload a new clip
clipsRouter.post('/', upload.single('video'), async (req: ClerkRequest, res) => {
  try {
    const userId = req.userId!;
    const parsed = uploadClipSchema.parse(req.body);
    const { roomId, deviceId, detectionType, confidence, duration, recordedAt } = parsed;

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    // Verify room ownership
    const room = await prisma.room.findFirst({
      where: { id: roomId, userId },
    });

    if (!room) {
      return res.status(403).json({ error: 'Room not found or unauthorized' });
    }

    // Upload file to storage
    const stored = await uploadClip(
      userId,
      roomId,
      req.file.buffer,
      req.file.mimetype
    );

    // Create database record
    const clip = await prisma.clip.create({
      data: {
        filename: req.file.originalname || `clip-${Date.now()}.webm`,
        storagePath: stored.path,
        storageType: isR2() ? 'r2' : 'local',
        mimeType: req.file.mimetype,
        fileSize: stored.size,
        duration,
        detectionType,
        confidence,
        userId,
        roomId,
        deviceId,
        recordedAt: new Date(recordedAt),
      },
    });

    res.status(201).json({ clip });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('[Clips] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload clip' });
  }
});

const listClipsSchema = z.object({
  roomId: z.string().optional(),
  deviceId: z.string().optional(),
  type: z.enum(['motion', 'sound']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// GET /api/clips - List clips for user's rooms
clipsRouter.get('/', async (req: ClerkRequest, res) => {
  try {
    const userId = req.userId!;
    const parsed = listClipsSchema.parse(req.query);

    const where: {
      userId: string;
      roomId?: string;
      deviceId?: string;
      detectionType?: string;
    } = { userId };

    if (parsed.roomId) where.roomId = parsed.roomId;
    if (parsed.deviceId) where.deviceId = parsed.deviceId;
    if (parsed.type) where.detectionType = parsed.type;

    const [clips, total] = await Promise.all([
      prisma.clip.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: parsed.limit,
        skip: parsed.offset,
        include: {
          room: { select: { id: true, name: true } },
        },
      }),
      prisma.clip.count({ where }),
    ]);

    res.json({
      clips,
      total,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('[Clips] List error:', error);
    res.status(500).json({ error: 'Failed to fetch clips' });
  }
});

// GET /api/clips/:id - Get single clip metadata
clipsRouter.get('/:id', async (req: ClerkRequest, res) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        room: { select: { id: true, name: true } },
      },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    res.json({ clip });
  } catch (error) {
    console.error('[Clips] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch clip' });
  }
});

// GET /api/clips/:id/url - Get playback URL (presigned R2 URL or local streaming URL)
clipsRouter.get('/:id/url', async (req: ClerkRequest, res) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (isR2()) {
      const url = await getPresignedUrl(clip.storagePath, 3600);
      return res.json({ url, expiresIn: 3600 });
    }

    // Local storage: return the streaming URL
    res.json({ url: `/api/clips/file/${clip.storagePath}`, expiresIn: null });
  } catch (error) {
    console.error('[Clips] URL error:', error);
    res.status(500).json({ error: 'Failed to generate clip URL' });
  }
});

// GET /api/clips/file/:path - Stream clip video file (local storage only)
clipsRouter.get('/file/{*path}', async (req: ClerkRequest, res) => {
  try {
    if (isR2()) {
      return res.status(400).json({ error: 'Use /api/clips/:id/url for R2 storage' });
    }

    const storagePath = req.params.path;

    // Verify user owns this clip
    const clip = await prisma.clip.findFirst({
      where: { storagePath, userId: req.userId! },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    // Only serve video MIME types to prevent stored XSS
    if (!ALLOWED_MIME_TYPES.includes(clip.mimeType)) {
      return res.status(403).json({ error: 'Invalid clip type' });
    }

    const stats = await getClipStats(storagePath);
    const stream = getClipStream(storagePath);

    res.setHeader('Content-Type', clip.mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    stream.pipe(res);
  } catch (error) {
    console.error('[Clips] Stream error:', error);
    res.status(500).json({ error: 'Failed to stream clip' });
  }
});

// DELETE /api/clips/:id - Delete a clip
clipsRouter.delete('/:id', async (req: ClerkRequest, res) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    // Delete from storage
    await deleteClip(clip.storagePath);

    // Delete from database
    await prisma.clip.delete({ where: { id: clip.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('[Clips] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete clip' });
  }
});
