class BaseProvider {
  constructor(config) {
    this.name = config.name || this.constructor.name;
    this.config = config;
    this.requestTimeout = config.requestTimeout || 60000;
  }

  async complete(messages, options = {}) {
    throw new Error('complete() must be implemented');
  }

  async completeWithTimeout(messages, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout);
    try {
      const result = await this.complete(messages, { ...options, signal: controller.signal });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async ping() {
    try {
      await this.complete([{ role: 'user', content: 'Hi' }], { max_tokens: 5 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

module.exports = BaseProvider;
