// server/src/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { runMigrations } = require('./sql/migrate');

// Routes
const authRoutes = require('./routes/auth');
const metaRoutes = require('./routes/meta');
const fuelRoutes = require('./routes/fuel');
const importRoutes = require('./routes/import');
const fuelRequestsRoutes = require('./routes/fuelRequests');
const carRequestsRoutes = require('./routes/carRequests');
const logbooksRoutes = require('./routes/logbooks');
const trashRoutes = require('./routes/trash');
const notificationsRoutes = require('./routes/notifications');
const usersRoutes = require('./routes/users');

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_URL || true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/import', importRoutes);
app.use('/api/requests/fuel', fuelRequestsRoutes);
app.use('/api/requests/car', carRequestsRoutes);
app.use('/api/logbooks', logbooksRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);

// Serve Static Files (Production / Docker)
const publicDir = path.join(__dirname, '..', 'public');
const publicIndex = path.join(publicDir, 'index.html');
if (fs.existsSync(publicIndex)) {
  app.use(express.static(publicDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(publicIndex));
}

// 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);

  if (res.headersSent) return next(err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux (max 10MB)' });
  }

  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: err.name || 'SERVER_ERROR',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

async function start() {
  // ✅ migrations auto (colonnes + table affectations)
  await runMigrations();

  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch((e) => {
  console.error('❌ Startup failed:', e);
  process.exit(1);
});
