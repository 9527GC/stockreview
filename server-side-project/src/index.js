const path = require('path');
const fs = require('fs');
const nodeEnv = process.env.NODE_ENV || 'development';

// Skip .env file loading in test mode so tests can inject their own env vars
if (nodeEnv !== 'test') {
  const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
  let envPath = path.resolve(__dirname, '..', envFile);

  // Fallback to .env if specific env file not found
  if (!fs.existsSync(envPath)) {
      envPath = path.resolve(__dirname, '..', '.env');
      console.log(`[env] ${envFile} not found, using .env`);
  }

  // Manually read .env file and set environment variables (override existing)
  if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
          const match = line.match(/^([^#=]+)=(.*)$/);
          if (match) {
              const key = match[1].trim();
              const value = match[2].trim();
              if (key) {
                  process.env[key] = value;  // Override existing values
              }
          }
      });
      console.log(`[env] Loaded ${path.basename(envPath)}`);
  } else {
      console.log(`[env] Warning: No .env file found`);
  }

  // Prevent dotenv from auto-loading other .env files
  process.env.DOTENV_CONFIG_PATH = envPath;
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const assetRoutes = require('./routes/assetRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const transferRoutes = require('./routes/transferRoutes');
const marketRoutes = require('./routes/marketRoutes');
const { startProfitHistoryScheduler } = require('./jobs/profitHistoryScheduler');
const { startMarketSnapshotScheduler } = require('./jobs/marketSnapshotScheduler');
const profitCurveScheduler = require('./services/profitCurveScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Mandatory environment checks
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required');
  process.exit(1);
}

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : (process.env.NODE_ENV === 'production' ? [] : ['*']);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later' }
});
const marketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MARKET_MAX || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Market data rate limit exceeded, please try again later' }
});

app.use(express.json());
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/market', marketLimiter);

// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Stock Review System API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/market', marketRoutes);

// Catch-all route for 404
app.use((req, res) => {
  console.log(`${new Date().toISOString()} 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`${new Date().toISOString()} Error:`, err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'CORS policy: origin not allowed' });
  }
  res.status(500).json({ message: 'Internal server error' });
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    if (process.env.NODE_ENV !== 'test') {
      startProfitHistoryScheduler();
      startMarketSnapshotScheduler();
      // Start profit curve scheduler (daily at 2:00 AM)
      profitCurveScheduler.start();

      const HOST = process.env.HOST || '0.0.0.0';
      app.listen(PORT, HOST, () => {
        console.log(`Server is running on http://${HOST}:${PORT}`);
      });
    }
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

module.exports = app;
