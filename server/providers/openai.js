const BaseProvider = require('./base');

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4o-mini';
    console.log(`[OpenAI] Created: model=${this.model} baseURL=${this.baseURL} apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[OpenAI] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);
    console.log(`[OpenAI] complete() URL: ${this.baseURL}/chat/completions`);

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        temperature: options.temperature || 0.7
      })
    };
    if (options.signal) fetchOptions.signal = options.signal;

    const response = await fetch(`${this.baseURL}/chat/completions`, fetchOptions);

    console.log(`[OpenAI] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[OpenAI] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[OpenAI] complete() ERROR: ${error}`);
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[OpenAI] complete() empty response:`, JSON.stringify(data).substring(0, 300));
      throw new Error('AI returned empty response');
    }
    console.log(`[OpenAI] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = OpenAIProvider;
