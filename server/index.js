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

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

console.log('[BOOT] Initializing ProviderManager...');
const providerManager = new ProviderManager();

if (process.env.DEFAULT_PROVIDER_TYPE) {
  const id = 'default-' + process.env.DEFAULT_PROVIDER_TYPE;
  const existing = providerManager.getSaved()[id];

  if (!existing) {
    const config = {
      type: process.env.DEFAULT_PROVIDER_TYPE,
      apiKey: process.env.DEFAULT_PROVIDER_API_KEY,
      model: process.env.DEFAULT_PROVIDER_MODEL,
      baseURL: process.env.DEFAULT_PROVIDER_BASE_URL
    };
    console.log(`[BOOT] Creating default provider: ${id}`, { type: config.type, model: config.model });
    providerManager.save(id, config);
  } else {
    console.log(`[BOOT] Default provider already exists: ${id}, keeping saved config`);
  }

  if (!providerManager.getActive()) {
    console.log(`[BOOT] No active provider, activating default: ${id}`);
    providerManager.setActive(id);
  } else {
    console.log(`[BOOT] Active provider already set, keeping: ${providerManager.activeProviderId}`);
  }
} else {
  console.log('[BOOT] No DEFAULT_PROVIDER_TYPE set in .env');
}

console.log('[BOOT] Initializing Orchestrator...');
const orchestrator = new Orchestrator(providerManager);

setupRoutes(app, orchestrator, providerManager);

app.get('*', (req, res) => {
  console.log(`[HTTP] Catch-all: ${req.url}`);
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[BOOT] Find My Modpack running on http://localhost:${PORT}`);
});
