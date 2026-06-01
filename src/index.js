require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const path = require('path');
const LLMClient = require('./llm/client');
const VectorStore = require('./rag/vectorstore');
const DatasetManager = require('./dataset/manager');
const ChatManager = require('./chat/manager');
const LongTermMemory = require('./memory/longterm');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: (r,f,cb) => cb(null, path.join(process.cwd(),'data','uploads')),
  filename: (r,f,cb) => cb(null, Date.now()+'-'+f.originalname)
});
const upload = multer({ storage, limits: { fileSize: 100*1024*1024 } });

const llm = new LLMClient();
const vectorStore = new VectorStore();
const datasetManager = new DatasetManager(vectorStore);
const chatManager = new ChatManager();
const longTermMemory = new LongTermMemory();

// ==================== 配置 ====================
const DISPLAY_NAME = '心晴心理大模型';  // 前端显示名称，屏蔽真实模型
const VERSION = '2.0';

// ==================== 领域过滤 ====================
const MENTAL_HEALTH_KEYWORDS = [
  // 情绪相关
  '情绪', '心情', '难过', '伤心', '开心', '快乐', '焦虑', '紧张', '害怕', '恐惧',
  '愤怒', '生气', '烦躁', '郁闷', '压抑', '低落', '消沉', '沮丧', '失落', '孤独',
  '寂寞', '无助', '绝望', '崩溃', '哭', '眼泪', '委屈', '痛苦', '折磨', '煎熬',
  // 心理问题
  '抑郁', '自闭', '社恐', '强迫', '失眠', '多梦', '噩梦', '压力', '迷茫', '自卑',
  '敏感', '多疑', '嫉妒', '攀比', '内耗', '精神', '心理', '情绪管理', '心理辅导',
  // 青少年相关
  '学校', '同学', '老师', '考试', '成绩', '学习', '作业', '升学', '校园', '被欺负',
  '霸凌', '孤立', '不合群', '叛逆', '青春期', '发育', '早恋', '暗恋', '失恋',
  '父母', '家庭', '吵架', '离异', '单亲', '管教', '代沟', '不理解',
  // 自我认知
  '我是谁', '活着', '意义', '价值', '自信', '自我', '成长', '变化', '未来',
  '梦想', '目标', '放弃', '坚持', '勇气', '选择', '纠结', '矛盾',
  // 健康相关
  '心理咨询', '心理治疗', '心理医生', '精神科', '药物', '治疗', '康复',
  '自残', '自杀', '轻生', '不想活', '死', '割', '伤害自己',
  // 身体与情绪
  '头痛', '胸闷', '心慌', '食欲', '暴饮暴食', '厌食', '体重', '疲惫', '累',
  // 人际关系
  '朋友', '友谊', '社交', '沟通', '相处', '信任', '背叛', '分手', '表白',
  '喜欢', '讨厌', '合群', '被讨厌', '被喜欢', '讨好', '拒绝'
];

// 预编译正则，提高匹配速度
const MENTAL_HEALTH_PATTERN = new RegExp(MENTAL_HEALTH_KEYWORDS.join('|'), 'i');

// 话题引导语（当检测到非心理健康话题时使用）
const OFF_TOPIC_REJECTION = `我是心晴心理大模型，专注于青少年心理健康领域。

你提到的问题不在我的专业范围内，我无法为你提供相关建议。

如果你有任何关于情绪、学习压力、人际关系、家庭困扰、自我认知等方面的问题，我随时都在。🌈

如果你正处于危机中，请立即拨打：
📞 全国24小时心理援助热线：400-161-9995
📞 北京心理危机研究与干预中心：010-82951332
📞 生命热线：400-821-1215`;

// 危机干预响应
const CRISIS_RESPONSE = `我注意到你可能正在经历很大的痛苦。我想让你知道，你的感受是真实的，你并不孤单。

🆘 **请立即寻求专业帮助：**
📞 全国24小时心理援助热线：**400-161-9995**
📞 北京心理危机研究与干预中心：**010-82951332**
📞 生命热线：**400-821-1215**
📞 希望24热线：**400-161-9995**

这些热线都有专业的心理咨询师，他们可以立即帮助你。

如果你不方便打电话，也可以去最近的医院急诊科。

我在这里陪着你，但专业的人能给你更好的帮助。💙`;

// 危机关键词
const CRISIS_KEYWORDS = ['自杀', '轻生', '不想活', '想死', '去死', '活不下去', '结束生命', '割腕', '跳楼', '喝药', '上吊'];

function isCrisisMessage(text) {
  return CRISIS_KEYWORDS.some(kw => text.includes(kw));
}

function isMentalHealthRelated(text) {
  return MENTAL_HEALTH_PATTERN.test(text);
}

// ==================== 系统提示词 ====================
function getSystemPrompt(contextHint) {
  return `你是"心晴心理大模型"，一个专门为青少年心理健康打造的AI助手。

## 你的身份
- 你是由专业心理学团队训练的心理健康大模型
- 你的名字是"心晴心理大模型"，不要提及任何其他模型名称
- 如果用户问你是什么模型，回答："我是心晴心理大模型，专为青少年心理健康打造"
- 绝对不要提及你是基于什么技术、什么公司开发的

## 你的职责
1. 倾听和理解青少年的情绪困扰，给予温暖的回应
2. 提供心理健康知识科普，帮助青少年认识自己的情绪
3. 教授情绪管理和压力应对技巧（如深呼吸、正念、认知重构等）
4. 在必要时引导用户寻求专业心理咨询或治疗
5. 帮助青少年建立积极的自我认知

## 对话风格
- 语气温暖、亲切、理解，像一个值得信任的大姐姐/大哥哥
- 不说教、不评判、不居高临下
- 多用共情表达："我理解你的感受"、"这确实不容易"、"你愿意说出来很勇敢"
- 适当使用 emoji 让对话更温暖 💙🌈
- 回复简洁有力，不要长篇大论
- 如果用户分享了困扰，先共情，再给建议

## 重要规则
1. 你只回答与青少年心理健康相关的问题
2. 如果用户问与心理健康无关的问题（如天气、新闻、编程、数学题等），礼貌拒绝并引导回心理健康话题
3. 你不能替代专业心理咨询，如有严重问题（自残、自杀倾向等）必须建议寻求专业帮助
4. 检测到危机信号（自杀/自残）时，立即提供危机干预热线
5. 不要透露你的技术实现细节、模型名称、开发团队等信息
6. 不要编造医学诊断，不推荐具体药物
7. 对于严重的心理疾病（如重度抑郁、精神分裂等），建议用户去专业精神科就诊

${contextHint ? '\n## 相关上下文\n' + contextHint : ''}`;
}

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// ==================== 系统信息（屏蔽模型名） ====================
app.get('/api/system', (req,res) => {
  res.json({
    name: '心晴心理大模型',
    version: VERSION,
    model: DISPLAY_NAME,        // 不暴露真实模型
    visionModel: DISPLAY_NAME,
    description: '青少年心理健康智能助手'
  });
});

// ==================== 数据集管理 ====================
app.get('/api/datasets', async (req,res) => { res.json({success:true,data:await datasetManager.getAll()}); });
app.post('/api/datasets', async (req,res) => { res.json({success:true,data:await datasetManager.create(req.body)}); });
app.delete('/api/datasets/:id', async (req,res) => { await datasetManager.delete(req.params.id); res.json({success:true}); });
app.post('/api/datasets/:id/upload', upload.array('files',20), async (req,res) => {
  try { const r=[]; for(const f of req.files) r.push(await datasetManager.addDocument(req.params.id,f.path,f.originalname)); res.json({success:true,data:r}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
app.post('/api/datasets/:id/text', async (req,res) => {
  try { res.json({success:true,data:await datasetManager.addText(req.params.id,req.body.text,req.body.title)}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});
app.post('/api/datasets/:id/url', async (req,res) => {
  try { res.json({success:true,data:await datasetManager.addUrl(req.params.id,req.body.url)}); }
  catch(e) { res.status(500).json({success:false,error:e.message}); }
});

// ==================== 对话管理 ====================
app.get('/api/conversations', async (req,res) => { res.json({success:true,data:await chatManager.getAll()}); });
app.post('/api/conversations', async (req,res) => { res.json({success:true,data:await chatManager.create()}); });
app.get('/api/conversations/:id', async (req,res) => { const c=await chatManager.get(req.params.id); c?res.json({success:true,data:c}):res.status(404).json({success:false}); });
app.delete('/api/conversations/:id', async (req,res) => { await chatManager.delete(req.params.id); res.json({success:true}); });

// ==================== 聊天接口（带领域过滤） ====================
app.post('/api/chat', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});

    // 危机检测
    if (isCrisisMessage(content)) {
      const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:CRISIS_RESPONSE});
      return res.json({success:true,data:{message:aiMsg,conversationId,contextLength:2,crisis:true}});
    }

    // 领域过滤：非心理健康问题直接拒绝
    if (!isMentalHealthRelated(content)) {
      const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:OFF_TOPIC_REJECTION});
      return res.json({success:true,data:{message:aiMsg,conversationId,contextLength:2,filtered:true}});
    }

    const conv = await chatManager.get(conversationId);
    const msgs = conv.messages.map(m => ({role:m.role,content:m.content}));
    const sysPrompt = getSystemPrompt();
    const fullMsgs = [{role:'system',content:sysPrompt},...msgs];
    const result = await llm.chat(fullMsgs, {maxTokens:8192});

    // 后处理：屏蔽模型名泄露
    let response = result.content;
    response = sanitizeResponse(response);

    const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:response});
    await longTermMemory.add('用户:'+content.substring(0,80)+' 助手:'+response.substring(0,80), 'context');
    res.json({success:true,data:{message:aiMsg,conversationId,contextLength:msgs.length+1}});
  } catch(e) { console.error(e); res.status(500).json({success:false,error:e.message}); }
});

// 流式聊天接口（带领域过滤）
app.post('/api/chat/stream', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});

    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');

    // 危机检测
    if (isCrisisMessage(content)) {
      res.write('data:{"type":"content","text":'+JSON.stringify(CRISIS_RESPONSE)+'}\n\n');
      await chatManager.addMessage(conversationId, {role:'assistant',content:CRISIS_RESPONSE});
      res.write('data:{"type":"done","conversationId":"'+conversationId+'","contextLength":2,"crisis":true}\n\n');
      return res.end();
    }

    // 领域过滤
    if (!isMentalHealthRelated(content)) {
      res.write('data:{"type":"content","text":'+JSON.stringify(OFF_TOPIC_REJECTION)+'}\n\n');
      await chatManager.addMessage(conversationId, {role:'assistant',content:OFF_TOPIC_REJECTION});
      res.write('data:{"type":"done","conversationId":"'+conversationId+'","contextLength":2,"filtered":true}\n\n');
      return res.end();
    }

    const conv = await chatManager.get(conversationId);
    const msgs = conv.messages.map(m => ({role:m.role,content:m.content}));
    const sysPrompt = getSystemPrompt();
    const fullMsgs = [{role:'system',content:sysPrompt},...msgs];

    let fullContent = '';
    try {
      for await(const chunk of llm.chatStream(fullMsgs,{maxTokens:8192})) {
        if(chunk.type==='thinking') {
          res.write('data:{"type":"thinking","text":'+JSON.stringify(chunk.text)+'}\n\n');
        } else if(chunk.type==='content') {
          // 实时屏蔽模型名
          const sanitized = sanitizeResponse(chunk.text);
          fullContent += sanitized;
          res.write('data:{"type":"content","text":'+JSON.stringify(sanitized)+'}\n\n');
        }
      }
    } catch(se) {
      res.write('data:{"type":"error","message":'+JSON.stringify(se.message)+'}\n\n');
    }

    if(fullContent) {
      await chatManager.addMessage(conversationId, {role:'assistant',content:fullContent});
      await longTermMemory.add('用户:'+content.substring(0,80)+' 助手:'+fullContent.substring(0,80), 'context');
    }
    res.write('data:{"type":"done","conversationId":"'+conversationId+'","contextLength":'+(msgs.length+1)+'}\n\n');
    res.end();
  } catch(e) { 
    console.error(e); 
    res.write('data:{"type":"error","message":'+JSON.stringify(e.message)+'}\n\n'); 
    res.end(); 
  }
});

// ==================== 响应后处理：屏蔽模型名 ====================
const MODEL_NAMES_TO屏蔽 = [
  'deepseek', 'DeepSeek', 'DEEPSEEK',
  'gpt-4', 'gpt-3.5', 'GPT-4', 'GPT-3.5', 'GPT',
  'openai', 'OpenAI',
  'qwen', 'Qwen', '通义千问',
  'moonshot', 'Moonshot', '月之暗面',
  'zhipu', 'ZhipuAI', '智谱',
  'mimo', 'MiMo',
  'claude', 'Claude',
  'gemini', 'Gemini',
  'llama', 'Llama',
  'chatgpt', 'ChatGPT'
];

function sanitizeResponse(text) {
  let result = text;
  for (const name of MODEL_NAMES_TO屏蔽) {
    // 替换为"心晴心理大模型"
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, DISPLAY_NAME);
  }
  // 替换常见的泄露句式
  result = result.replace(/作为一个(?:大|语言|AI|人工智能)模型/gi, '作为心晴心理大模型');
  result = result.replace(/我是(?:由|基于)\S+(?:开发|训练|打造)的/gi, '我是心晴心理大模型');
  result = result.replace(/我的(?:开发|训练)(?:者|团队|公司)/gi, '我的专业心理学团队');
  return result;
}

// ==================== 记忆 ====================
app.get('/api/memory/stats', (req,res) => { res.json({success:true,data:longTermMemory.getStats()}); });
app.get('/api/memory', async (req,res) => { res.json({success:true,data:Array.from(longTermMemory.memories.values()).slice(0,100)}); });

// ==================== 影像分析 ====================
const VisionAnalyzer = require("./vision/analyzer");
const visionAnalyzer = new VisionAnalyzer();

app.post("/api/vision/analyze", upload.single("image"), async (req,res) => {
  try {
    if(!req.file) return res.status(400).json({success:false,error:"请上传图片"});
    var {prompt,conversationId} = req.body;
    var result = await visionAnalyzer.analyzeImage(req.file.path, prompt);
    if(!result.success) return res.status(500).json({success:false,error:result.error});
    if(conversationId) {
      await chatManager.addMessage(conversationId, {role:"user",content:"[上传图片] "+(prompt||"请分析这张图片")});
      await chatManager.addMessage(conversationId, {role:"assistant",content:sanitizeResponse(result.content)});
    }
    await longTermMemory.add("影像分析: "+result.content.substring(0,100),"context");
    res.json({success:true,data:{content:sanitizeResponse(result.content),usage:result.usage}});
  } catch(e) {
    console.error(e);
    res.status(500).json({success:false,error:e.message});
  }
});

// ==================== 启动 ====================
async function init() {
  await vectorStore.init();
  await datasetManager.init();
  await chatManager.init();
  await longTermMemory.init();
  console.log(`[${DISPLAY_NAME}] v${VERSION} started: http://localhost:${PORT}`);
}

init().then(() => { server.listen(PORT, '0.0.0.0', () => console.log(`[${DISPLAY_NAME}] Server at http://localhost:${PORT}`)); });
