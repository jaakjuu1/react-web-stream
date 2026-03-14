import { Request, Response, NextFunction } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '../lib/prisma.js';

export interface ClerkRequest extends Request {
  userId?: string;
  clerkId?: string;
}

// In-memory cache: clerkId -> internal userId (mapping never changes once created)
const userIdCache = new Map<string, { userId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 1000;

function getCachedUserId(clerkId: string): string | null {
  const entry = userIdCache.get(clerkId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userIdCache.delete(clerkId);
    return null;
  }
  return entry.userId;
}

function setCachedUserId(clerkId: string, userId: string): void {
  // Evict oldest entry if at capacity
  if (userIdCache.size >= CACHE_MAX_SIZE) {
    const firstKey = userIdCache.keys().next().value!;
    userIdCache.delete(firstKey);
  }
  userIdCache.set(clerkId, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Middleware that requires Clerk authentication and maps clerkId to internal userId.
 * This allows routes to continue using req.userId for database queries.
 */
export function clerkAuth() {
  return [
    requireAuth(),
    async (req: ClerkRequest, res: Response, next: NextFunction) => {
      try {
        const { userId: clerkId } = getAuth(req);

        if (!clerkId) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        req.clerkId = clerkId;

        // Check cache first
        const cached = getCachedUserId(clerkId);
        if (cached) {
          req.userId = cached;
          return next();
        }

        // Find or create user in database
        let user = await prisma.user.findUnique({
          where: { clerkId },
          select: { id: true },
        });

        if (!user) {
          user = await prisma.user.create({
            data: { clerkId },
            select: { id: true },
          });
          console.log('[Clerk] Created new user for Clerk ID:', clerkId);
        }

        setCachedUserId(clerkId, user.id);
        req.userId = user.id;
        next();
      } catch (error) {
        console.error('[Clerk] Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication error' });
      }
    },
  ];
}

export { requireAuth, getAuth };
