require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ProviderManager = require('./providerManager');
const Orchestrator = require('./orchestrator');
const setupRoutes = require('./router');

console.log('[BOOT] Starting Find My Modpack...');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Trust proxy only when explicitly configured. Enabling it blindly would let
// clients spoof X-Forwarded-For and bypass the per-IP rate limiter.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);
}

app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`[HTTP] ${req.method} ${req.url}`);
  }
  next();
});

// Restrict CORS. Requests without an Origin header (same-origin browser
// requests, curl, server-to-server) are allowed. Cross-origin browser
// requests are only allowed for origins listed in ALLOWED_ORIGINS so that a
// random website the user visits cannot drive the local provider/admin API.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

console.log('[BOOT] Initializing ProviderManager...');
const providerManager = new ProviderManager();

if (process.env.DEFAULT_PROVIDER_TYPE) {
  const id = 'default-' + process.env.DEFAULT_PROVIDER_TYPE;
  const hasProviders = Object.keys(providerManager.getSaved()).length > 0;

  if (!hasProviders) {
    const config = {
      type: process.env.DEFAULT_PROVIDER_TYPE,
      apiKey: process.env.DEFAULT_PROVIDER_API_KEY,
      model: process.env.DEFAULT_PROVIDER_MODEL,
      baseURL: process.env.DEFAULT_PROVIDER_BASE_URL
    };
    console.log(`[BOOT] First run - creating default provider: ${id}`, { type: config.type, model: config.model });
    providerManager.save(id, config);
  } else {
    console.log(`[BOOT] Providers exist, skipping default creation`);
  }

  if (!providerManager.getActive()) {
    const firstId = Object.keys(providerManager.getSaved())[0];
    if (firstId) {
      console.log(`[BOOT] No active provider, activating first available: ${firstId}`);
      providerManager.setActive(firstId);
    }
  } else {
    console.log(`[BOOT] Active provider already set, keeping: ${providerManager.activeProviderId}`);
  }
} else {
  console.log('[BOOT] No DEFAULT_PROVIDER_TYPE set in .env');
}

console.log('[BOOT] Initializing Orchestrator...');
const orchestrator = new Orchestrator(providerManager);

setupRoutes(app, orchestrator, providerManager);

app.all('*', (req, res) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[BOOT] Find My Modpack running on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[BOOT] Port ${PORT} is already in use`);
  } else {
    console.error('[BOOT] Server error:', err.message);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[BOOT] Shutting down...');
  if (orchestrator.db) orchestrator.db.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('\n[BOOT] SIGTERM received, shutting down...');
  if (orchestrator.db) orchestrator.db.close();
  server.close(() => process.exit(0));
});
