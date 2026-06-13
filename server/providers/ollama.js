const BaseProvider = require('./base');

class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseURL = config.baseURL || 'http://localhost:11434';
    this.model = config.model || 'llama3.2';
    console.log(`[Ollama] Created: model=${this.model} baseURL=${this.baseURL}`);
  }

  async complete(messages, options = {}, retryCount = 0) {
    console.log(`[Ollama] complete() model=${this.model} messages=${messages.length} max_tokens=${options.max_tokens || 1000}`);
    console.log(`[Ollama] complete() URL: ${this.baseURL}/v1/chat/completions`);

    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        temperature: options.temperature || 0.7
      })
    });

    console.log(`[Ollama] complete() status: ${response.status}`);

    if (response.status === 429 && retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 2000;
      console.log(`[Ollama] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, delay));
      return this.complete(messages, options, retryCount + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Ollama] complete() ERROR: ${error}`);
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[Ollama] complete() empty response:`, JSON.stringify(data).substring(0, 300));
      throw new Error('AI returned empty response');
    }
    console.log(`[Ollama] complete() response length: ${content.length}`);
    return content;
  }
}

module.exports = OllamaProvider;
