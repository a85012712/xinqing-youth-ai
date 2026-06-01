const fs = require('fs').promises;
const path = require('path');

class DocumentProcessor {
  constructor() {
    this.chunkSize = 500;
    this.chunkOverlap = 50;
  }

  // 分块文本
  splitText(text, chunkSize = this.chunkSize, overlap = this.chunkOverlap) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }
    return chunks;
  }

  // 处理文本文件
  async processTextFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    return this.splitText(content);
  }

  // 处理文档（简化版，支持txt/md）
  async processDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.txt', '.md', '.json'].includes(ext)) {
      return this.processTextFile(filePath);
    }
    throw new Error('Unsupported file type: ' + ext);
  }
}

module.exports = DocumentProcessor;
