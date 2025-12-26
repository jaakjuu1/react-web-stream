import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  isConfigured,
  sendPushNotification,
} from '../services/pushNotifications.js';

export const pushRouter = Router();

// Get VAPID public key (no auth required for initial setup)
pushRouter.get('/vapid-public-key', (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Push notifications not configured',
      configured: false,
    });
  }

  res.json({
    publicKey: getVapidPublicKey(),
    configured: true,
  });
});

// All other routes require authentication
pushRouter.use(authMiddleware);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// Subscribe to push notifications
pushRouter.post('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint, keys } = subscribeSchema.parse(req.body);

    // Upsert subscription (update if endpoint exists, create if not)
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: req.userId!,
      },
      create: {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId: req.userId!,
      },
    });

    res.status(201).json({
      success: true,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
pushRouter.delete('/subscribe', async (req: AuthRequest, res) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);

    const result = await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: req.userId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Get user's subscriptions
pushRouter.get('/subscriptions', async (req: AuthRequest, res) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
      },
    });

    res.json({ subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

// Test push notification (for debugging)
pushRouter.post('/test', async (req: AuthRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        error: 'Push notifications not configured',
      });
    }

    const result = await sendPushNotification(req.userId!, {
      title: 'Test Notification',
      body: 'Push notifications are working!',
      icon: '/pwa-192x192.png',
      tag: 'test',
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Test push error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});
