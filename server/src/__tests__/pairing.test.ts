import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { createTestUser, createTestRoom, createTestPairingCode } from './helpers.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('POST /api/pairing/generate', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/pairing/generate')
      .send({ roomId: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('returns a code, QR, and pair URL for an owned room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);

    const res = await request(app)
      .post('/api/pairing/generate')
      .set('x-test-clerk-id', user.clerkId)
      .send({ roomId: room.id });

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[A-F0-9]{8}$/);
    expect(res.body.pairUrl).toBe(`https://app.test/camera?code=${res.body.code}`);
    expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects another user's room", async () => {
    const owner = await createTestUser();
    const room = await createTestRoom(owner.id);
    const stranger = await createTestUser();

    const res = await request(app)
      .post('/api/pairing/generate')
      .set('x-test-clerk-id', stranger.clerkId)
      .send({ roomId: room.id });

    expect(res.status).toBe(404);
  });

  it('rejects users without an active subscription when billing is enabled', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    try {
      const user = await createTestUser({ subscriptionStatus: null });
      const room = await createTestRoom(user.id);

      const res = await request(app)
        .post('/api/pairing/generate')
        .set('x-test-clerk-id', user.clerkId)
        .send({ roomId: room.id });

      expect(res.status).toBe(403);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });
});

describe('POST /api/pairing/complete', () => {
  it('rejects an unknown code', async () => {
    const res = await request(app)
      .post('/api/pairing/complete')
      .send({ code: 'NOPE0000' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired code', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const code = await createTestPairingCode(room.id, user.id, { expired: true });

    const res = await request(app)
      .post('/api/pairing/complete')
      .send({ code: code.code });
    expect(res.status).toBe(400);
  });

  it('creates a device with credentials and a LiveKit token', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const code = await createTestPairingCode(room.id, user.id);

    const res = await request(app)
      .post('/api/pairing/complete')
      .send({ code: code.code, deviceName: 'Kitchen phone' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.deviceSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.roomId).toBe(room.id);
    expect(res.body.deviceName).toBe('Kitchen phone');

    const device = await prisma.device.findUnique({
      where: { id: res.body.deviceId },
    });
    expect(device?.roomId).toBe(room.id);
    expect(device?.userId).toBe(user.id);
    // Secret is stored hashed, never in the clear
    expect(device?.secretHash).toBeTruthy();
    expect(device?.secretHash).not.toBe(res.body.deviceSecret);
  });

  it('is case-insensitive and single-use', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const code = await createTestPairingCode(room.id, user.id);

    const first = await request(app)
      .post('/api/pairing/complete')
      .send({ code: code.code.toLowerCase() });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/pairing/complete')
      .send({ code: code.code });
    expect(second.status).toBe(400);
  });
});

describe('GET /api/pairing/status/:code', () => {
  it('reports used state to the code owner', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const code = await createTestPairingCode(room.id, user.id, { used: true });

    const res = await request(app)
      .get(`/api/pairing/status/${code.code}`)
      .set('x-test-clerk-id', user.clerkId);

    expect(res.status).toBe(200);
    expect(res.body.used).toBe(true);
    expect(res.body.expired).toBe(false);
  });
});
