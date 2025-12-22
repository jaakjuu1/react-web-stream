import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authMiddleware,
  AuthRequest,
} from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register
authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const accessToken = await generateAccessToken(user.id);
    const refreshToken = await generateRefreshToken(user.id);

    res.json({
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = await generateAccessToken(user.id);
    const refreshToken = await generateRefreshToken(user.id);

    res.json({
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const userId = await verifyRefreshToken(refreshToken);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newAccessToken = await generateAccessToken(user.id);
    const newRefreshToken = await generateRefreshToken(user.id);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Get current user
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});
