const BaseProvider = require('./base');

class CustomProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.model = config.model;
    console.log(`[Custom] Created: model=${this.model} baseURL=${this.baseURL} apiKey=${this.apiKey ? '***' + this.apiKey.slice(-4) : 'NONE'}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[Custom] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);
    console.log(`[Custom] complete() URL: ${this.baseURL}/chat/completions`);

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
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        temperature: options.temperature || 0.7
      })
    });

    console.log(`[Custom] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[Custom] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Custom] complete() ERROR: ${error}`);
      throw new Error(`Custom API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`[Custom] complete() raw response:`, JSON.stringify(data).substring(0, 500));

    let content = null;
    if (data.choices && data.choices[0]) {
      const msg = data.choices[0].message;
      content = msg?.content || null;

      if (!content && msg?.reasoning) {
        console.log(`[Custom] complete() content is null but reasoning exists (${msg.reasoning.length} chars), using reasoning fallback`);
        const jsonMatch = msg.reasoning.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          content = jsonMatch[0];
        }
      }
    }

    if (content === null || content === undefined) {
      console.error(`[Custom] complete() content is null. Finish reason: ${data.choices?.[0]?.finish_reason}`);
      throw new Error('AI returned empty response (possibly hit token limit)');
    }

    console.log(`[Custom] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = CustomProvider;
