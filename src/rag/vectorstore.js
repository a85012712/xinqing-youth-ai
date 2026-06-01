const fs = require('fs').promises;
const path = require('path');

class VectorStore {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(process.cwd(), 'data', 'vectors');
    this.index = new Map();
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const data = await fs.readFile(path.join(this.storagePath, 'index.json'), 'utf8');
      const parsed = JSON.parse(data);
      this.index = new Map(Object.entries(parsed));
    } catch (e) {
      this.index = new Map();
    }
  }

  // 简单的文本相似度（余弦相似度的简化版）
  similarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  // 添加文档块
  async addChunks(datasetId, chunks) {
    for (let i = 0; i < chunks.length; i++) {
      const id = datasetId + '_' + i;
      this.index.set(id, {
        id,
        datasetId,
        content: chunks[i],
        timestamp: new Date().toISOString()
      });
    }
    await this.save();
  }

  // 检索相关文档
  async search(query, topK = 3) {
    const results = [];
    for (const [id, doc] of this.index) {
      const score = this.similarity(query, doc.content);
      results.push({ ...doc, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  // 删除数据集
  async deleteDataset(datasetId) {
    for (const [id, doc] of this.index) {
      if (doc.datasetId === datasetId) {
        this.index.delete(id);
      }
    }
    await this.save();
  }

  async save() {
    const data = Object.fromEntries(this.index);
    await fs.writeFile(path.join(this.storagePath, 'index.json'), JSON.stringify(data, null, 2));
  }
}

module.exports = VectorStore;
