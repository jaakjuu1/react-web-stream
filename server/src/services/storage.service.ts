import fs from 'fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import type { ReadStream } from 'fs';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredFile {
  path: string;
  size: number;
}

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../uploads');

// Local storage: ensure uploads directory exists
if (STORAGE_TYPE === 'local' && !existsSync(STORAGE_PATH)) {
  mkdirSync(STORAGE_PATH, { recursive: true });
}

// R2 client (initialized lazily only when needed)
let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY env vars'
      );
    }

    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _r2Client;
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME env var is required');
  return bucket;
}

function buildKey(userId: string, roomId: string, mimeType: string): string {
  const ext = mimeType === 'video/webm' ? '.webm' : '.mp4';
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `clips/${userId}/${roomId}/${date}/${randomUUID()}${ext}`;
}

// ── Upload ──────────────────────────────────────────────────────────

export async function uploadClip(
  userId: string,
  roomId: string,
  file: Buffer,
  mimeType: string
): Promise<StoredFile> {
  const key = buildKey(userId, roomId, mimeType);

  if (STORAGE_TYPE === 'r2') {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: file,
        ContentType: mimeType,
      })
    );
    return { path: key, size: file.length };
  }

  // Local storage
  const fullPath = path.join(STORAGE_PATH, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file);
  return { path: key, size: file.length };
}

// ── Delete ──────────────────────────────────────────────────────────

export async function deleteClip(storagePath: string): Promise<void> {
  if (STORAGE_TYPE === 'r2') {
    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: getR2Bucket(),
        Key: storagePath,
      })
    );
    return;
  }

  // Local storage
  const fullPath = path.join(STORAGE_PATH, storagePath);
  await fs.unlink(fullPath).catch(() => {});
}

// ── Presigned URL (R2 only) ─────────────────────────────────────────

export async function getPresignedUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string> {
  if (STORAGE_TYPE !== 'r2') {
    throw new Error('Presigned URLs are only available with R2 storage');
  }

  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: storagePath,
    }),
    { expiresIn }
  );
}

// ── Presigned Upload URL (R2 only) ──────────────────────────────────

export async function getPresignedUploadUrl(
  userId: string,
  roomId: string,
  mimeType: string,
  expiresIn = 3600
): Promise<{ url: string; key: string }> {
  if (STORAGE_TYPE !== 'r2') {
    throw new Error('Presigned upload URLs are only available with R2 storage');
  }

  const key = buildKey(userId, roomId, mimeType);
  const client = getR2Client();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ContentType: mimeType,
    }),
    { expiresIn }
  );

  return { url, key };
}

// ── Local-only helpers (for streaming fallback) ─────────────────────

export function getClipStream(storagePath: string): ReadStream {
  if (STORAGE_TYPE !== 'local') {
    throw new Error('getClipStream is only available with local storage');
  }
  const fullPath = path.join(STORAGE_PATH, storagePath);
  return createReadStream(fullPath);
}

export async function getClipStats(
  storagePath: string
): Promise<{ size: number }> {
  if (STORAGE_TYPE !== 'local') {
    throw new Error('getClipStats is only available with local storage');
  }
  const fullPath = path.join(STORAGE_PATH, storagePath);
  const stats = await fs.stat(fullPath);
  return { size: stats.size };
}

// ── Helpers ─────────────────────────────────────────────────────────

export function isR2(): boolean {
  return STORAGE_TYPE === 'r2';
}
