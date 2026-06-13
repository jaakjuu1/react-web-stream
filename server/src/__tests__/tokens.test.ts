import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createTestUser, createTestRoom } from './helpers.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

afterEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.ENABLE_DEMO_TOKENS;
});

describe('demo token endpoints', () => {
  it('work outside production', async () => {
    const res = await request(app).post('/api/tokens/demo/camera');
    expect(res.status).toBe(200);
    expect(res.body.roomName).toBe('demo-room');
  });

  it('are blocked in production', async () => {
    process.env.NODE_ENV = 'production';
    for (const path of ['/api/tokens/demo/camera', '/api/tokens/demo/viewer']) {
      const res = await request(app).post(path);
      expect(res.status).toBe(404);
    }
  });

  it('can be explicitly re-enabled in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_TOKENS = 'true';
    const res = await request(app).post('/api/tokens/demo/viewer');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/tokens/viewer', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/tokens/viewer')
      .send({ roomId: 'x' });
    expect(res.status).toBe(401);
  });

  it('issues a token for an owned room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);

    const res = await request(app)
      .post('/api/tokens/viewer')
      .set('x-test-clerk-id', user.clerkId)
      .send({ roomId: room.id });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.roomName).toBe(room.livekitRoom);
    expect(res.body.participantId).toMatch(/^viewer_/);
  });

  it("rejects another user's room", async () => {
    const owner = await createTestUser();
    const room = await createTestRoom(owner.id);
    const stranger = await createTestUser();

    const res = await request(app)
      .post('/api/tokens/viewer')
      .set('x-test-clerk-id', stranger.clerkId)
      .send({ roomId: room.id });

    expect(res.status).toBe(404);
  });

  it('rejects users without an active subscription when billing is enabled', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    try {
      const user = await createTestUser({ subscriptionStatus: 'past_due' });
      const room = await createTestRoom(user.id);

      const res = await request(app)
        .post('/api/tokens/viewer')
        .set('x-test-clerk-id', user.clerkId)
        .send({ roomId: room.id });

      expect(res.status).toBe(403);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it('allows trialing users', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    try {
      const user = await createTestUser({ subscriptionStatus: 'trialing' });
      const room = await createTestRoom(user.id);

      const res = await request(app)
        .post('/api/tokens/viewer')
        .set('x-test-clerk-id', user.clerkId)
        .send({ roomId: room.id });

      expect(res.status).toBe(200);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });
});

describe('POST /api/tokens/camera', () => {
  it('creates a device record bound to the room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);

    const res = await request(app)
      .post('/api/tokens/camera')
      .set('x-test-clerk-id', user.clerkId)
      .send({ roomId: room.id, deviceName: 'Test cam' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.deviceId).toBeTruthy();
    expect(res.body.participantId).toMatch(/^cam_/);
  });
});
