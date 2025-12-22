import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth.js';
import { roomsRouter } from './routes/rooms.js';
import { devicesRouter } from './routes/devices.js';
import { tokensRouter } from './routes/tokens.js';
import { pairingRouter } from './routes/pairing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  app.use(express.static(publicPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
