import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { createTestUser, createTestRoom, createTestDevice } from './helpers.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('POST /api/tokens/device', () => {
  it('issues a fresh camera token for valid device credentials', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/tokens/device')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.roomId).toBe(room.id);
    expect(res.body.participantId).toBe(device.participantId);

    // Token requests double as heartbeats
    const refreshed = await prisma.device.findUnique({ where: { id: device.id } });
    expect(refreshed?.isOnline).toBe(true);
    expect(refreshed?.lastSeen).toBeTruthy();
  });

  it('rejects a wrong secret', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/tokens/device')
      .set('Authorization', `Device ${device.id}.${'0'.repeat(64)}`);

    expect(res.status).toBe(401);
  });

  it('rejects a deleted device (revocation)', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);
    await prisma.device.delete({ where: { id: device.id } });

    const res = await request(app)
      .post('/api/tokens/device')
      .set('Authorization', authHeader);

    expect(res.status).toBe(401);
  });

  it('rejects malformed device auth headers', async () => {
    for (const header of ['Device garbage', 'Device .secretonly', 'Device idonly.']) {
      const res = await request(app)
        .post('/api/tokens/device')
        .set('Authorization', header);
      expect(res.status).toBe(401);
    }
  });

  it("rejects devices whose owner's subscription lapsed when billing is enabled", async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    try {
      const user = await createTestUser({ subscriptionStatus: 'canceled' });
      const room = await createTestRoom(user.id);
      const { authHeader } = await createTestDevice(room.id, user.id);

      const res = await request(app)
        .post('/api/tokens/device')
        .set('Authorization', authHeader);

      expect(res.status).toBe(403);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });
});

describe('POST /api/events with device credentials', () => {
  it('persists an event for its own room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', authHeader)
      .send({ roomId: room.id, type: 'motion', deviceId: device.id, confidence: 0.9 });

    expect(res.status).toBe(201);
    expect(res.body.event.type).toBe('motion');

    const stored = await prisma.detectionEvent.findUnique({
      where: { id: res.body.event.id },
    });
    expect(stored?.roomId).toBe(room.id);
  });

  it("rejects events for another room — even the same owner's", async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const otherRoom = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', authHeader)
      .send({ roomId: otherRoom.id, type: 'motion', deviceId: device.id, confidence: 0.9 });

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated event posts', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({ roomId: 'x', type: 'motion', deviceId: 'y' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/clips with device credentials', () => {
  it('uploads a clip into its own room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/clips')
      .set('Authorization', authHeader)
      .attach('video', Buffer.from('fake-webm-bytes'), {
        filename: 'clip.webm',
        contentType: 'video/webm',
      })
      .field('roomId', room.id)
      .field('deviceId', device.id)
      .field('detectionType', 'motion')
      .field('confidence', '0.85')
      .field('recordedAt', new Date().toISOString());

    expect(res.status).toBe(201);
    expect(res.body.clip.roomId).toBe(room.id);
    expect(res.body.clip.userId).toBe(user.id);
  });

  it('rejects uploads to another room', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const otherRoom = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    const res = await request(app)
      .post('/api/clips')
      .set('Authorization', authHeader)
      .attach('video', Buffer.from('fake-webm-bytes'), {
        filename: 'clip.webm',
        contentType: 'video/webm',
      })
      .field('roomId', otherRoom.id)
      .field('deviceId', device.id)
      .field('detectionType', 'motion')
      .field('confidence', '0.85')
      .field('recordedAt', new Date().toISOString());

    expect(res.status).toBe(403);
  });
});
