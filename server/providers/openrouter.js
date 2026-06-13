const BaseProvider = require('./base');

class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'google/gemini-pro';
    console.log(`[OpenRouter] Created: model=${this.model} apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[OpenRouter] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);
    console.log(`[OpenRouter] complete() POST https://openrouter.ai/api/v1/chat/completions`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://find-my-modpack.app',
        'X-Title': 'Find My Modpack'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        temperature: options.temperature || 0.7
      })
    });

    console.log(`[OpenRouter] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[OpenRouter] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[OpenRouter] complete() ERROR: ${error}`);
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[OpenRouter] complete() empty response:`, JSON.stringify(data).substring(0, 300));
      throw new Error('AI returned empty response');
    }
    console.log(`[OpenRouter] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = OpenRouterProvider;
