const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

class ChatManager {
  constructor() {
    this.storagePath = path.join(process.cwd(), 'data', 'conversations');
    this.conversations = new Map();
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf8');
          const conv = JSON.parse(data);
          this.conversations.set(conv.id, conv);
        }
      }
    } catch (e) {}
  }

  async create(appId) {
    const conv = {
      id: uuidv4(),
      appId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.conversations.set(conv.id, conv);
    await this.save(conv);
    return conv;
  }

  async get(id) {
    return this.conversations.get(id);
  }

  async getAll(appId) {
    const convs = Array.from(this.conversations.values());
    if (appId) return convs.filter(c => c.appId === appId);
    return convs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async addMessage(convId, message) {
    const conv = this.conversations.get(convId);
    if (!conv) throw new Error('Conversation not found');

    const msg = {
      id: uuidv4(),
      role: message.role,
      content: message.content,
      references: message.references || [],
      timestamp: new Date().toISOString()
    };

    conv.messages.push(msg);
    conv.updatedAt = new Date().toISOString();
    await this.save(conv);
    return msg;
  }

  async delete(id) {
    this.conversations.delete(id);
    try { await fs.unlink(path.join(this.storagePath, id + '.json')); } catch (e) {}
  }

  async save(conv) {
    await fs.writeFile(path.join(this.storagePath, conv.id + '.json'), JSON.stringify(conv, null, 2));
  }
}

module.exports = ChatManager;
