import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { clerkMiddleware } from '@clerk/express';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { devicesRouter } from './routes/devices.js';
import { tokensRouter } from './routes/tokens.js';
import { pairingRouter } from './routes/pairing.js';
import { eventsRouter } from './routes/events.js';
import { pushRouter } from './routes/push.js';
import { clipsRouter } from './routes/clips.js';
import { stripeRouter } from './routes/stripe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clerk Frontend API proxy — bypasses CNAME/SSL issues by routing
// Clerk requests through our own server at /__clerk/*
function getClerkFapiUrl(): string {
  const key = process.env.CLERK_PUBLISHABLE_KEY || '';
  try {
    const encoded = key.split('_').slice(2).join('_');
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8').replace(/\$$/, '');
    return `https://${decoded}`;
  } catch {
    return '';
  }
}

export function createApp(): express.Express {
  const app = express();

  // Behind a reverse proxy in production; needed for correct client IPs
  app.set('trust proxy', 1);

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }));

  const clerkFapiUrl = getClerkFapiUrl();
  if (clerkFapiUrl) {
    console.log('Clerk FAPI proxy enabled: /__clerk/* →', clerkFapiUrl);
    app.use('/__clerk', createProxyMiddleware({
      target: clerkFapiUrl,
      changeOrigin: true,
      pathRewrite: { '^/__clerk': '' },
    }));
  }

  // Stripe webhook needs raw body - must come BEFORE express.json()
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json());

  // Clerk authentication middleware
  app.use(clerkMiddleware());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Request logging — opt-in via DEBUG_REQUESTS to keep production logs clean
  if (process.env.DEBUG_REQUESTS === 'true') {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path} from ${req.ip}`);
      next();
    });
  }

  // Rate limits on endpoints that mint credentials or accept guessable codes.
  // Disabled under test so suites can hammer the same endpoints.
  const limitsEnabled = process.env.NODE_ENV !== 'test';
  const tokenLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: limitsEnabled ? 60 : 100000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const pairingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: limitsEnabled ? 20 : 100000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/tokens', tokenLimiter, tokensRouter);
  app.use('/api/pairing', pairingLimiter, pairingRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/clips', clipsRouter);
  app.use('/api/stripe', stripeRouter);

  // Error handler for API routes
  app.use('/api', (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, '..', 'public');
    console.log('Production mode - serving static files from:', publicPath);

    // Check if public directory exists
    import('fs').then(fs => {
      if (fs.existsSync(publicPath)) {
        console.log('Public directory exists');
        console.log('Contents:', fs.readdirSync(publicPath));
      } else {
        console.error('ERROR: Public directory does not exist!');
      }
    });

    app.use(express.static(publicPath));

    // SPA fallback - serve index.html for all non-API routes (Express 5 syntax)
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  return app;
}
