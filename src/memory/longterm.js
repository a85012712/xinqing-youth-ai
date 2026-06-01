const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

/**
 * 长期记忆系统
 * - 用户偏好记忆
 * - 对话历史摘要
 * - 学习到的知识
 * - 情境记忆
 */
class LongTermMemory {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'data', 'memory');
    this.memories = new Map();
    this.categories = ['preference', 'knowledge', 'context', 'skill', 'relationship'];
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf8');
          const mem = JSON.parse(data);
          this.memories.set(mem.id, mem);
        }
      }
      console.log('Loaded ' + this.memories.size + ' memories');
    } catch (e) {}
  }

  // 添加记忆
  async add(content, category = 'context', metadata = {}) {
    const memory = {
      id: uuidv4(),
      content,
      category,
      importance: metadata.importance || 0.5,
      accessCount: 0,
      lastAccessed: null,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.memories.set(memory.id, memory);
    await this.save(memory);
    return memory;
  }

  // 检索相关记忆
  async recall(query, topK = 5) {
    const results = [];
    const queryWords = this.extractKeywords(query);

    for (const [id, mem] of this.memories) {
      const score = this.calculateRelevance(queryWords, mem);
      if (score > 0.1) {
        results.push({ ...mem, score });
      }
    }

    // 按相关性和重要性排序
    results.sort((a, b) => {
      const scoreA = a.score * 0.6 + a.importance * 0.4;
      const scoreB = b.score * 0.6 + b.importance * 0.4;
      return scoreB - scoreA;
    });

    // 更新访问计数
    for (const mem of results.slice(0, topK)) {
      mem.accessCount++;
      mem.lastAccessed = new Date().toISOString();
      await this.save(mem);
    }

    return results.slice(0, topK);
  }

  // 计算相关性
  calculateRelevance(queryWords, memory) {
    const memWords = this.extractKeywords(memory.content);
    const intersection = queryWords.filter(w => memWords.includes(w));
    const union = new Set([...queryWords, ...memWords]);
    return intersection.length / union.size;
  }

  // 提取关键词
  extractKeywords(text) {
    const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
    return text.toLowerCase()
      .replace(/[^\w一-龥]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.includes(w));
  }

  // 按类别获取记忆
  async getByCategory(category) {
    return Array.from(this.memories.values())
      .filter(m => m.category === category)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  // 更新记忆重要性
  async updateImportance(id, importance) {
    const mem = this.memories.get(id);
    if (mem) {
      mem.importance = Math.max(0, Math.min(1, importance));
      mem.updatedAt = new Date().toISOString();
      await this.save(mem);
    }
  }

  // 合并相似记忆
  async consolidate() {
    const memories = Array.from(this.memories.values());
    const toDelete = new Set();

    for (let i = 0; i < memories.length; i++) {
      if (toDelete.has(memories[i].id)) continue;
      
      for (let j = i + 1; j < memories.length; j++) {
        if (toDelete.has(memories[j].id)) continue;
        
        if (memories[i].category === memories[j].category) {
          const similarity = this.calculateRelevance(
            this.extractKeywords(memories[i].content),
            memories[j]
          );
          
          if (similarity > 0.7) {
            // 合并到更重要的记忆
            if (memories[j].importance > memories[i].importance) {
              memories[i] = memories[j];
            }
            toDelete.add(memories[j].id);
          }
        }
      }
    }

    for (const id of toDelete) {
      this.memories.delete(id);
      try { await fs.unlink(path.join(this.storagePath, id + '.json')); } catch (e) {}
    }

    return toDelete.size;
  }

  // 获取记忆统计
  getStats() {
    const stats = { total: this.memories.size, byCategory: {} };
    for (const mem of this.memories.values()) {
      stats.byCategory[mem.category] = (stats.byCategory[mem.category] || 0) + 1;
    }
    return stats;
  }

  async save(mem) {
    await fs.writeFile(path.join(this.storagePath, mem.id + '.json'), JSON.stringify(mem, null, 2));
  }

  async delete(id) {
    this.memories.delete(id);
    try { await fs.unlink(path.join(this.storagePath, id + '.json')); } catch (e) {}
  }
}

module.exports = LongTermMemory;
