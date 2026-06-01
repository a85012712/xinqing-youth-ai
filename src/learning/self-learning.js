const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

/**
 * 自我学习系统
 * - 从对话中提取知识
 * - 学习用户偏好
 * - 优化回答策略
 * - 知识图谱构建
 */
class SelfLearningSystem {
  constructor(llmClient, longTermMemory) {
    this.llm = llmClient;
    this.memory = longTermMemory;
    this.storagePath = path.join(process.cwd(), 'data', 'learning');
    this.learningHistory = [];
    this.userProfile = {};
  }

  async init() {
    await fs.mkdir(this.storagePath, { recursive: true });
    try {
      const data = await fs.readFile(path.join(this.storagePath, 'profile.json'), 'utf8');
      this.userProfile = JSON.parse(data);
    } catch (e) {
      this.userProfile = {
        preferences: {},
        topics: {},
        interactionCount: 0,
        firstInteraction: new Date().toISOString()
      };
    }
  }

  // 从对话中学习
  async learnFromConversation(messages) {
    if (messages.length < 2) return;

    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // 1. 提取用户偏好
    await this.extractPreferences(userMessages);

    // 2. 提取知识点
    await this.extractKnowledge(messages);

    // 3. 学习对话模式
    await this.learnPatterns(messages);

    // 4. 更新用户画像
    this.userProfile.interactionCount++;
    await this.saveProfile();
  }

  // 提取用户偏好
  async extractPreferences(userMessages) {
    const recentMessages = userMessages.slice(-5).map(m => m.content).join('\n');
    
    try {
      const result = await this.llm.chat([
        {
          role: 'system',
          content: `分析以下用户消息，提取用户偏好。返回JSON格式：
{
  "language": "偏好语言",
  "style": "回答风格偏好",
  "topics": ["感兴趣的话题"],
  "expertise": "专业水平"
}`
        },
        { role: 'user', content: recentMessages }
      ], { maxTokens: 200 });

      const prefs = JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      // 合并偏好
      for (const [key, value] of Object.entries(prefs)) {
        if (value) {
          this.userProfile.preferences[key] = value;
        }
      }

      // 保存到长期记忆
      await this.memory.add(
        '用户偏好: ' + JSON.stringify(prefs),
        'preference',
        { source: 'auto-extracted' }
      );
    } catch (e) {
      // 静默失败
    }
  }

  // 提取知识点
  async extractKnowledge(messages) {
    const conversation = messages.map(m => m.role + ': ' + m.content).join('\n');
    
    try {
      const result = await this.llm.chat([
        {
          role: 'system',
          content: `从对话中提取有价值的知识点。返回JSON数组：
[{"fact": "知识点", "category": "类别", "confidence": 0.9}]
只提取明确、有价值的知识，不要提取问候语等。`
        },
        { role: 'user', content: conversation }
      ], { maxTokens: 500 });

      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) {
        const facts = JSON.parse(match[0]);
        for (const fact of facts) {
          if (fact.confidence > 0.7) {
            await this.memory.add(
              fact.fact,
              'knowledge',
              { category: fact.category, confidence: fact.confidence }
            );
          }
        }
      }
    } catch (e) {}
  }

  // 学习对话模式
  async learnPatterns(messages) {
    // 记录常见问题类型
    const userQuestions = messages.filter(m => m.role === 'user').map(m => m.content);
    
    for (const q of userQuestions) {
      const topic = this.categorizeQuestion(q);
      this.userProfile.topics[topic] = (this.userProfile.topics[topic] || 0) + 1;
    }
  }

  // 问题分类
  categorizeQuestion(question) {
    const patterns = {
      'programming': /代码|编程|函数|变量|bug|错误|调试/i,
      'data': /数据|分析|统计|报表|查询|SQL/i,
      'writing': /写|文案|文档|邮件|报告/i,
      'knowledge': /什么是|如何|为什么|解释|介绍/i,
      'task': /帮我|请|能否|可以/i
    };

    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.test(question)) return category;
    }
    return 'general';
  }

  // 获取用户画像
  getUserProfile() {
    return {
      ...this.userProfile,
      topTopics: Object.entries(this.userProfile.topics || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }

  // 获取学习建议
  async getLearningSuggestions() {
    const stats = this.memory.getStats();
    const suggestions = [];

    if (stats.byCategory.preference < 3) {
      suggestions.push('继续对话以让我更好地了解您的偏好');
    }

    if (stats.total < 10) {
      suggestions.push('多交流可以帮助我学习更多知识');
    }

    return suggestions;
  }

  // 生成个性化提示词
  async getPersonalizedPrompt() {
    const prefs = this.userProfile.preferences;
    let prompt = '';

    if (prefs.language === '中文') {
      prompt += '请用中文回答。';
    }

    if (prefs.style === '简洁') {
      prompt += '请简洁回答。';
    } else if (prefs.style === '详细') {
      prompt += '请详细解释。';
    }

    if (prefs.expertise === '初学者') {
      prompt += '用户是初学者，请用通俗易懂的语言解释。';
    } else if (prefs.expertise === '专家') {
      prompt += '用户是专业人士，可以使用专业术语。';
    }

    return prompt;
  }

  async saveProfile() {
    await fs.writeFile(
      path.join(this.storagePath, 'profile.json'),
      JSON.stringify(this.userProfile, null, 2)
    );
  }
}

module.exports = SelfLearningSystem;
