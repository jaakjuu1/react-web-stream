import { Request, Response, NextFunction } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '../lib/prisma.js';

export interface ClerkRequest extends Request {
  userId?: string;
  clerkId?: string;
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
