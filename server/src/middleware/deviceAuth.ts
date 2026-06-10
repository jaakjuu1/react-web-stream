import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { clerkAuth, type ClerkRequest } from './clerk.js';
import { isSubscriptionActive } from './subscription.js';

/**
 * Device credential auth for paired cameras.
 *
 * At pairing time a camera receives a long-lived secret (returned once,
 * stored hashed). The camera authenticates subsequent requests with
 * `Authorization: Device <deviceId>.<secret>`. Deleting the device from
 * the viewer revokes access immediately.
 */

export interface AuthedDevice {
  id: string;
  participantId: string;
  name: string;
  roomId: string;
  livekitRoom: string;
  userId: string;
}

export interface DeviceRequest extends ClerkRequest {
  device?: AuthedDevice;
}

export function generateDeviceSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeviceSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function secretsMatch(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashDeviceSecret(secret), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseDeviceAuthHeader(
  header: string | undefined
): { deviceId: string; secret: string } | null {
  if (!header?.startsWith('Device ')) return null;
  const credentials = header.slice('Device '.length).trim();
  const separator = credentials.indexOf('.');
  if (separator <= 0 || separator === credentials.length - 1) return null;
  return {
    deviceId: credentials.slice(0, separator),
    secret: credentials.slice(separator + 1),
  };
}

export function deviceAuth(): RequestHandler {
  return async (req: DeviceRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = parseDeviceAuthHeader(req.headers.authorization);
      if (!parsed) {
        return res.status(401).json({ error: 'Device credentials required' });
      }

      const device = await prisma.device.findUnique({
        where: { id: parsed.deviceId },
        include: {
          room: { select: { id: true, name: true, livekitRoom: true } },
          user: { select: { id: true, subscriptionStatus: true } },
        },
      });

      if (!device?.secretHash || !secretsMatch(parsed.secret, device.secretHash)) {
        return res.status(401).json({ error: 'Invalid device credentials' });
      }

      if (!isSubscriptionActive(device.user.subscriptionStatus)) {
        return res.status(403).json({ error: 'Active subscription required' });
      }

      if (!device.room) {
        return res.status(403).json({ error: 'Device is not assigned to a room' });
      }

      req.device = {
        id: device.id,
        participantId: device.participantId,
        name: device.name,
        roomId: device.room.id,
        livekitRoom: device.room.livekitRoom,
        userId: device.user.id,
      };
      req.userId = device.user.id;

      next();
    } catch (error) {
      console.error('[DeviceAuth] Error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  };
}

function runChain(
  handlers: RequestHandler[],
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let index = 0;
  const step = (err?: unknown): void => {
    if (err) return next(err);
    const handler = handlers[index++];
    if (!handler) return next();
    handler(req, res, step);
  };
  step();
}

/**
 * Accepts either a paired-device credential or a Clerk session.
 * Routes behind this can rely on req.userId; device requests additionally
 * get req.device for room/device scoping.
 */
export function clerkOrDeviceAuth(): RequestHandler {
  const clerkChain = clerkAuth() as RequestHandler[];
  const deviceHandler = deviceAuth();

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization?.startsWith('Device ')) {
      return deviceHandler(req, res, next);
    }
    runChain(clerkChain, req, res, next);
  };
}
