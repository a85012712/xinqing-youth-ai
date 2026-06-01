const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class DatasetManager {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
    this.storagePath = path.join(process.cwd(), 'data', 'datasets');
    this.datasets = new Map();
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf8');
          const ds = JSON.parse(data);
          // 兼容旧数据：确保documents数组存在
          if (!ds.documents) ds.documents = [];
          this.datasets.set(ds.id, ds);
        }
      }
    } catch (e) {}
  }

  async create(config = {}) {
    const dataset = {
      id: uuidv4(),
      name: config.name || '新知识库',
      description: config.description || '',
      documentCount: 0,
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.datasets.set(dataset.id, dataset);
    await this.save(dataset);
    return dataset;
  }

  async addDocument(datasetId, filePath, originalName) {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error('知识库不存在');
    if (!dataset.documents) dataset.documents = [];

    const ext = path.extname(originalName).toLowerCase();
    let content = '';

    if (['.txt', '.md', '.json', '.csv', '.log'].includes(ext)) {
      content = await fs.readFile(filePath, 'utf8');
    } else {
      content = await fs.readFile(filePath, 'utf8').catch(() => '[无法读取文件]');
    }

    const chunks = this.splitText(content);
    await this.vectorStore.addChunks(datasetId, chunks);

    dataset.documentCount += chunks.length;
    dataset.documents.push({
      id: uuidv4(),
      name: originalName,
      type: ext,
      chunks: chunks.length,
      addedAt: new Date().toISOString()
    });
    dataset.updatedAt = new Date().toISOString();
    await this.save(dataset);

    return { name: originalName, chunks: chunks.length };
  }

  async addText(datasetId, text, title = '手动输入') {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error('知识库不存在');
    if (!dataset.documents) dataset.documents = [];

    const chunks = this.splitText(text);
    await this.vectorStore.addChunks(datasetId, chunks);

    dataset.documentCount += chunks.length;
    dataset.documents.push({
      id: uuidv4(),
      name: title,
      type: 'text',
      chunks: chunks.length,
      addedAt: new Date().toISOString()
    });
    dataset.updatedAt = new Date().toISOString();
    await this.save(dataset);

    return { name: title, chunks: chunks.length };
  }

  async addUrl(datasetId, url) {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new Error('知识库不存在');
    if (!dataset.documents) dataset.documents = [];

    try {
      const response = await fetch(url);
      const html = await response.text();
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const chunks = this.splitText(text);
      await this.vectorStore.addChunks(datasetId, chunks);

      dataset.documentCount += chunks.length;
      dataset.documents.push({
        id: uuidv4(),
        name: url,
        type: 'url',
        chunks: chunks.length,
        addedAt: new Date().toISOString()
      });
      dataset.updatedAt = new Date().toISOString();
      await this.save(dataset);

      return { name: url, chunks: chunks.length };
    } catch (e) {
      throw new Error('无法抓取链接内容: ' + e.message);
    }
  }

  splitText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }
    return chunks.filter(c => c.trim().length > 0);
  }

  async get(id) { return this.datasets.get(id); }
  async getAll() { return Array.from(this.datasets.values()); }

  async delete(id) {
    this.datasets.delete(id);
    await this.vectorStore.deleteDataset(id);
    try { await fs.unlink(path.join(this.storagePath, id + '.json')); } catch (e) {}
  }

  async save(dataset) {
    await fs.writeFile(path.join(this.storagePath, dataset.id + '.json'), JSON.stringify(dataset, null, 2));
  }
}

module.exports = DatasetManager;
