import { Router } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

// Get current user (with Clerk auth)
authRouter.get('/me', requireAuth(), async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);

    if (!clerkId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        clerkId: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionPlanId: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { clerkId },
        select: {
          id: true,
          clerkId: true,
          createdAt: true,
          subscriptionStatus: true,
          subscriptionPlanId: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      });
      console.log('[Auth] Created new user for Clerk ID:', clerkId);
    }

    res.json({
      user: {
        id: user.id,
        clerkId: user.clerkId,
        createdAt: user.createdAt,
      },
      subscription: {
        status: user.subscriptionStatus || 'none',
        planId: user.subscriptionPlanId,
        currentPeriodEnd: user.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});
