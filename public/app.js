const API_BASE = '';

const elements = {
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  emptyState: document.getElementById('emptyState'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeModal: document.getElementById('closeModal'),
  providerType: document.getElementById('providerType'),
  providerFields: document.getElementById('providerFields'),
  testBtn: document.getElementById('testBtn'),
  testResult: document.getElementById('testResult'),
  saveBtn: document.getElementById('saveBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  toasts: document.getElementById('toasts'),
  searchHistory: document.getElementById('searchHistory'),
  progressContainer: document.getElementById('progressContainer'),
  ringProgress: document.getElementById('ringProgress'),
  loaderPercent: document.getElementById('loaderPercent'),
  loaderPhases: document.getElementById('loaderPhases'),
  loaderParticles: document.getElementById('loaderParticles'),
  burst: document.getElementById('burst'),
  burstShards: document.getElementById('burstShards'),
  burstDots: document.getElementById('burstDots'),
  providerList: document.getElementById('providerList'),
  searchInfo: document.getElementById('searchInfo')
};

const providerFields = {
  openai: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { name: 'model', label: 'Model', type: 'text', default: 'gpt-4o-mini', placeholder: 'gpt-4o-mini' },
    { name: 'baseURL', label: 'Base URL (optional)', type: 'text', placeholder: 'https://api.openai.com/v1' }
  ],
  anthropic: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...' },
    { name: 'model', label: 'Model', type: 'text', default: 'claude-3-5-haiku-20241022', placeholder: 'claude-3-5-haiku-20241022' }
  ],
  ollama: [
    { name: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:11434', placeholder: 'http://localhost:11434' },
    { name: 'model', label: 'Model', type: 'text', default: 'llama3.2', placeholder: 'llama3.2' }
  ],
  openrouter: [
    { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-or-...' },
    { name: 'model', label: 'Model', type: 'text', default: 'google/gemini-pro', placeholder: 'google/gemini-pro' }
  ],
  custom: [
    { name: 'baseURL', label: 'Base URL', type: 'text', placeholder: 'https://api.example.com/v1' },
    { name: 'apiKey', label: 'API Key (optional)', type: 'password', placeholder: 'sk-...' },
    { name: 'model', label: 'Model', type: 'text', placeholder: 'model-name' }
  ]
};

const tagColors = {
  magic: 'tag-magic', technology: 'tag-tech', tech: 'tag-tech',
  adventure: 'tag-adventure', fabric: 'tag-fabric', forge: 'tag-forge',
  neoforge: 'tag-neoforge', quilt: 'tag-quilt',
  rpg: 'tag-rpg', quest: 'tag-quest', quests: 'tag-quest',
  multiplayer: 'tag-multiplayer', optimization: 'tag-opt',
  challenging: 'tag-challenge', lightweight: 'tag-opt',
  'quality of life': 'tag-opt', exploration: 'tag-adventure',
  kitchen: 'tag-tech', 'kitchen sink': 'tag-tech'
};

// ===== TOAST SYSTEM =====
function showToast(message, type = 'info', duration = 5000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconSvg = type === 'success'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : type === 'error'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span>${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;

  elements.toasts.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// ===== PROGRESS / LOADER =====
let progressAnim = null;
let progressTarget = 0;
let currentProgress = 0;
const RING_CIRCUMFERENCE = 2 * Math.PI * 58;

function animateProgress(target) {
  progressTarget = target;
  if (progressAnim) cancelAnimationFrame(progressAnim);

  function tick() {
    if (currentProgress < progressTarget) {
      currentProgress += 0.8;
      if (currentProgress > progressTarget) currentProgress = progressTarget;
    } else if (currentProgress > progressTarget) {
      currentProgress -= 1.5;
      if (currentProgress < progressTarget) currentProgress = progressTarget;
    }

    const offset = RING_CIRCUMFERENCE * (1 - currentProgress / 100);
    elements.ringProgress.style.strokeDashoffset = offset;
    elements.loaderPercent.textContent = Math.round(currentProgress) + '%';

    if (currentProgress !== progressTarget) {
      progressAnim = requestAnimationFrame(tick);
    }
  }

  progressAnim = requestAnimationFrame(tick);
}

function setPhase(phase) {
  const phaseOrder = ['parsing', 'searching', 'ranking'];
  const phaseIdx = phaseOrder.indexOf(phase);

  elements.loaderPhases.querySelectorAll('.loader-phase').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < phaseIdx) el.classList.add('done');
    else if (i === phaseIdx) el.classList.add('active');
  });
}

function showProgress(phase = 'parsing') {
  elements.progressContainer.classList.add('visible');
  elements.loaderParticles.classList.remove('hidden');
  setPhase(phase);
  const targets = { parsing: 20, searching: 65, ranking: 90 };
  animateProgress(targets[phase] || 0);
}

function showProgressDone() {
  setPhase('ranking');
  animateProgress(100);
}

function triggerBurst() {
  const burst = elements.burst;
  burst.classList.add('active');

  elements.burstShards.innerHTML = '';
  const shardCount = 12;
  for (let i = 0; i < shardCount; i++) {
    const angle = (360 / shardCount) * i + (Math.random() * 10 - 5);
    const dist = 70 + Math.random() * 40;
    const shard = document.createElement('div');
    shard.className = 'burst-shard';
    shard.style.setProperty('--angle', angle + 'deg');
    shard.style.setProperty('--dist', dist + 'px');
    shard.style.animationDelay = (Math.random() * 0.08) + 's';
    elements.burstShards.appendChild(shard);
  }

  elements.burstDots.innerHTML = '';
  const dotColors = ['#1bd96a', '#22e874', '#0f9c4e', '#34ffc6', '#a0ffda', '#fff'];
  const dotCount = 20;
  for (let i = 0; i < dotCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 90;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const size = 2 + Math.random() * 4;
    const dot = document.createElement('div');
    dot.className = 'burst-dot';
    dot.style.setProperty('--tx', tx + 'px');
    dot.style.setProperty('--ty', ty + 'px');
    dot.style.setProperty('--size', size + 'px');
    dot.style.setProperty('--color', dotColors[Math.floor(Math.random() * dotColors.length)]);
    dot.style.animationDelay = (Math.random() * 0.1) + 's';
    elements.burstDots.appendChild(dot);
  }

  setTimeout(() => {
    elements.progressContainer.classList.add('burst-exit');
  }, 100);

  setTimeout(() => {
    burst.classList.remove('active');
    elements.progressContainer.classList.remove('visible', 'burst-exit');
    elements.burstShards.innerHTML = '';
    elements.burstDots.innerHTML = '';
    currentProgress = 0;
    elements.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
    elements.loaderPercent.textContent = '0%';
    if (progressAnim) cancelAnimationFrame(progressAnim);
    elements.loaderPhases.querySelectorAll('.loader-phase').forEach(el => {
      el.classList.remove('active', 'done');
    });
  }, 600);
}

function hideProgress() {
  elements.progressContainer.classList.remove('visible');
  currentProgress = 0;
  elements.ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  elements.loaderPercent.textContent = '0%';
  if (progressAnim) cancelAnimationFrame(progressAnim);
  elements.loaderPhases.querySelectorAll('.loader-phase').forEach(el => {
    el.classList.remove('active', 'done');
  });
}

// ===== SKELETON LOADING =====
function showSkeletons(count = 6) {
  elements.results.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'result-card skeleton-card';
    skeleton.innerHTML = `
      <div class="card-header">
        <div class="skeleton skeleton-icon"></div>
        <div class="card-info">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-meta"></div>
        </div>
      </div>
      <div class="card-body">
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text skeleton-text-short"></div>
        <div class="skeleton skeleton-text skeleton-text-shorter"></div>
      </div>
    `;
    elements.results.appendChild(skeleton);
  }
}

// ===== SEARCH HISTORY =====
function loadHistory() {
  const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  renderHistory(history);
  return history;
}

function saveHistory(query, resultCount = 0) {
  let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  history = history.filter(h => h.query !== query);
  history.unshift({ query, timestamp: Date.now(), resultCount });
  history = history.slice(0, 8);
  localStorage.setItem('searchHistory', JSON.stringify(history));
  renderHistory(history);
}

function renderHistory(history) {
  if (!history.length) {
    elements.searchHistory.innerHTML = '';
    return;
  }
  elements.searchHistory.innerHTML = `
    <span class="search-history-label">Recent searches</span>
    ${history.map(h => {
      const timeAgo = getTimeAgo(h.timestamp);
      const count = h.resultCount != null ? ` \u00B7 ${h.resultCount}` : '';
      return `
        <button class="history-chip" data-query="${escapeHtml(h.query)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${escapeHtml(h.query.length > 28 ? h.query.substring(0, 28) + '...' : h.query)}<span class="history-meta">${timeAgo}${count}</span>
        </button>
      `;
    }).join('')}
    <button class="history-chip" id="clearHistory" style="color: var(--error); border-color: rgba(255,107,107,0.2);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Clear
    </button>
  `;

  elements.searchHistory.querySelectorAll('.history-chip[data-query]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.searchInput.value = btn.dataset.query;
      autoResize(elements.searchInput);
      search();
    });
  });

  const clearBtn = document.getElementById('clearHistory');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('searchHistory');
      renderHistory([]);
      showToast('History cleared', 'info');
    });
  }
}

function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ===== PROVIDER LIST =====
let savedProvidersData = {};
let activeProviderIdData = null;

function renderProviderList() {
  const ids = Object.keys(savedProvidersData);
  if (!ids.length) {
    elements.providerList.innerHTML = '';
    return;
  }

  elements.providerList.innerHTML = `
    <div class="provider-list-header">
      <span>Saved Providers</span>
    </div>
    ${ids.map(id => {
      const p = savedProvidersData[id];
      const isActive = id === activeProviderIdData;
      return `
        <div class="provider-item ${isActive ? 'active' : ''}" data-id="${id}">
          <div class="provider-dot"></div>
          <div class="provider-item-info">
            <div class="provider-item-name">${escapeHtml(p.model || id)}</div>
            <div class="provider-item-type">${escapeHtml(p.type)}</div>
          </div>
          <button class="provider-item-delete" data-id="${id}" title="Delete provider">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      `;
    }).join('')}
  `;

  elements.providerList.querySelectorAll('.provider-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.provider-item-delete')) return;
      const id = item.dataset.id;
      fetch(`${API_BASE}/api/providers/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      }).then(() => {
        activeProviderIdData = id;
        renderProviderList();
        const provider = savedProvidersData[id];
        if (provider) {
          elements.providerType.value = provider.type;
          renderProviderFields(provider.type);
          Object.entries(provider).forEach(([key, value]) => {
            if (key !== 'type') {
              const input = document.getElementById(`field_${key}`);
              if (input) input.value = value;
            }
          });
        }
        showToast('Provider activated', 'success');
      });
    });
  });

  elements.providerList.querySelectorAll('.provider-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      fetch(`${API_BASE}/api/providers/${id}`, { method: 'DELETE' })
        .then(() => {
          delete savedProvidersData[id];
          if (activeProviderIdData === id) activeProviderIdData = null;
          renderProviderList();
          showToast('Provider deleted', 'info');
        });
    });
  });
}

// ===== RENDER FIELDS =====
function renderProviderFields(type) {
  const fields = providerFields[type] || [];
  elements.providerFields.innerHTML = fields.map(f => `
    <div class="form-group">
      <label for="field_${f.name}">${f.label}</label>
      <input type="${f.type}" id="field_${f.name}" value="${f.default || ''}" placeholder="${f.placeholder || ''}">
    </div>
  `).join('');
}

// ===== STATUS =====
function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.className = 'status' + (isError ? ' error' : '');
  elements.status.classList.remove('hidden');
}

function hideStatus() {
  elements.status.classList.add('hidden');
}

function clearToasts() {
  elements.toasts.querySelectorAll('.toast').forEach(t => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 300);
  });
}

// ===== LOADING =====
function showLoading() {
  clearToasts();
  elements.searchBtn.disabled = true;
  elements.searchBtn.querySelector('.btn-text').textContent = 'Searching...';
  elements.emptyState.classList.add('hidden');
  if (elements.searchInfo) elements.searchInfo.innerHTML = '';
  hideProgress();
  elements.burst.classList.remove('active');
  elements.burstShards.innerHTML = '';
  elements.burstDots.innerHTML = '';
  elements.progressContainer.classList.remove('visible', 'burst-exit');
}

// ===== SEARCH INFO (summary + searchParams) =====
function renderSearchInfo(data) {
  if (!elements.searchInfo) return;

  const parts = [];

  if (data.searchParams) {
    const sp = data.searchParams;
    const filters = [];
    if (sp.filters?.loaders?.length) filters.push(sp.filters.loaders.join(', '));
    if (sp.filters?.versions?.length) filters.push(sp.filters.versions.join(', '));
    if (sp.filters?.categories?.length) filters.push(sp.filters.categories.join(', '));

    if (filters.length || sp.searchQuery) {
      parts.push(`<span class="search-info-params">Search: <strong>${escapeHtml(sp.searchQuery || '')}</strong>${filters.length ? ' | ' + escapeHtml(filters.join(', ')) : ''}${sp.sortBy && sp.sortBy !== 'relevance' ? ' | Sort: ' + escapeHtml(sp.sortBy) : ''}</span>`);
    }
  }

  if (data.explanation) {
    parts.push(`<span class="search-info-summary">${escapeHtml(data.explanation)}</span>`);
  }

  if (parts.length) {
    elements.searchInfo.innerHTML = `<div class="search-info">${parts.join('')}</div>`;
  }
}

// ===== RENDER RESULTS =====
function renderResults(data, animate = false) {
  elements.searchBtn.disabled = false;
  elements.searchBtn.querySelector('.btn-text').textContent = 'Search';

  if (!data.results || data.results.length === 0) {
    hideProgress();
    elements.results.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    showStatus(data.explanation || 'Nothing found', true);
    showToast(data.explanation || 'Nothing found', 'error');
    return;
  }

  if (data.warnings && data.warnings.length > 0) {
    showStatus(data.warnings.join(' '), true);
  } else {
    hideStatus();
  }

  renderSearchInfo(data);

  if (animate) {
    elements.results.innerHTML = '';
    elements.results.style.opacity = '0';

    triggerBurst();

    setTimeout(() => {
      elements.results.style.opacity = '1';
      elements.results.style.transition = 'opacity 0.3s ease';

      data.results.forEach((r, i) => {
        setTimeout(() => {
          const card = createResultCard(r, i);
          card.classList.add('burst-in');
          elements.results.appendChild(card);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              card.classList.add('burst-in-active');
            });
          });
        }, 200 + i * 80);
      });
    }, 450);
  } else {
    elements.results.innerHTML = data.results.map((r, i) => createResultCard(r, i).outerHTML).join('');
    hideProgress();
  }

  showToast(`Found ${data.results.length} modpacks`, 'success', 3000);
}

function createResultCard(r, index = 0) {
  const loaderTags = ['fabric', 'forge', 'neoforge', 'quilt', 'bukkit', 'spigot', 'paper', 'purpur'];

  const loaderIcons = {
    fabric: '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.4 7.3c.7 2.2 1 4.5.2 6.9-.3.9-1.4 2.2-2.4 2.2m12.9-9.1c-.7 2.2-1 4.5-.2 6.9.3.9 1.4 2.2 2.4 2.2M5.1 21.3h-2.4m18.5 0h2.4M4.6 15.4H2.9m19.3 0h1.8M4.3 12H2.6m19.8 0h1.7M9.1 12.6v2.4m7.8-2.4v2.4M12 18.5l-1.8.9m1.8-.9 1.8.9m-4.2-.9h2.4m0 .9-1.8-.9m1.8.9 1.8-.9M5.7 9.7c-.7 1.7-1 3.5-1 5.3 0 4.5 4.2 9.2 7.7 11.9 1.3 1 3.2 1.6 5 1.6M12 4.9c-1.6 0-3.1.3-4.6 1m11.8 3.8c.3-2.7.4-5.4-.7-8s-3.2-3.8-5.7-4.4M12 21.2l-3.6.6m3.6-.6 3.6.6"/></svg>',
    forge: '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5h8v-2h12v2s-7 3.4-7 6 3.1 3.1 3.1 3.1l.9 3.9H5l1-4.1s3.8.1 4-2.9c.2-2.7-6.5-.7-8-6"/></svg>',
    neoforge: '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19.2v2m0-2v2M8.4 1.3c.5 1.5.7 3 .1 4.6-.2.5-.9 1.5-1.6 1.5m8.7-6.1c-.5 1.5-.7 3-.1 4.6.2.6.9 1.5 1.6 1.5M3.6 15.8H1.9m18.5 0h1.7M3.2 12.1H1.5m19.3 0h1.8M8.1 12.7v1.6m7.8-1.6v1.6M10.8 18H12m0 1.2L10.8 18m2.4 0H12m0 1.2 1.2-1.2M4 9.7c-.5 1.2-.8 2.4-.8 3.7 0 3.1 2.9 6.3 5.3 8.2.9.7 2.2 1.1 3.4 1.1M12 4.9c-1.1 0-2.1.2-3.2.7M20 9.7c.5 1.2.8 2.4.8 3.7 0 3.1-2.9 6.3-5.3 8.2-.9.7-2.2 1.1-3.4 1.1M12 4.9c1.1 0 2.1.2 3.2.7M4 9.7c-.2-1.8-.3-3.7.5-5.5s2.2-2.6 3.9-3M20 9.7c.2-1.9.3-3.7-.5-5.5s-2.2-2.6-3.9-3M12 21.2l-2.4.4m2.4-.4 2.4.4"/></svg>',
    quilt: '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>'
  };

  const loaders = (r.categories || []).filter(c => loaderTags.includes(c));
  const categories = (r.categories || []).filter(c => !loaderTags.includes(c));
  const versions = (r.versions || []).slice(0, 3);

  const matchBadge = r.matchQuality === 'exact'
    ? '<span class="match-badge match-exact">Exact match</span>'
    : r.matchQuality === 'close'
    ? '<span class="match-badge match-close">Close match</span>'
    : '';

  const rankBadge = index === 0
    ? '<span class="rank-badge">Best match</span>'
    : index < 3
    ? `<span class="rank-badge rank-top">${index + 1}</span>`
    : '';

  const tagHtml = `
    ${loaders.length ? `<div class="tag-row"><span class="tag-group-label">Loaders</span>${loaders.map(c => `<span class="tag ${tagColors[c] || ''}">${loaderIcons[c] || ''}${c}</span>`).join('')}</div>` : ''}
    ${categories.length ? `<div class="tag-row"><span class="tag-group-label">Categories</span>${categories.map(c => `<span class="tag ${tagColors[c] || ''}">${c}</span>`).join('')}</div>` : ''}
    ${versions.length ? `<div class="tag-row"><span class="tag-group-label">Versions</span>${versions.map(v => `<span class="tag tag-version">${v}</span>`).join('')}</div>` : ''}
  `;

  const div = document.createElement('div');
  div.className = 'result-card';
  div.innerHTML = `
    <div class="card-header">
      ${r.icon_url ? `<img src="${r.icon_url}" alt="" class="card-icon" onerror="this.style.display='none'">` : ''}
      <div class="card-info">
        <div class="card-title">
          ${rankBadge}${matchBadge}
          <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
        </div>
        <div class="card-meta">
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${formatNumber(r.downloads)}</span>
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> ${formatNumber(r.follows)}</span>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-description">${escapeHtml(r.description || '')}</div>
      <div class="card-explanation">${escapeHtml(r.explanation)}</div>
      <div class="card-tags">${tagHtml}</div>
      ${(r.description || '').length > 100 ? `
        <button class="card-expand" onclick="this.closest('.result-card').classList.toggle('expanded'); this.querySelector('span').textContent = this.closest('.result-card').classList.contains('expanded') ? 'Show less' : 'Show more'">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          <span>Show more</span>
        </button>
      ` : ''}
    </div>
  `;
  return div;
}

// ===== UTILITIES =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function autoResize(el) {
  el.style.height = 'auto';
  const newHeight = Math.min(el.scrollHeight, 138);
  el.style.height = newHeight + 'px';
  el.classList.toggle('scrollable', el.scrollHeight > 138);
}

// ===== SEARCH (SSE STREAMING) =====
let currentSearchAbort = null;

async function search() {
  const query = elements.searchInput.value.trim();
  if (!query) return;

  if (currentSearchAbort) {
    currentSearchAbort.abort();
    currentSearchAbort = null;
  }

  showLoading();
  showSkeletons(6);
  showProgress('parsing');
  currentSearchAbort = new AbortController();

  try {
    const url = `${API_BASE}/api/search/stream?prompt=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: currentSearchAbort.signal });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Search failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let resultData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);

            if (eventType === 'phase') {
              const phase = parsed.phase;
              setPhase(phase);
              const targets = { parsing: 20, searching: 65, ranking: 90 };
              animateProgress(targets[phase] || 0);
            } else if (eventType === 'result') {
              resultData = parsed;
            } else if (eventType === 'error') {
              throw new Error(parsed.error || 'Search error');
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    }

    if (resultData) {
      showProgressDone();
      renderResults(resultData, true);
      saveHistory(query, resultData.results?.length || 0);
      autoResize(elements.searchInput);
    } else {
      throw new Error('No response from server');
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    elements.searchBtn.disabled = false;
    elements.searchBtn.querySelector('.btn-text').textContent = 'Search';
    hideProgress();
    elements.results.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    showStatus('Error: ' + e.message, true);
    showToast(e.message, 'error');
  } finally {
    currentSearchAbort = null;
  }
}

// ===== PROVIDERS =====
function loadProviders() {
  fetch(`${API_BASE}/api/providers`)
    .then(r => r.json())
    .then(data => {
      savedProvidersData = data.saved || {};
      activeProviderIdData = data.active || null;
      renderProviderList();

      if (data.active) {
        const provider = data.saved[data.active];
        if (provider) {
          elements.providerType.value = provider.type;
          renderProviderFields(provider.type);
          Object.entries(provider).forEach(([key, value]) => {
            if (key !== 'type') {
              const input = document.getElementById(`field_${key}`);
              if (input) input.value = value;
            }
          });
        }
      }
    })
    .catch(e => console.error('[APP] loadProviders() ERROR:', e));
}

async function testProvider() {
  const type = elements.providerType.value;
  const config = {};
  const fields = providerFields[type] || [];

  fields.forEach(f => {
    const input = document.getElementById(`field_${f.name}`);
    if (input && input.value) config[f.name] = input.value;
  });

  elements.testBtn.disabled = true;
  elements.testBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
    Testing...
  `;
  elements.testResult.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/api/providers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, config })
    });

    const data = await res.json();
    elements.testResult.className = 'test-result ' + (data.ok ? 'success' : 'error');
    elements.testResult.textContent = data.ok
      ? `Connected (${data.latency}ms)`
      : `Error: ${data.error}`;
    elements.testResult.classList.remove('hidden');

    showToast(data.ok ? `Connected in ${data.latency}ms` : 'Connection failed', data.ok ? 'success' : 'error');
  } catch (e) {
    elements.testResult.className = 'test-result error';
    elements.testResult.textContent = 'Connection failed';
    elements.testResult.classList.remove('hidden');
    showToast('Connection failed', 'error');
  }

  elements.testBtn.disabled = false;
  elements.testBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
    Test Connection
  `;
}

async function saveProvider() {
  const type = elements.providerType.value;
  const config = {};
  const fields = providerFields[type] || [];

  fields.forEach(f => {
    const input = document.getElementById(`field_${f.name}`);
    if (input && input.value) config[f.name] = input.value;
  });

  if (!config.apiKey && !config.baseURL) {
    showToast('Please fill in the required fields', 'error');
    return;
  }

  const id = 'provider-' + Date.now();

  try {
    const res1 = await fetch(`${API_BASE}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type, config })
    });

    const res2 = await fetch(`${API_BASE}/api/providers/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (res1.ok && res2.ok) {
      showToast('Provider saved and activated', 'success');
      loadProviders();
    } else {
      showToast('Failed to save provider', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }

  elements.settingsModal.classList.add('hidden');
}

// ===== EVENT LISTENERS =====
elements.searchInput.addEventListener('input', () => autoResize(elements.searchInput));
elements.searchBtn.addEventListener('click', search);

elements.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    search();
  }
});

document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    elements.searchInput.value = btn.dataset.query;
    autoResize(elements.searchInput);
    search();
  });
});

elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.remove('hidden');
  loadProviders();
});

elements.closeModal.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
elements.cancelBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));

elements.settingsModal.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    elements.settingsModal.classList.add('hidden');
  }
});

elements.providerType.addEventListener('change', () => renderProviderFields(elements.providerType.value));
elements.testBtn.addEventListener('click', testProvider);
elements.saveBtn.addEventListener('click', saveProvider);

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!elements.settingsModal.classList.contains('hidden')) {
      elements.settingsModal.classList.add('hidden');
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    elements.searchInput.focus();
  }

  if (e.key === '/' && document.activeElement !== elements.searchInput) {
    e.preventDefault();
    elements.searchInput.focus();
  }
});

// ===== INIT =====
renderProviderFields('openai');
loadHistory();
