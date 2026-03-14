import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { clerkAuth, type ClerkRequest } from '../middleware/clerk.js';
import { prisma } from '../lib/prisma.js';
import {
  stripe,
  createCheckoutSession,
  createPortalSession,
  handleSubscriptionEvent,
  handleCustomerSubscriptionDeleted,
} from '../services/stripe.service.js';

export const stripeRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Create checkout session
stripeRouter.post(
  '/create-checkout-session',
  clerkAuth(),
  async (req: ClerkRequest, res: Response) => {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }

      if (!PRICE_ID) {
        return res.status(500).json({ error: 'Stripe price not configured' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { subscriptionStatus: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already subscribed
      if (
        user.subscriptionStatus === 'active' ||
        user.subscriptionStatus === 'trialing'
      ) {
        return res.status(400).json({ error: 'Already subscribed' });
      }

      const session = await createCheckoutSession(
        req.userId!,
        req.clerkId!,
        PRICE_ID,
        `${FRONTEND_URL}/viewer?checkout=success`,
        `${FRONTEND_URL}/pricing?checkout=canceled`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error('[Stripe] Checkout session error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }
);

// Create customer portal session
stripeRouter.post(
  '/create-portal-session',
  clerkAuth(),
  async (req: ClerkRequest, res: Response) => {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { stripeCustomerId: true },
      });

      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: 'No billing account found' });
      }

      const session = await createPortalSession(
        user.stripeCustomerId,
        `${FRONTEND_URL}/pricing`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error('[Stripe] Portal session error:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }
);

// Get subscription status
stripeRouter.get(
  '/subscription',
  clerkAuth(),
  async (req: ClerkRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          subscriptionStatus: true,
          subscriptionPlanId: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        status: user.subscriptionStatus || 'none',
        planId: user.subscriptionPlanId,
        currentPeriodEnd: user.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      });
    } catch (error) {
      console.error('[Stripe] Subscription status error:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  }
);

// Webhook handler (no auth - uses Stripe signature verification)
stripeRouter.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'] as string;

  if (!sig || !WEBHOOK_SECRET) {
    console.error('[Stripe] Missing signature or webhook secret');
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event: Stripe.Event;

  try {
    // req.body should be raw buffer for webhook verification
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  console.log('[Stripe] Webhook received:', event.type);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleCustomerSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'checkout.session.completed':
        console.log('[Stripe] Checkout completed:', (event.data.object as Stripe.Checkout.Session).id);
        break;

      case 'invoice.payment_succeeded':
        console.log('[Stripe] Payment succeeded:', (event.data.object as Stripe.Invoice).id);
        break;

      case 'invoice.payment_failed':
        console.log('[Stripe] Payment failed:', (event.data.object as Stripe.Invoice).id);
        // Could send notification to user here
        break;

      default:
        console.log('[Stripe] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe] Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});
