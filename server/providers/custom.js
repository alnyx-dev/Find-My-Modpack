const BaseProvider = require('./base');

class CustomProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async complete(messages, options = {}) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

module.exports = CustomProvider;
