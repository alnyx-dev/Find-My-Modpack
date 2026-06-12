const express = require('express');
const router = express.Router();

module.exports = function(app, orchestrator, providerManager) {
  app.use(express.json());

  app.post('/api/search', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required', code: 'VALIDATION_ERROR' });
      }

      const result = await orchestrator.search(prompt);
      res.json(result);
    } catch (e) {
      console.error('Search error:', e);
      res.status(500).json({ error: e.message, code: 'SEARCH_ERROR' });
    }
  });

  app.get('/api/providers', (req, res) => {
    const types = providerManager.list();
    const saved = providerManager.getSaved();
    const active = providerManager.activeProviderId;
    res.json({ types, saved, active });
  });

  app.post('/api/providers', (req, res) => {
    try {
      const { id, type, config } = req.body;
      if (!id || !type || !config) {
        return res.status(400).json({ error: 'id, type, and config are required', code: 'VALIDATION_ERROR' });
      }
      providerManager.save(id, { type, ...config });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message, code: 'PROVIDER_ERROR' });
    }
  });

  app.post('/api/providers/test', async (req, res) => {
    try {
      const { type, config } = req.body;
      if (!type || !config) {
        return res.status(400).json({ error: 'type and config are required', code: 'VALIDATION_ERROR' });
      }

      const provider = providerManager.create(type, config);
      const start = Date.now();
      const result = await provider.ping();
      const latency = Date.now() - start;

      res.json({ ...result, latency });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  app.put('/api/providers/active', (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'id is required', code: 'VALIDATION_ERROR' });
      }
      providerManager.setActive(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message, code: 'PROVIDER_ERROR' });
    }
  });

  app.delete('/api/providers/:id', (req, res) => {
    try {
      providerManager.delete(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message, code: 'PROVIDER_ERROR' });
    }
  });

  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await orchestrator.getTags();
      res.json({
        loaders: tags.loaders.map(l => l.name),
        versions: tags.versions.slice(0, 30).map(v => v.version),
        categories: tags.categories.map(c => c.name)
      });
    } catch (e) {
      res.status(500).json({ error: e.message, code: 'MODRINTH_ERROR' });
    }
  });
};
