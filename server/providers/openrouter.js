const BaseProvider = require('./base');

class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'google/gemini-pro';
  }

  async complete(messages, options = {}) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://modrinth-ai-search.com',
        'X-Title': 'ModrinthAI Search'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.max_tokens || 1000,
        temperature: options.temperature || 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

module.exports = OpenRouterProvider;
