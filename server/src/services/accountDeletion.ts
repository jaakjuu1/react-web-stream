import { prisma } from '../lib/prisma.js';
import { deleteClip } from './storage.service.js';
import { stripe } from './stripe.service.js';

/**
 * Deletes everything we hold for a user, honoring the privacy policy:
 * Stripe subscription is canceled (so billing stops), stored clip files are
 * removed, and the user row cascade-deletes rooms, devices, events, clips,
 * and push subscriptions.
 */
export async function deleteUserAccount(clerkId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      subscriptionId: true,
      clips: { select: { storagePath: true } },
    },
  });

  if (!user) return false;

  // Stop billing first — a failed cleanup later must not keep charging them
  if (stripe && user.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(user.subscriptionId);
      console.log('[AccountDeletion] Canceled subscription:', user.subscriptionId);
    } catch (error) {
      // Already-canceled subscriptions throw; that's fine
      console.error('[AccountDeletion] Subscription cancel failed:', error);
    }
  }

  // Best-effort storage cleanup; DB rows go regardless
  for (const clip of user.clips) {
    try {
      await deleteClip(clip.storagePath);
    } catch (error) {
      console.error('[AccountDeletion] Clip file delete failed:', clip.storagePath, error);
    }
  }

  await prisma.user.delete({ where: { id: user.id } });
  console.log('[AccountDeletion] Deleted user for Clerk ID:', clerkId);
  return true;
}
