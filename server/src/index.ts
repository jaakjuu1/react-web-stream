import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { devicesRouter } from './routes/devices.js';
import { tokensRouter } from './routes/tokens.js';
import { pairingRouter } from './routes/pairing.js';

// Catch crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || true, // Allow all origins in production single-container setup
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  console.log('Health check hit from:', req.ip);
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug: log all incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/pairing', pairingRouter);

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

const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(Number(PORT), HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Server is listening, PID:', process.pid);

  // Heartbeat to show server is alive
  setInterval(() => {
    console.log('Heartbeat - server still running at', new Date().toISOString());
  }, 5000);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err);
});

server.on('close', () => {
  console.log('SERVER CLOSED');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT');
  process.exit(0);
});

process.on('exit', (code) => {
  console.log('Process exiting with code:', code);
});
