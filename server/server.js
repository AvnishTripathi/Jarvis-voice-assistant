/* ═══════════════════════════════════════════════════════════
   J.A.R.V.I.S  —  Multimodal AI Assistant Backend Server
   Version  : 6.2.0 (Production Edition)
   Tech     : Node.js, Express, MongoDB Mongoose, REST API
   ═══════════════════════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security & Utility Middlewares ────────────────────────────
app.disable('x-powered-by');

const clientOrigin = process.env.CLIENT_ORIGIN || '*';
app.use(cors({
  origin: clientOrigin === '*' ? true : clientOrigin,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Production Request Logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${color}${status}\x1b[0m (${duration}ms)`);
    });
  }
  next();
});

// ── Database Connection with Fast Failover ───────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/jarvis_ai_db';

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 3000,
  bufferCommands: false
})
  .then(() => console.log('✅ [JARVIS Core] MongoDB Neural Database Connected Successfully.'))
  .catch(err => console.log('⚠️ [JARVIS Core] MongoDB Offline (Running in Resilient Standalone Mode):', err.message));

// ── Serve Frontend Static Files ──────────────────────────────
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// ── API Routes Mount ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/telemetry', require('./routes/telemetry'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/system', require('./routes/system'));
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/news', require('./routes/news'));
app.use('/api/currency', require('./routes/currency'));




// ── Health Check Endpoint ────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'J.A.R.V.I.S AI Core',
    version: 'v6.2.0',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'STANDALONE_LOCAL',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Fallback to index.html for Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ── Centralized Error Handling ───────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ [Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// ── Start Server ─────────────────────────────────────────────
let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║        J.A.R.V.I.S  SERVER  ONLINE          ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  LOCAL:   http://localhost:${PORT}               ║`);
    console.log(`║  MODE:    PRODUCTION READY                   ║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log(`  >> Access http://localhost:${PORT} in Chrome <<`);
    console.log('  >> Press Ctrl+C to stop the server       <<');
    console.log('');
  });

  // Graceful shutdown signals
  const gracefulShutdown = () => {
    console.log('\n[JARVIS Core] Shutting down server gracefully...');
    server.close(() => {
      mongoose.connection.close(false).then(() => {
        console.log('[JARVIS Core] Server and database connections closed.');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

module.exports = { app, server };
