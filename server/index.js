require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ProviderManager = require('./providerManager');
const Orchestrator = require('./orchestrator');
const setupRoutes = require('./router');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const providerManager = new ProviderManager();

if (process.env.DEFAULT_PROVIDER_TYPE) {
  const id = 'default-' + process.env.DEFAULT_PROVIDER_TYPE;
  const config = {
    type: process.env.DEFAULT_PROVIDER_TYPE,
    apiKey: process.env.DEFAULT_PROVIDER_API_KEY,
    model: process.env.DEFAULT_PROVIDER_MODEL,
    baseURL: process.env.DEFAULT_PROVIDER_BASE_URL
  };
  providerManager.save(id, config);
  providerManager.setActive(id);
}

const orchestrator = new Orchestrator(providerManager);

setupRoutes(app, orchestrator, providerManager);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ModrinthAI Search running on http://localhost:${PORT}`);
});
