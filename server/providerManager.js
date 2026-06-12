const fs = require('fs');
const path = require('path');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const OpenRouterProvider = require('./providers/openrouter');
const CustomProvider = require('./providers/custom');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'providers.json');

class ProviderManager {
  constructor() {
    this.adapters = {
      openai: OpenAIProvider,
      anthropic: AnthropicProvider,
      ollama: OllamaProvider,
      openrouter: OpenRouterProvider,
      custom: CustomProvider
    };
    this.savedProviders = {};
    this.activeProviderId = null;
    this.load();
  }

  register(id, AdapterClass) {
    this.adapters[id] = AdapterClass;
  }

  create(type, config) {
    const AdapterClass = this.adapters[type];
    if (!AdapterClass) {
      throw new Error(`Unknown provider type: ${type}`);
    }
    return new AdapterClass({ ...config, name: type });
  }

  list() {
    return Object.keys(this.adapters);
  }

  save(id, config) {
    this.savedProviders[id] = config;
    this._saveToFile();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        this.savedProviders = data.providers || {};
        this.activeProviderId = data.activeProviderId || null;
      }
    } catch (e) {
      console.error('Failed to load provider config:', e.message);
    }
  }

  _saveToFile() {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        providers: this.savedProviders,
        activeProviderId: this.activeProviderId
      }, null, 2));
    } catch (e) {
      console.error('Failed to save provider config:', e.message);
    }
  }

  getActive() {
    if (!this.activeProviderId || !this.savedProviders[this.activeProviderId]) {
      return null;
    }
    const config = this.savedProviders[this.activeProviderId];
    return this.create(config.type, config);
  }

  setActive(id) {
    if (!this.savedProviders[id]) {
      throw new Error(`Provider ${id} not found`);
    }
    this.activeProviderId = id;
    this._saveToFile();
  }

  delete(id) {
    delete this.savedProviders[id];
    if (this.activeProviderId === id) {
      this.activeProviderId = null;
    }
    this._saveToFile();
  }

  getSaved() {
    return this.savedProviders;
  }
}

module.exports = ProviderManager;
