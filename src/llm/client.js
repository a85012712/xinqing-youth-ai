class LLMClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.LLM_BASE_URL;
    this.apiKey = config.apiKey || process.env.LLM_API_KEY;
    this.model = config.model || process.env.LLM_MODEL;
    this.maxTokens = config.maxTokens || parseInt(process.env.MAX_TOKENS) || 4096;
    this.temperature = config.temperature || parseFloat(process.env.TEMPERATURE) || 0.7;
    this.apiType = this.baseUrl.includes('anthropic') ? 'anthropic' : 'openai';
  }

  async chat(messages, options = {}) {
    if (this.apiType === 'anthropic') return this.anthropicChat(messages, options);
    return this.openaiChat(messages, options);
  }

  async openaiChat(messages, options = {}) {
    const url = this.baseUrl + '/chat/completions';
    const body = { model: options.model || this.model, messages, max_tokens: options.maxTokens || this.maxTokens, temperature: options.temperature ?? this.temperature };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API Error: ' + res.status);
    const data = await res.json();
    return { content: data.choices[0].message.content, usage: data.usage };
  }

  async anthropicChat(messages, options = {}) {
    const url = this.baseUrl + '/v1/messages';
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const body = { model: options.model || this.model, max_tokens: options.maxTokens || this.maxTokens, messages: otherMessages };
    if (systemMsg) body.system = systemMsg.content;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API Error: ' + res.status);
    const data = await res.json();
    return { content: data.content[0].text, usage: data.usage };
  }

  // 流式输出
  async *chatStream(messages, options = {}) {
    if (this.apiType === 'anthropic') {
      yield* this.anthropicStream(messages, options);
    } else {
      yield* this.openaiStream(messages, options);
    }
  }

  async *openaiStream(messages, options = {}) {
    const url = this.baseUrl + '/chat/completions';
    const body = { model: options.model || this.model, messages, max_tokens: options.maxTokens || this.maxTokens, stream: true };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API Error: ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices[0]?.delta?.content) yield { type: 'content', text: parsed.choices[0].delta.content };
        } catch (e) {}
      }
    }
  }

  async *anthropicStream(messages, options = {}) {
    const url = this.baseUrl + '/v1/messages';
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    const body = { model: options.model || this.model, max_tokens: options.maxTokens || this.maxTokens, messages: otherMessages, stream: true };
    if (systemMsg) body.system = systemMsg.content;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API Error: ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) yield { type: 'content', text: parsed.delta.text };
          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'thinking') yield { type: 'thinking_start' };
          if (parsed.type === 'content_block_delta' && parsed.delta?.thinking) yield { type: 'thinking', text: parsed.delta.thinking };
          if (parsed.type === 'content_block_stop') yield { type: 'thinking_end' };
        } catch (e) {}
      }
    }
  }
}
module.exports = LLMClient;
