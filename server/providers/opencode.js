const BaseProvider = require('./base');

class OpenCodeProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://opencode.ai/zen/v1';
    this.model = config.model || 'mimo-v2.5-free';
    console.log(`[OpenCode] Created: model=${this.model} baseURL=${this.baseURL} apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[OpenCode] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);
    console.log(`[OpenCode] complete() URL: ${this.baseURL}/chat/completions`);

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const fetchOptions = {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        temperature: options.temperature || 0.7
      })
    };
    if (options.signal) fetchOptions.signal = options.signal;

    const response = await fetch(`${this.baseURL}/chat/completions`, fetchOptions);

    console.log(`[OpenCode] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[OpenCode] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[OpenCode] complete() ERROR: ${error}`);
      throw new Error(`OpenCode API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`[OpenCode] complete() raw response:`, JSON.stringify(data).substring(0, 500));

    let content = null;
    if (data.choices && data.choices[0]) {
      const msg = data.choices[0].message;
      content = msg?.content || null;

      if (!content && msg?.reasoning) {
        console.log(`[OpenCode] complete() content is null but reasoning exists (${msg.reasoning.length} chars), using reasoning fallback`);
        const jsonMatch = msg.reasoning.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          content = jsonMatch[0];
        }
      }
    }

    if (content === null || content === undefined) {
      console.error(`[OpenCode] complete() content is null. Finish reason: ${data.choices?.[0]?.finish_reason}`);
      throw new Error('AI returned empty response (possibly hit token limit)');
    }

    console.log(`[OpenCode] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = OpenCodeProvider;
