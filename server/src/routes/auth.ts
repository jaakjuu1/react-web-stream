import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '../lib/prisma.js';
import { deleteUserAccount } from '../services/accountDeletion.js';

export const authRouter = Router();

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Svix-signed webhook (Clerk uses Svix). Signed content is
 * `{svix-id}.{svix-timestamp}.{rawBody}`, HMAC-SHA256 with the base64 key
 * from the `whsec_...` secret, compared against each `v1,<sig>` entry.
 */
function verifySvixSignature(req: Request, secret: string): boolean {
  const id = req.headers['svix-id'];
  const timestamp = req.headers['svix-timestamp'];
  const signatureHeader = req.headers['svix-signature'];
  if (
    typeof id !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof signatureHeader !== 'string' ||
    !Buffer.isBuffer(req.body)
  ) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${req.body.toString('utf8')}`)
    .digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const provided = Buffer.from(signature, 'base64');
    return (
      provided.length === expected.length &&
      crypto.timingSafeEqual(provided, expected)
    );
  });
}

// Clerk webhook (no auth — Svix signature verification instead).
// Handles account deletion so user data dies with the Clerk account.
authRouter.post('/clerk-webhook', async (req: Request, res: Response) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Auth] CLERK_WEBHOOK_SECRET not set - webhook rejected');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  if (!verifySvixSignature(req, secret)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event: { type?: string; data?: { id?: string } };
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    if (event.type === 'user.deleted' && event.data?.id) {
      const deleted = await deleteUserAccount(event.data.id);
      console.log(
        '[Auth] user.deleted webhook for',
        event.data.id,
        deleted ? '- account purged' : '- no matching user'
      );
    }
    res.json({ received: true });
  } catch (error) {
    console.error('[Auth] Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

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
