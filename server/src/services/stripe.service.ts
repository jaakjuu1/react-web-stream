import Stripe from 'stripe';
import { clerkClient } from '@clerk/express';
import { prisma } from '../lib/prisma.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set - Stripe features disabled');
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

export async function createOrRetrieveCustomer(
  userId: string,
  clerkId: string
): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Get email from Clerk
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error('No email found for user');
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  console.log('[Stripe] Created customer:', customer.id, 'for user:', userId);
  return customer.id;
}

export async function createCheckoutSession(
  userId: string,
  clerkId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error('Stripe not configured');

  const customerId = await createOrRetrieveCustomer(userId, clerkId);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    allow_promotion_codes: true,
  });
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  if (!stripe) throw new Error('Stripe not configured');

  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function handleSubscriptionEvent(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.error('[Stripe] No userId in subscription metadata:', subscription.id);
    return;
  }

  const firstItem = subscription.items.data[0];
  const periodEnd = firstItem?.current_period_end;

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionPlanId: firstItem?.price.id || null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  console.log(
    '[Stripe] Updated subscription for user:',
    userId,
    'status:',
    subscription.status
  );
}

export async function handleCustomerSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.error('[Stripe] No userId in deleted subscription metadata');
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: null,
      subscriptionStatus: 'canceled',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });

  console.log('[Stripe] Subscription deleted for user:', userId);
}
