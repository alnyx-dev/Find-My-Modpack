const fs = require('fs');
const path = require('path');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const OpenRouterProvider = require('./providers/openrouter');
const CustomProvider = require('./providers/custom');
const OpenCodeProvider = require('./providers/opencode');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'providers.json');

class ProviderManager {
  constructor() {
    console.log('[PM] Initializing ProviderManager...');
    this.adapters = {
      openai: OpenAIProvider,
      anthropic: AnthropicProvider,
      ollama: OllamaProvider,
      openrouter: OpenRouterProvider,
      custom: CustomProvider,
      opencode: OpenCodeProvider
    };
    this.savedProviders = {};
    this.activeProviderId = null;
    console.log('[PM] Registered adapters:', Object.keys(this.adapters));
    this.load();
  }

  register(id, AdapterClass) {
    console.log(`[PM] Registering adapter: ${id}`);
    this.adapters[id] = AdapterClass;
  }

  create(type, config) {
    console.log(`[PM] create() type="${type}"`, { configKeys: Object.keys(config) });
    const AdapterClass = this.adapters[type];
    if (!AdapterClass) {
      console.error(`[PM] create() - unknown type: ${type}`);
      throw new Error(`Unknown provider type: ${type}`);
    }
    return new AdapterClass({ ...config, name: type });
  }

  list() {
    return Object.keys(this.adapters);
  }

  findDuplicate(type, config) {
    for (const [id, saved] of Object.entries(this.savedProviders)) {
      if (saved.type !== type) continue;
      const sameKey = (!saved.apiKey && !config.apiKey) || saved.apiKey === config.apiKey;
      const sameUrl = (!saved.baseURL && !config.baseURL) || saved.baseURL === config.baseURL;
      const sameModel = (!saved.model && !config.model) || saved.model === config.model;
      if (sameKey && sameUrl && sameModel) return id;
    }
    return null;
  }

  save(id, config) {
    const existingId = this.findDuplicate(config.type, config);
    if (existingId) {
      console.log(`[PM] save() duplicate found, updating: ${existingId}`);
      const existing = this.savedProviders[existingId];
      if (config.apiKey && config.apiKey.startsWith('***') && existing.apiKey) {
        config.apiKey = existing.apiKey;
      }
      this.savedProviders[existingId] = config;
      this._saveToFile();
      return existingId;
    }
    console.log(`[PM] save() id="${id}"`, { type: config.type, model: config.model });
    this.savedProviders[id] = config;
    this._saveToFile();
    return id;
  }

  load() {
    console.log(`[PM] load() from ${CONFIG_PATH}`);
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        this.savedProviders = data.providers || {};
        this.activeProviderId = data.activeProviderId || null;
        console.log(`[PM] load() - providers:`, Object.keys(this.savedProviders), `active: ${this.activeProviderId}`);
      } else {
        console.log('[PM] load() - no config file found');
      }
    } catch (e) {
      console.error('[PM] load() FAILED:', e.message);
    }
  }

  _saveToFile() {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        console.log(`[PM] _saveToFile() - creating dir: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = JSON.stringify({
        providers: this.savedProviders,
        activeProviderId: this.activeProviderId
      }, null, 2);
      fs.writeFileSync(CONFIG_PATH, content);
      console.log(`[PM] _saveToFile() - saved OK, size=${content.length}`);
    } catch (e) {
      console.error('[PM] _saveToFile() FAILED:', e.message);
    }
  }

  getActive() {
    console.log(`[PM] getActive() id="${this.activeProviderId}"`);
    if (!this.activeProviderId || !this.savedProviders[this.activeProviderId]) {
      console.log('[PM] getActive() - no active provider');
      return null;
    }
    const config = this.savedProviders[this.activeProviderId];
    console.log(`[PM] getActive() - creating provider type="${config.type}"`);
    return this.create(config.type, config);
  }

  setActive(id) {
    console.log(`[PM] setActive("${id}")`);
    if (!this.savedProviders[id]) {
      console.error(`[PM] setActive() - provider ${id} not found`);
      throw new Error(`Provider ${id} not found`);
    }
    this.activeProviderId = id;
    this._saveToFile();
  }

  delete(id) {
    console.log(`[PM] delete("${id}")`);
    delete this.savedProviders[id];
    if (this.activeProviderId === id) {
      this.activeProviderId = null;
    }
    this._saveToFile();
  }

  getSaved() {
    return this.savedProviders;
  }

  getSavedSafe() {
    const safe = {};
    for (const [id, config] of Object.entries(this.savedProviders)) {
      safe[id] = { ...config };
      if (safe[id].apiKey) {
        safe[id].apiKey = '***' + safe[id].apiKey.slice(-4);
      }
    }
    return safe;
  }
}

module.exports = ProviderManager;
