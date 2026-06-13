const BaseProvider = require('./base');

class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-3-5-haiku-20241022';
    console.log(`[Anthropic] Created: model=${this.model} apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[Anthropic] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);

    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const body = {
      model: this.model,
      messages: userMessages
    };

    if (options.max_tokens) {
      body.max_tokens = options.max_tokens;
    }

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    console.log(`[Anthropic] complete() POST https://api.anthropic.com/v1/messages`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    console.log(`[Anthropic] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[Anthropic] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Anthropic] complete() ERROR: ${error}`);
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) {
      console.error(`[Anthropic] complete() empty response:`, JSON.stringify(data).substring(0, 300));
      throw new Error('AI returned empty response');
    }
    console.log(`[Anthropic] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = AnthropicProvider;
