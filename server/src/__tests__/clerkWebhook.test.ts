import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { createTestUser, createTestRoom, createTestDevice } from './helpers.js';

const WEBHOOK_KEY = crypto.randomBytes(24);
const WEBHOOK_SECRET = `whsec_${WEBHOOK_KEY.toString('base64')}`;

let app: Express;

beforeAll(() => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  app = createApp();
});

function svixHeaders(payload: string, overrides: { timestamp?: number } = {}) {
  const id = `msg_${crypto.randomBytes(8).toString('hex')}`;
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_KEY)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
}

function userDeletedPayload(clerkId: string): string {
  return JSON.stringify({
    type: 'user.deleted',
    data: { id: clerkId, deleted: true },
  });
}

describe('POST /api/auth/clerk-webhook', () => {
  it('rejects requests without a signature', async () => {
    const res = await request(app)
      .post('/api/auth/clerk-webhook')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
  });

  it('rejects a forged signature', async () => {
    const payload = userDeletedPayload('clerk_whatever');
    const res = await request(app)
      .post('/api/auth/clerk-webhook')
      .set('Content-Type', 'application/json')
      .set({
        'svix-id': 'msg_x',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': `v1,${Buffer.from('forged-signature-bytes-padding!!').toString('base64')}`,
      })
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('rejects stale timestamps (replay protection)', async () => {
    const payload = userDeletedPayload('clerk_whatever');
    const headers = svixHeaders(payload, {
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    const res = await request(app)
      .post('/api/auth/clerk-webhook')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('purges the user and all cascaded data on user.deleted', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const { device, authHeader } = await createTestDevice(room.id, user.id);

    // Build up real data through the API: an event and an uploaded clip
    await request(app)
      .post('/api/events')
      .set('Authorization', authHeader)
      .send({ roomId: room.id, type: 'motion', deviceId: device.id, confidence: 0.9 })
      .expect(201);
    await request(app)
      .post('/api/clips')
      .set('Authorization', authHeader)
      .attach('video', Buffer.from('fake-webm-bytes'), {
        filename: 'clip.webm',
        contentType: 'video/webm',
      })
      .field('roomId', room.id)
      .field('deviceId', device.id)
      .field('detectionType', 'motion')
      .field('confidence', '0.9')
      .field('recordedAt', new Date().toISOString())
      .expect(201);

    const payload = userDeletedPayload(user.clerkId);
    const res = await request(app)
      .post('/api/auth/clerk-webhook')
      .set('Content-Type', 'application/json')
      .set(svixHeaders(payload))
      .send(payload);

    expect(res.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect(await prisma.device.findUnique({ where: { id: device.id } })).toBeNull();
    expect(await prisma.detectionEvent.count({ where: { roomId: room.id } })).toBe(0);
    expect(await prisma.clip.count({ where: { userId: user.id } })).toBe(0);

    // Revocation: the paired camera's credentials die with the account
    const tokenRes = await request(app)
      .post('/api/tokens/device')
      .set('Authorization', authHeader);
    expect(tokenRes.status).toBe(401);
  });

  it('acknowledges unknown users and unrelated event types without error', async () => {
    for (const payload of [
      userDeletedPayload('clerk_never_existed'),
      JSON.stringify({ type: 'user.created', data: { id: 'clerk_new' } }),
    ]) {
      const res = await request(app)
        .post('/api/auth/clerk-webhook')
        .set('Content-Type', 'application/json')
        .set(svixHeaders(payload))
        .send(payload);
      expect(res.status).toBe(200);
    }
  });
});
