const express = require('express');

const MAX_PROMPT_LENGTH = 2000;

const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimit.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW;
  }
  record.count++;
  rateLimit.set(ip, record);
  return record.count <= RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimit) {
    if (now > record.resetAt) rateLimit.delete(ip);
  }
}, 60000);

module.exports = function(app, orchestrator, providerManager) {

  app.get('/api/health', (req, res) => {
    const dbOk = orchestrator.db ? true : false;
    const providerOk = providerManager.getActive() !== null;
    res.json({
      status: 'ok',
      db: dbOk ? 'connected' : 'unavailable',
      provider: providerOk ? 'configured' : 'missing'
    });
  });

  app.post('/api/search', async (req, res) => {
    const { prompt } = req.body;
    console.log(`[API] POST /api/search prompt="${prompt}"`);

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required', code: 'VALIDATION_ERROR' });
    }
    if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: `Prompt must be 1-${MAX_PROMPT_LENGTH} characters`, code: 'VALIDATION_ERROR' });
    }
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMIT' });
    }

    try {
      const result = await orchestrator.search(prompt);
      console.log(`[API] /api/search - got ${result.results?.length || 0} results`);
      res.json(result);
    } catch (e) {
      console.error('[API] /api/search ERROR:', e.message);
      res.status(500).json({ error: e.message, code: 'SEARCH_ERROR' });
    }
  });

  app.get('/api/search/stream', async (req, res) => {
    const prompt = req.query.prompt;
    console.log(`[API] GET /api/search/stream prompt="${prompt}"`);

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required', code: 'VALIDATION_ERROR' });
    }
    if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: `Prompt must be 1-${MAX_PROMPT_LENGTH} characters`, code: 'VALIDATION_ERROR' });
    }
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMIT' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        sendEvent('error', { error: 'Search timed out (120s)' });
        res.end();
      }
    }, 120000);

    // If the client disconnects, stop the timer and avoid writing to a dead socket.
    req.on('close', () => {
      finished = true;
      clearTimeout(timeout);
    });

    try {
      sendEvent('phase', { phase: 'parsing', message: 'AI parses request...' });
      const result = await orchestrator.search(prompt, (phase) => {
        sendEvent('phase', { phase, message: getPhaseMessage(phase) });
      });

      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        sendEvent('result', result);
        res.write('event: done\ndata: {}\n\n');
      }
    } catch (e) {
      console.error('[API] /api/search/stream ERROR:', e.message);
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        sendEvent('error', { error: e.message });
      }
    } finally {
      clearTimeout(timeout);
      res.end();
    }
  });

  app.get('/api/providers', (req, res) => {
    const types = providerManager.list();
    const saved = providerManager.getSavedSafe();
    const active = providerManager.activeProviderId;
    res.json({ types, saved, active });
  });

  app.post('/api/providers', (req, res) => {
    const { id, type, config } = req.body;

    try {
      if (!id || !type || !config) {
        return res.status(400).json({ error: 'id, type, and config are required', code: 'VALIDATION_ERROR' });
      }
      const savedId = providerManager.save(id, { type, ...config });
      res.json({ ok: true, id: savedId });
    } catch (e) {
      console.error('[API] /api/providers ERROR:', e.message);
      res.status(500).json({ error: e.message, code: 'PROVIDER_ERROR' });
    }
  });

  app.post('/api/providers/test', async (req, res) => {
    const { type, config } = req.body;

    try {
      if (!type || !config) {
        return res.status(400).json({ error: 'type and config are required', code: 'VALIDATION_ERROR' });
      }

      const provider = providerManager.create(type, config);
      const start = Date.now();
      const result = await provider.ping();
      const latency = Date.now() - start;

      res.json({ ...result, latency });
    } catch (e) {
      console.error('[API] /api/providers/test ERROR:', e.message);
      res.json({ ok: false, error: e.message });
    }
  });

  app.put('/api/providers/active', (req, res) => {
    const { id } = req.body;

    try {
      if (!id) {
        return res.status(400).json({ error: 'id is required', code: 'VALIDATION_ERROR' });
      }
      providerManager.setActive(id);
      res.json({ ok: true });
    } catch (e) {
      console.error('[API] /api/providers/active ERROR:', e.message);
      res.status(500).json({ error: e.message, code: 'PROVIDER_ERROR' });
    }
  });

  app.delete('/api/providers/:id', (req, res) => {
    try {
      providerManager.delete(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      console.error('[API] DELETE ERROR:', e.message);
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
      console.error('[API] /api/tags ERROR:', e.message);
      res.status(500).json({ error: e.message, code: 'MODRINTH_ERROR' });
    }
  });
};

function getPhaseMessage(phase) {
  const messages = {
    parsing: 'AI is parsing your request...',
    searching: 'Searching on Modrinth...',
    ranking: 'AI is ranking results...'
  };
  return messages[phase] || phase;
}
