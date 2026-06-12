class BaseProvider {
  constructor(config) {
    this.name = config.name || this.constructor.name;
    this.config = config;
  }

  async complete(messages, options = {}) {
    throw new Error('complete() must be implemented');
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
