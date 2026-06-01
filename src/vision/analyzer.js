const fs = require('fs').promises;
const path = require('path');

class VisionAnalyzer {
  constructor() {
    this.apiKey = process.env.LLM_API_KEY;
    this.baseUrl = process.env.LLM_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com';
    this.model = 'mimo-v2.5';
  }

  async analyzeImage(imagePath, prompt) {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = this.getMimeType(ext);

      const url = this.baseUrl + '/v1/chat/completions';
      const body = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一位专业的医学影像分析助手。请根据提供的医学影像，给出专业的分析意见。分析要求：1.描述影像基本特征 2.指出可能的异常发现 3.给出初步诊断建议 4.提醒需要进一步检查的方向。重要提示：分析仅供参考，不能替代专业医生诊断。'
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Image } },
              { type: 'text', text: prompt || '请分析这张医学影像，描述主要发现并给出诊断建议。' }
            ]
          }
        ],
        max_tokens: 4096
      };

      console.log('Calling Vision API:', url, 'Model:', this.model);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error('Vision API Error: ' + response.status);
      }

      const data = await response.json();
      return { success: true, content: data.choices[0].message.content, usage: data.usage };
    } catch (error) {
      console.error('Vision analysis error:', error);
      return { success: false, error: error.message };
    }
  }

  async analyzeImageUrl(imageUrl, prompt) {
    try {
      const url = this.baseUrl + '/v1/chat/completions';
      const body = {
        model: this.model,
        messages: [
          { role: 'system', content: '你是一位专业的医学影像分析助手。分析仅供参考，不能替代专业医生诊断。' },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt || '请分析这张医学影像。' }
          ]}
        ],
        max_tokens: 4096
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Vision API Error: ' + response.status);
      const data = await response.json();
      return { success: true, content: data.choices[0].message.content, usage: data.usage };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getMimeType(ext) {
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    return types[ext] || 'image/jpeg';
  }
}

module.exports = VisionAnalyzer;
