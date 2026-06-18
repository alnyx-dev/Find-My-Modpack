'use strict';

/* =====================================================================
   Find My Modpack — frontend wired to the real backend API.
   Endpoints used:
     GET  /api/search/stream?prompt=...   (SSE: phase | result | error | done)
     GET  /api/providers                  -> { types, saved, active }
     POST /api/providers                  { id, type, config }
     POST /api/providers/test             { type, config } -> { ok, error?, latency }
     PUT  /api/providers/active           { id }
   ===================================================================== */

const API_BASE = '';

/* ============ utils ============ */
const $ = (s) => document.querySelector(s);
const _esc = document.createElement('div');
function escapeHtml(t) { _esc.textContent = t == null ? '' : String(t); return _esc.innerHTML; }
function safeUrl(u) {
  if (typeof u !== 'string' || !u) return '#';
  try { const x = new URL(u, location.origin); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '#'; }
  catch { return '#'; }
}
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function avatar(name, iconUrl) {
  if (iconUrl) {
    const u = safeUrl(iconUrl);
    if (u !== '#') return `<img class="card-icon" src="${escapeHtml(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{innerHTML:''}))">`;
  }
  const ch = (name || '?').trim().charAt(0).toUpperCase();
  const hues = [150, 160, 168, 140, 175];
  const h = hues[(name || '').length % hues.length];
  return `<div class="card-icon" style="display:grid;place-items:center;font-weight:800;font-size:20px;color:#04140a;background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${h + 20} 65% 45%))">${escapeHtml(ch)}</div>`;
}

/* ============ toasts ============ */
function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? 'M20 6 9 17l-5-5' : type === 'error' ? 'M18 6 6 18M6 6l12 12' : 'M12 8v5m0 3h.01';
  el.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="${icon}"/></svg><span>${escapeHtml(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ============ theme ============ */
$('#themeBtn').addEventListener('click', () => {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('fmm-theme', dark ? 'dark' : 'light');
});

/* ============ providers (real backend) ============ */
const PROVIDER_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Ollama',
  openrouter: 'OpenRouter', opencode: 'OpenCode', custom: 'Custom'
};
const PROVIDER_FIELDS = {
  openai: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { name: 'model', label: 'Model', type: 'text', def: 'gpt-4o-mini', placeholder: 'gpt-4o-mini' },
    { name: 'baseURL', label: 'Base URL (optional)', type: 'text', placeholder: 'https://api.openai.com/v1' }
  ],
  anthropic: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...' },
    { name: 'model', label: 'Model', type: 'text', def: 'claude-3-5-haiku-20241022', placeholder: 'claude-3-5-haiku-20241022' }
  ],
  ollama: [
    { name: 'baseURL', label: 'Base URL', type: 'text', def: 'http://localhost:11434', placeholder: 'http://localhost:11434' },
    { name: 'model', label: 'Model', type: 'text', def: 'llama3.2', placeholder: 'llama3.2' }
  ],
  openrouter: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-or-...' },
    { name: 'model', label: 'Model', type: 'text', def: 'google/gemini-pro', placeholder: 'google/gemini-pro' }
  ],
  opencode: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { name: 'model', label: 'Model', type: 'text', def: 'mimo-v2.5-free', placeholder: 'mimo-v2.5-free' },
    { name: 'baseURL', label: 'Base URL', type: 'text', def: 'https://opencode.ai/zen/v1', placeholder: 'https://opencode.ai/zen/v1' }
  ],
  custom: [
    { name: 'baseURL', label: 'Base URL', type: 'text', placeholder: 'https://api.example.com/v1' },
    { name: 'apiKey', label: 'API Key (optional)', type: 'password', placeholder: 'sk-...' },
    { name: 'model', label: 'Model', type: 'text', placeholder: 'model-name' }
  ]
};

let savedProviders = {};      // { id: { type, model, baseURL, apiKey(masked) } }
let activeProviderId = null;
let availableTypes = Object.keys(PROVIDER_LABELS);
let editType = 'openai';      // provider type currently shown in modal
let editValues = {};          // current field values in the modal

function activeConfig() {
  return activeProviderId ? savedProviders[activeProviderId] : null;
}

function renderProviderPill() {
  const cfg = activeConfig();
  const pill = $('#providerPill');
  if (cfg) {
    $('#providerPillText').textContent = `${PROVIDER_LABELS[cfg.type] || cfg.type} · ${cfg.model || '—'}`;
    pill.querySelector('span').classList.remove('bg-zinc-400');
    pill.querySelector('span').classList.add('bg-emerald-500');
  } else {
    $('#providerPillText').textContent = 'No provider configured';
    pill.querySelector('span').classList.remove('bg-emerald-500');
    pill.querySelector('span').classList.add('bg-zinc-400');
    pill.classList.remove('hidden');
  }
}

async function loadProviders() {
  try {
    const r = await fetch(`${API_BASE}/api/providers`);
    const data = await r.json();
    savedProviders = data.saved || {};
    activeProviderId = data.active || null;
    if (Array.isArray(data.types) && data.types.length) {
      // keep only types we know how to render fields for, preserve order
      availableTypes = data.types.filter(t => PROVIDER_FIELDS[t]);
    }
    renderProviderPill();
  } catch (e) {
    console.error('[APP] loadProviders failed:', e);
  }
}

function setEditType(type) {
  editType = type;
  editValues = {};
  // seed defaults
  (PROVIDER_FIELDS[type] || []).forEach(f => { if (f.def) editValues[f.name] = f.def; });
  // prefill from active saved provider when it matches this type
  const cfg = activeConfig();
  if (cfg && cfg.type === type) {
    Object.entries(cfg).forEach(([k, v]) => { if (k !== 'type') editValues[k] = v; });
  }
}

function renderProviderGrid() {
  $('#providerGrid').innerHTML = availableTypes.map(k =>
    `<button type="button" class="prov-opt ${k === editType ? 'active' : ''}" data-type="${k}">${escapeHtml(PROVIDER_LABELS[k] || k)}</button>`
  ).join('');
  $('#providerGrid').querySelectorAll('.prov-opt').forEach(b =>
    b.addEventListener('click', () => { setEditType(b.dataset.type); renderProviderGrid(); renderProviderFields(); $('#testResult').classList.add('hidden'); })
  );
}
function renderProviderFields() {
  const fields = PROVIDER_FIELDS[editType] || [];
  $('#providerFields').innerHTML = fields.map(f =>
    `<div><label class="field-label">${escapeHtml(f.label)}</label>
     <input class="input" data-name="${f.name}" type="${f.type}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(editValues[f.name] || '')}"></div>`
  ).join('');
  $('#providerFields').querySelectorAll('input').forEach(i =>
    i.addEventListener('input', () => { editValues[i.dataset.name] = i.value; })
  );
}
function collectConfig() {
  const config = {};
  (PROVIDER_FIELDS[editType] || []).forEach(f => {
    const v = (editValues[f.name] || '').trim();
    if (v) config[f.name] = v;
  });
  return config;
}

function openModal() {
  setEditType(activeConfig()?.type || editType || 'openai');
  $('#modal').classList.remove('hidden');
  renderProviderGrid();
  renderProviderFields();
  $('#testResult').classList.add('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#settingsBtn').addEventListener('click', openModal);
$('#closeModal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

$('#testBtn').addEventListener('click', async () => {
  const config = collectConfig();
  if (!config.apiKey && !config.baseURL) { toast('Fill in the required fields first', 'error'); return; }
  const t = $('#testResult'); t.classList.remove('hidden');
  t.innerHTML = `<div class="info-bar" style="margin:0"><span class="info-pill">Testing…</span></div>`;
  $('#testBtn').disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/providers/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: editType, config })
    });
    const data = await res.json();
    if (data.ok) {
      t.innerHTML = `<div class="info-bar" style="margin:0"><span class="info-pill">✓ Connected${data.latency != null ? ' · ' + data.latency + ' ms' : ''}</span></div>`;
    } else {
      t.innerHTML = `<div class="info-bar" style="margin:0"><span class="info-pill">✕ ${escapeHtml(data.error || 'Connection failed')}</span></div>`;
    }
  } catch (e) {
    t.innerHTML = `<div class="info-bar" style="margin:0"><span class="info-pill">✕ ${escapeHtml(e.message)}</span></div>`;
  } finally {
    $('#testBtn').disabled = false;
  }
});

$('#saveBtn').addEventListener('click', async () => {
  const config = collectConfig();
  if (!config.apiKey && !config.baseURL) { toast('Fill in the required fields first', 'error'); return; }
  // reuse the active provider id when editing the same type, otherwise create a new one
  const cur = activeConfig();
  const id = (cur && cur.type === editType && activeProviderId) ? activeProviderId : 'provider-' + Date.now();
  $('#saveBtn').disabled = true;
  try {
    const res1 = await fetch(`${API_BASE}/api/providers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: editType, config })
    });
    const data1 = await res1.json();
    if (!res1.ok) throw new Error(data1.error || 'Failed to save provider');
    const actualId = data1.id || id;
    const res2 = await fetch(`${API_BASE}/api/providers/active`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: actualId })
    });
    const data2 = await res2.json();
    if (!res2.ok) throw new Error(data2.error || 'Failed to activate provider');
    await loadProviders();
    closeModal();
    toast(`Saved ${PROVIDER_LABELS[editType] || editType} provider`, 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    $('#saveBtn').disabled = false;
  }
});

/* ============ phases / ring ============ */
const RING = 364.4;
function setRing(pct) { $('#ringBar').style.strokeDashoffset = String(RING * (1 - pct / 100)); $('#ringPct').textContent = Math.round(pct) + '%'; }
const PHASES = [['parsing', 'Understanding'], ['searching', 'Searching Modrinth'], ['ranking', 'Ranking with AI']];
const PHASE_INDEX = { parsing: 0, searching: 1, ranking: 2 };
function renderPhases(active) {
  $('#phases').innerHTML = PHASES.map((p, i) => {
    const cls = i < active ? 'done' : i === active ? 'active' : '';
    const sep = i < PHASES.length - 1 ? '<span class="phase-sep"></span>' : '';
    return `<span class="phase ${cls}"><span class="dot"></span>${p[1]}</span>${sep}`;
  }).join('');
}
let ringRAF = null;
function animateRing(to, ms) {
  return new Promise(res => {
    if (ringRAF) cancelAnimationFrame(ringRAF);
    const from = parseFloat($('#ringPct').textContent) || 0; const start = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - start) / ms);
      setRing(from + (to - from) * k);
      if (k < 1) ringRAF = requestAnimationFrame(step); else res();
    })(start);
  });
}
function showSkeletons(n = 6) {
  $('#results').innerHTML = Array.from({ length: n }).map(() =>
    `<div class="skel"><div style="display:flex;gap:.8rem"><div class="shimmer" style="height:52px;width:52px;border-radius:13px"></div>
     <div style="flex:1"><div class="shimmer" style="height:14px;width:60%"></div><div class="shimmer" style="height:10px;width:40%;margin-top:8px"></div></div></div>
     <div class="shimmer" style="height:10px;width:100%;margin-top:14px"></div>
     <div class="shimmer" style="height:10px;width:85%;margin-top:8px"></div>
     <div class="shimmer" style="height:24px;width:70%;margin-top:14px;border-radius:999px"></div></div>`
  ).join('');
}

/* ============ render results ============ */
function card(m, i) {
  const quality = m.matchQuality || 'partial';
  const badge = i === 0 ? '<span class="badge badge-best">Best match</span>'
    : quality === 'exact' ? '<span class="badge badge-exact">Exact</span>'
    : quality === 'close' ? '<span class="badge badge-close">Close</span>' : '';
  const cats = Array.isArray(m.categories) ? m.categories : [];
  const vers = Array.isArray(m.versions) ? m.versions : [];
  const tags = [
    ...cats.slice(0, 4).map(c => `<span class="tag">${escapeHtml(c)}</span>`),
    ...vers.slice(0, 2).map(v => `<span class="tag tag-ver">${escapeHtml(v)}</span>`)
  ].join('');
  const title = m.title || m.name || m.slug || 'Modpack';
  const url = m.url || ('https://modrinth.com/modpack/' + (m.slug || ''));
  const why = m.explanation || m.description || '';
  const el = document.createElement('article');
  el.className = 'card card-in';
  el.innerHTML = `
    <div class="card-top">
      ${avatar(title, m.icon_url)}
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">${badge}</div>
        <div class="card-title" style="margin-top:.25rem"><a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></div>
        <div class="card-meta">
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>${fmt(m.downloads)}</span>
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>${fmt(m.follows)}</span>
        </div>
      </div>
    </div>
    ${m.description ? `<p class="card-desc">${escapeHtml(m.description)}</p>` : ''}
    ${why ? `<div class="card-why">${escapeHtml(why)}</div>` : ''}
    <div class="tags">${tags}</div>`;
  return el;
}
function renderResults(list) {
  const box = $('#results'); box.innerHTML = '';
  $('#resultsCount').textContent = String(list.length);
  $('#resultsHead').classList.remove('hidden');
  $('#resultsHead').classList.add('flex');
  list.forEach((m, i) => {
    const c = card(m, i);
    box.appendChild(c);
    setTimeout(() => c.classList.add('show'), 60 + i * 70);
  });
}
function renderInfo(searchParams, explanation, warnings, count) {
  const sp = searchParams || {};
  const filters = sp.filters || {};
  const pills = [];
  (filters.categories || []).forEach(c => pills.push(c));
  (filters.loaders || []).forEach(l => pills.push(l));
  (filters.versions || []).forEach(v => pills.push(v));
  if (sp.sortBy && sp.sortBy !== 'relevance') pills.push('sort: ' + sp.sortBy);
  (sp.excludeCategories || []).forEach(c => pills.push('– ' + c));
  const warnHtml = (warnings && warnings.length)
    ? `<div class="info-bar" style="margin-top:.6rem"><span style="font-weight:600;color:#f59e0b">⚠</span>${warnings.map(w => `<span class="info-pill">${escapeHtml(w)}</span>`).join('')}</div>`
    : '';
  const info = $('#searchInfo');
  info.classList.remove('hidden');
  info.innerHTML = `<div class="info-bar">
    <span style="font-weight:600">AI understood:</span>
    ${pills.length ? pills.map(p => `<span class="info-pill">${escapeHtml(p)}</span>`).join('') : '<span class="info-pill">general search</span>'}
    <span style="margin-left:auto;font-size:12px;color:#71717a">${count} results</span>
  </div>${explanation ? `<p style="text-align:center;margin-top:.7rem;color:#71717a;font-size:13px">${escapeHtml(explanation)}</p>` : ''}${warnHtml}`;
}

/* ============ search flow (real SSE) ============ */
let busy = false;
let currentAbort = null;

async function runSearch(q) {
  if (busy) return;
  if (!q) { toast('Type what kind of modpack you want', 'error'); return; }
  if (!activeConfig()) {
    toast('Configure an AI provider first', 'error');
    openModal();
    return;
  }
  busy = true;
  const btn = $('#searchBtn'); btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Working…';
  $('#emptyState').classList.add('hidden');
  $('#searchInfo').classList.add('hidden');
  $('#resultsHead').classList.add('hidden');
  $('#progress').classList.remove('hidden');
  renderPhases(0); setRing(0); showSkeletons();
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  const PHASE_TARGET = { parsing: 25, searching: 70, ranking: 95 };
  let resultData = null;

  try {
    const url = `${API_BASE}/api/search/stream?prompt=${encodeURIComponent(q)}`;
    const response = await fetch(url, { signal: currentAbort.signal });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Search failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          let parsed;
          try { parsed = JSON.parse(line.slice(6)); } catch { continue; }
          if (eventType === 'phase') {
            const idx = PHASE_INDEX[parsed.phase] ?? 0;
            renderPhases(idx);
            animateRing(PHASE_TARGET[parsed.phase] || 0, 600);
          } else if (eventType === 'result') {
            resultData = parsed;
          } else if (eventType === 'error') {
            throw new Error(parsed.error || 'Search error');
          }
        }
      }
    }

    renderPhases(PHASES.length);
    await animateRing(100, 350);

    const results = (resultData && resultData.results) || [];
    $('#progress').classList.add('hidden');

    if (!results.length) {
      $('#emptyState').classList.remove('hidden');
      $('#emptyState').querySelector('p.font-semibold').textContent = 'No modpacks found';
      renderInfo(resultData && resultData.searchParams, resultData && resultData.explanation, resultData && resultData.warnings, 0);
      toast('No modpacks matched your query', 'info');
    } else {
      renderInfo(resultData.searchParams, resultData.explanation, resultData.warnings, results.length);
      renderResults(results);
      toast(`Found ${results.length} modpack${results.length === 1 ? '' : 's'}`, 'success');
    }
  } catch (e) {
    $('#progress').classList.add('hidden');
    if (e.name === 'AbortError') { busy = false; resetBtn(); return; }
    $('#emptyState').classList.remove('hidden');
    toast(e.message || 'Search failed', 'error');
  } finally {
    currentAbort = null;
    resetBtn();
    busy = false;
  }
}
function resetBtn() {
  const btn = $('#searchBtn'); btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Search';
}

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch($('#searchInput').value.trim());
});

/* ============ example chips ============ */
const CHIPS = [
  'magic and tech for 1.20.1 Fabric',
  'hardcore RPG with quests',
  'popular kitchen-sink pack',
  'cozy magic pack, no hardcore',
  'lightweight performance only',
  'skyblock automation with friends'
];
$('#chips').innerHTML = CHIPS.map(c => `<button type="button" class="chip">${escapeHtml(c)}</button>`).join('');
$('#chips').querySelectorAll('.chip').forEach(b =>
  b.addEventListener('click', () => { $('#searchInput').value = b.textContent; runSearch(b.textContent); })
);

/* ============ shortcuts ============ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); $('#searchInput').focus(); }
  if (e.key === '/' && document.activeElement !== $('#searchInput')) { e.preventDefault(); $('#searchInput').focus(); }
});

/* ============ init ============ */
renderProviderPill();
loadProviders();
