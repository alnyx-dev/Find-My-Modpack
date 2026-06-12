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
  cancelBtn: document.getElementById('cancelBtn')
};

let currentConfig = {};

const providerFields = {
  openai: [
    { name: 'apiKey', label: 'API Key', type: 'password' },
    { name: 'model', label: 'Model', type: 'text', default: 'gpt-4o-mini' },
    { name: 'baseURL', label: 'Base URL (опционально)', type: 'text', default: '' }
  ],
  anthropic: [
    { name: 'apiKey', label: 'API Key', type: 'password' },
    { name: 'model', label: 'Model', type: 'text', default: 'claude-3-5-haiku-20241022' }
  ],
  ollama: [
    { name: 'baseURL', label: 'Base URL', type: 'text', default: 'http://localhost:11434' },
    { name: 'model', label: 'Model', type: 'text', default: 'llama3.2' }
  ],
  openrouter: [
    { name: 'apiKey', label: 'API Key', type: 'password' },
    { name: 'model', label: 'Model', type: 'text', default: 'google/gemini-pro' }
  ],
  custom: [
    { name: 'baseURL', label: 'Base URL', type: 'text' },
    { name: 'apiKey', label: 'API Key (опционально)', type: 'password' },
    { name: 'model', label: 'Model', type: 'text' }
  ]
};

function renderProviderFields(type) {
  const fields = providerFields[type] || [];
  elements.providerFields.innerHTML = fields.map(f => `
    <div class="form-group">
      <label for="field_${f.name}">${f.label}:</label>
      <input type="${f.type}" id="field_${f.name}" value="${f.default || ''}">
    </div>
  `).join('');
}

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.className = 'status' + (isError ? ' error' : '');
  elements.status.classList.remove('hidden');
}

function hideStatus() {
  elements.status.classList.add('hidden');
}

function showLoading() {
  elements.searchBtn.disabled = true;
  elements.searchBtn.textContent = 'Поиск...';
  elements.results.innerHTML = Array(6).fill(`
    <div class="result-card">
      <div class="skeleton" style="height: 100px;"></div>
      <div style="padding: 20px;">
        <div class="skeleton" style="height: 20px; margin-bottom: 10px;"></div>
        <div class="skeleton" style="height: 14px; margin-bottom: 8px;"></div>
        <div class="skeleton" style="height: 14px;"></div>
      </div>
    </div>
  `).join('');
  elements.emptyState.classList.add('hidden');
}

function renderResults(data) {
  elements.searchBtn.disabled = false;
  elements.searchBtn.textContent = 'Найти';

  if (!data.results || data.results.length === 0) {
    elements.results.innerHTML = '';
    showStatus(data.explanation || 'Ничего не найдено', true);
    return;
  }

  if (data.warnings && data.warnings.length > 0) {
    showStatus(data.warnings.join(' '), true);
  } else {
    hideStatus();
  }

  elements.results.innerHTML = data.results.map(r => `
    <div class="result-card">
      <div class="card-header">
        ${r.icon_url ? `<img src="${r.icon_url}" alt="" class="card-icon">` : ''}
        <div class="card-info">
          <div class="card-title">
            <a href="${r.url}" target="_blank">${r.title}</a>
          </div>
          <div class="card-meta">
            <span>↓ ${formatNumber(r.downloads)}</span>
            <span>★ ${formatNumber(r.follows)}</span>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-description">${r.description || ''}</div>
        <div class="card-explanation">${r.explanation}</div>
        <div class="card-tags">
          ${(r.categories || []).map(c => `<span class="tag">${c}</span>`).join('')}
          ${(r.versions || []).slice(0, 3).map(v => `<span class="tag">${v}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

async function search() {
  const query = elements.searchInput.value.trim();
  if (!query) return;

  showLoading();

  try {
    const res = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: query })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Search failed');
    }

    renderResults(data);
    saveHistory(query);
  } catch (e) {
    elements.searchBtn.disabled = false;
    elements.searchBtn.textContent = 'Найти';
    showStatus('Ошибка: ' + e.message, true);
    elements.results.innerHTML = '';
  }
}

function saveHistory(query) {
  let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  history = [query, ...history.filter(q => q !== query)].slice(0, 10);
  localStorage.setItem('searchHistory', JSON.stringify(history));
}

function loadProviders() {
  fetch(`${API_BASE}/api/providers`)
    .then(r => r.json())
    .then(data => {
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
    .catch(console.error);
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
  elements.testBtn.textContent = 'Проверка...';
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
      ? `Работает (${data.latency}ms)` 
      : `Ошибка: ${data.error}`;
    elements.testResult.classList.remove('hidden');
  } catch (e) {
    elements.testResult.className = 'test-result error';
    elements.testResult.textContent = 'Ошибка соединения';
    elements.testResult.classList.remove('hidden');
  }

  elements.testBtn.disabled = false;
  elements.testBtn.textContent = 'Проверить соединение';
}

async function saveProvider() {
  const type = elements.providerType.value;
  const config = {};
  const fields = providerFields[type] || [];
  
  fields.forEach(f => {
    const input = document.getElementById(`field_${f.name}`);
    if (input && input.value) config[f.name] = input.value;
  });

  const id = 'provider-' + Date.now();

  try {
    await fetch(`${API_BASE}/api/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type, config })
    });

    await fetch(`${API_BASE}/api/providers/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    elements.settingsModal.classList.add('hidden');
    showStatus('Провайдер сохранён', false);
    setTimeout(hideStatus, 3000);
  } catch (e) {
    showStatus('Ошибка сохранения: ' + e.message, true);
  }
}

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
    search();
  });
});

elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.remove('hidden');
  loadProviders();
});

elements.closeModal.addEventListener('click', () => {
  elements.settingsModal.classList.add('hidden');
});

elements.cancelBtn.addEventListener('click', () => {
  elements.settingsModal.classList.add('hidden');
});

elements.settingsModal.addEventListener('click', e => {
  if (e.target === elements.settingsModal) {
    elements.settingsModal.classList.add('hidden');
  }
});

elements.providerType.addEventListener('change', () => {
  renderProviderFields(elements.providerType.value);
});

elements.testBtn.addEventListener('click', testProvider);
elements.saveBtn.addEventListener('click', saveProvider);

renderProviderFields('openai');
