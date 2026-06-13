import { vi } from 'vitest';

/**
 * Clerk is mocked at the module boundary: a request is "signed in" when it
 * carries an `x-test-clerk-id` header, and that value becomes the clerkId.
 * Everything else (user mapping, ownership checks, subscription gating)
 * runs the real code path against the test database.
 */
vi.mock('@clerk/express', () => {
  return {
    clerkMiddleware:
      () =>
      (_req: unknown, _res: unknown, next: () => void) =>
        next(),
    requireAuth:
      () =>
      (
        req: { headers: Record<string, string | undefined> },
        res: { status: (code: number) => { json: (body: unknown) => void } },
        next: () => void
      ) => {
        if (req.headers['x-test-clerk-id']) return next();
        res.status(401).json({ error: 'Not authenticated' });
      },
    getAuth: (req: { headers: Record<string, string | undefined> }) => ({
      userId: req.headers['x-test-clerk-id'] || null,
    }),
    clerkClient: {
      users: {
        getUser: async (clerkId: string) => ({
          emailAddresses: [{ emailAddress: `${clerkId}@test.example` }],
        }),
      },
    },
  };
});
