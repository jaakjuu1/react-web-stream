import webpush from 'web-push';
import { prisma } from '../lib/prisma.js';

// VAPID keys - in production these should be environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@petportal.local';

// Only configure if keys are available
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[PushNotifications] VAPID keys not configured, skipping notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    console.log('[PushNotifications] No subscriptions found for user:', userId);
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload)
        );
        return { success: true, id: sub.id };
      } catch (error) {
        const err = error as { statusCode?: number };
        // Remove invalid subscriptions (gone or expired)
        if (err.statusCode === 404 || err.statusCode === 410) {
          console.log('[PushNotifications] Removing invalid subscription:', sub.id);
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
        throw error;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[PushNotifications] Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

export async function sendDetectionNotification(
  userId: string,
  event: {
    type: 'motion' | 'sound';
    deviceId: string;
    roomName?: string;
    confidence?: number;
  }
): Promise<{ sent: number; failed: number }> {
  const typeLabel = event.type === 'motion' ? 'Motion' : 'Sound';
  const roomLabel = event.roomName ? ` in ${event.roomName}` : '';
  const confidenceLabel = event.confidence
    ? ` (${Math.round(event.confidence * 100)}% confidence)`
    : '';

  const payload: PushNotificationPayload = {
    title: `${typeLabel} Detected${roomLabel}`,
    body: `Your pet cam detected ${event.type}${confidenceLabel}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: `detection-${event.type}-${event.deviceId}`,
    data: {
      type: 'detection',
      eventType: event.type,
      deviceId: event.deviceId,
      timestamp: new Date().toISOString(),
    },
  };

  return sendPushNotification(userId, payload);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
