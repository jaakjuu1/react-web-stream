import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import type { Express } from 'express';
import { prisma } from '../lib/prisma.js';
import { createTestUser } from './helpers.js';

const WEBHOOK_SECRET = 'whsec_test_secret';

let app: Express;

// Stripe must be configured before the service module is evaluated, so the
// app is imported dynamically (each test file has an isolated module graph)
beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const { createApp } = await import('../app.js');
  app = createApp();
});

/** Sign a payload the way Stripe does: t=<ts>,v1=HMAC-SHA256(ts.payload) */
function stripeSignature(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function subscriptionEventPayload(
  userId: string,
  overrides: { status?: string; cancelAtPeriodEnd?: boolean } = {}
): string {
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  return JSON.stringify({
    id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    object: 'event',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_${crypto.randomBytes(8).toString('hex')}`,
        object: 'subscription',
        status: overrides.status ?? 'active',
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        metadata: { userId },
        items: {
          data: [
            {
              current_period_end: periodEnd,
              price: { id: 'price_test_123' },
            },
          ],
        },
      },
    },
  });
}

describe('POST /api/stripe/webhook', () => {
  it('rejects requests without a signature', async () => {
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
  });

  it('rejects a forged signature', async () => {
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=123,v1=deadbeef')
      .send('{}');
    expect(res.status).toBe(400);
  });

  it('updates the subscription state from a signed subscription event', async () => {
    const user = await createTestUser({ subscriptionStatus: null });
    const payload = subscriptionEventPayload(user.id, { status: 'trialing' });

    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', stripeSignature(payload))
      .send(payload);

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionStatus).toBe('trialing');
    expect(updated?.subscriptionPlanId).toBe('price_test_123');
    expect(updated?.subscriptionId).toMatch(/^sub_/);
    expect(updated?.currentPeriodEnd?.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('subscription lifecycle handlers', () => {
  it('clears subscription state when the subscription is deleted', async () => {
    const { handleCustomerSubscriptionDeleted } = await import(
      '../services/stripe.service.js'
    );

    const user = await prisma.user.create({
      data: {
        clerkId: `clerk_del_${crypto.randomBytes(4).toString('hex')}`,
        subscriptionStatus: 'active',
        subscriptionId: `sub_${crypto.randomBytes(8).toString('hex')}`,
        currentPeriodEnd: new Date(Date.now() + 1000000),
      },
    });

    await handleCustomerSubscriptionDeleted({
      metadata: { userId: user.id },
    } as never);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.subscriptionStatus).toBe('canceled');
    expect(updated?.subscriptionId).toBeNull();
    expect(updated?.currentPeriodEnd).toBeNull();
  });
});
