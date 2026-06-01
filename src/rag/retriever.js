class RAGRetriever {
  constructor(vectorStore, llmClient) {
    this.vectorStore = vectorStore;
    this.llm = llmClient;
  }

  // 检索相关文档
  async retrieve(query, topK = 3) {
    return await this.vectorStore.search(query, topK);
  }

  // RAG生成
  async generate(query, options = {}) {
    // 1. 检索相关文档
    const docs = await this.retrieve(query, options.topK || 3);

    // 2. 构建上下文
    const context = docs.map((d, i) => '[文档' + (i + 1) + ']: ' + d.content).join('\n\n');

    // 3. 构建提示
    const systemPrompt = `你是一个智能助手。请基于以下参考文档回答用户的问题。
如果文档中没有相关信息，请如实告知。

参考文档：
${context}`;

    // 4. 调用LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    const result = await this.llm.chat(messages, options);

    return {
      answer: result.content,
      references: docs.map(d => ({ content: d.content, score: d.score })),
      usage: result.usage
    };
  }
}

module.exports = RAGRetriever;
