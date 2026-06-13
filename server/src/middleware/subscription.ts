import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import type { ClerkRequest } from './clerk.js';

/**
 * When Stripe is not configured (local development), billing checks are
 * disabled so the app remains fully usable without payment credentials.
 */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isSubscriptionActive(status: string | null | undefined): boolean {
  if (!isBillingEnabled()) return true;
  return status === 'active' || status === 'trialing';
}

/**
 * Requires an active or trialing subscription. Must run after clerkAuth()
 * so req.userId is populated.
 */
export function requireActiveSubscription() {
  return async (req: ClerkRequest, res: Response, next: NextFunction) => {
    try {
      if (!isBillingEnabled()) return next();

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { subscriptionStatus: true },
      });

      if (!user || !isSubscriptionActive(user.subscriptionStatus)) {
        return res.status(403).json({ error: 'Active subscription required' });
      }

      next();
    } catch (error) {
      console.error('[Subscription] Check failed:', error);
      res.status(500).json({ error: 'Subscription check failed' });
    }
  };
}
