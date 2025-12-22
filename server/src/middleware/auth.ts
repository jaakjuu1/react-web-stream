import { Request, Response, NextFunction } from 'express';
import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export interface AuthRequest extends Request {
  userId?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = payload.sub;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function generateAccessToken(userId: string): Promise<string> {
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function generateRefreshToken(userId: string): Promise<string> {
  return new jose.SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'refresh' || !payload.sub) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
