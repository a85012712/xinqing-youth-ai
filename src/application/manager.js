const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class ApplicationManager {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'data', 'applications');
    this.apps = new Map();
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf8');
          const app = JSON.parse(data);
          this.apps.set(app.id, app);
        }
      }
    } catch (e) {}

    // 创建默认应用
    if (this.apps.size === 0) {
      await this.createDefaultApps();
    }
  }

  async createDefaultApps() {
    await this.create({
      name: '通用助手',
      description: '通用AI对话助手',
      icon: '🤖',
      type: 'chat',
      model: process.env.LLM_MODEL,
      systemPrompt: '你是一个专业、友好的AI助手。请用中文回答问题。',
      datasetIds: []
    });

    await this.create({
      name: '知识库问答',
      description: '基于知识库的智能问答',
      icon: '📚',
      type: 'rag',
      model: process.env.LLM_MODEL,
      systemPrompt: '请基于提供的知识库内容回答问题。如果知识库中没有相关信息，请如实告知。',
      datasetIds: []
    });
  }

  async create(config = {}) {
    const app = {
      id: uuidv4(),
      name: config.name || '新应用',
      description: config.description || '',
      icon: config.icon || '🤖',
      type: config.type || 'chat', // chat, rag, agent
      model: config.model || process.env.LLM_MODEL,
      systemPrompt: config.systemPrompt || '',
      datasetIds: config.datasetIds || [],
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 4096,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.apps.set(app.id, app);
    await this.save(app);
    return app;
  }

  async get(id) {
    return this.apps.get(id);
  }

  async getAll() {
    return Array.from(this.apps.values());
  }

  async update(id, updates) {
    const app = this.apps.get(id);
    if (!app) throw new Error('Application not found');
    Object.assign(app, updates, { updatedAt: new Date().toISOString() });
    await this.save(app);
    return app;
  }

  async delete(id) {
    this.apps.delete(id);
    try { await fs.unlink(path.join(this.storagePath, id + '.json')); } catch (e) {}
  }

  async save(app) {
    await fs.writeFile(path.join(this.storagePath, app.id + '.json'), JSON.stringify(app, null, 2));
  }
}

module.exports = ApplicationManager;
