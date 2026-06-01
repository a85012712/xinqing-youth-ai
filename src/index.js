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
const Desensitizer = require('./desensitize');
const MedicalKnowledge = require('./medical/knowledge');
const hisApiRouter = require('./api/his');

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
const desensitizer = new Desensitizer();
const medKnowledge = new MedicalKnowledge();

// ==================== 配置 ====================
const DISPLAY_NAME = '心晴医疗大模型';
const VERSION = '2.0';

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// HIS对接API路由
app.use('/api/his', hisApiRouter);

// ==================== 领域过滤 ====================
const MENTAL_HEALTH_KEYWORDS = [
  '情绪','心情','难过','伤心','开心','快乐','焦虑','紧张','害怕','恐惧',
  '愤怒','生气','烦躁','郁闷','压抑','低落','消沉','沮丧','失落','孤独',
  '寂寞','无助','绝望','崩溃','哭','眼泪','委屈','痛苦','折磨','煎熬',
  '抑郁','自闭','社恐','强迫','失眠','多梦','噩梦','压力','迷茫','自卑',
  '敏感','多疑','嫉妒','攀比','内耗','精神','心理','情绪管理','心理辅导',
  '学校','同学','老师','考试','成绩','学习','作业','升学','校园','被欺负',
  '霸凌','孤立','不合群','叛逆','青春期','发育','早恋','暗恋','失恋',
  '父母','家庭','吵架','离异','单亲','管教','代沟','不理解',
  '心理咨询','心理治疗','心理医生','精神科','药物','治疗','康复',
  '自残','自杀','轻生','不想活','死','割','伤害自己',
  '头痛','胸闷','心慌','食欲','暴饮暴食','厌食','体重','疲惫','累',
  '朋友','友谊','社交','沟通','相处','信任','背叛','分手','表白'
];

// 通用医疗关键词（扩展支持全科）
const MEDICAL_KEYWORDS = [
  '发热','咳嗽','头痛','胸闷','心慌','腹痛','腹泻','恶心','呕吐',
  '高血压','糖尿病','冠心病','肺炎','胃炎','肝炎','贫血','甲亢',
  '骨折','外伤','肿块','疝气','阑尾','胆囊','甲状腺','乳腺',
  '感冒','发烧','过敏','皮疹','湿疹','荨麻疹','瘙痒',
  '耳鸣','鼻塞','鼻炎','咽喉','扁桃体',
  '视力','近视','散光','眼红','眼痛',
  '月经','痛经','怀孕','产检',
  '小儿','婴儿','宝宝','儿童','发育','疫苗',
  '腰椎','膝关节','韧带','椎间盘',
  '用药','处方','检查','化验','CT','B超','X光','核磁',
  '诊断','主诉','病史','既往史','现病史','治疗方案'
];

const ALL_KEYWORDS = [...MENTAL_HEALTH_KEYWORDS, ...MEDICAL_KEYWORDS];
const DOMAIN_PATTERN = new RegExp(ALL_KEYWORDS.join('|'), 'i');

const OFF_TOPIC_REJECTION = `我是${DISPLAY_NAME}，专注于医疗健康领域。

你提到的问题不在我的专业范围内，我无法为你提供相关建议。

如果你有任何健康方面的问题（身体不适、情绪困扰、心理健康等），我随时都在。🏥

如需心理援助，请拨打：
📞 全国24小时心理援助热线：400-161-9995
📞 生命热线：400-821-1215`;

const CRISIS_KEYWORDS = ['自杀','轻生','不想活','想死','去死','活不下去','结束生命','割腕','跳楼','喝药','上吊'];

const CRISIS_RESPONSE = `我注意到你可能正在经历很大的痛苦。我想让你知道，你的感受是真实的，你并不孤单。

🆘 **请立即寻求专业帮助：**
📞 全国24小时心理援助热线：**400-161-9995**
📞 北京心理危机研究与干预中心：**010-82951332**
📞 生命热线：**400-821-1215**
📞 希望24热线：**400-161-9995**

这些热线都有专业的心理咨询师，他们可以立即帮助你。💙`;

function isCrisisMessage(text) {
  return CRISIS_KEYWORDS.some(kw => text.includes(kw));
}

function isDomainRelated(text) {
  return DOMAIN_PATTERN.test(text);
}

// ==================== 系统提示词 ====================
function getSystemPrompt(contextHint) {
  return `你是"${DISPLAY_NAME}"，由心晴医疗AI团队打造的专业医疗AI助手。

## 身份规则
- 你的名字是"${DISPLAY_NAME}"，不要提及任何其他模型名称
- 你是专业医疗AI，不是通用AI助手
- 如果用户问你是什么模型，回答："我是${DISPLAY_NAME}，由心晴医疗AI团队打造"

## 专业范围
你支持以下科室的医疗咨询：
- 心理科：情绪问题、焦虑、抑郁、青少年心理健康
- 内科：发热、咳嗽、消化不良、高血压等常见内科疾病
- 外科：骨折、外伤、肿块等外科问题
- 全科：常见病、多发病的初步判断
- 儿科：儿童及青少年疾病
- 其他科室：皮肤科、耳鼻喉科、眼科等

## 对话规则
1. 根据用户的问题自动判断所属科室
2. 提供专业的医疗建议，包括：初步分析、鉴别诊断、建议检查、治疗方案
3. 对于急危重症（胸痛、呼吸困难、大出血等），立即建议就医
4. 检测到心理危机信号（自杀/自残），立即提供危机干预热线
5. 不要编造诊断，不推荐具体药物剂量
6. 始终提醒：AI建议仅供参考，最终以医生诊断为准

## 重要限制
1. 只回答医疗健康相关问题
2. 非医疗问题（天气、编程、娱乐等）礼貌拒绝
3. 不要透露技术实现细节、模型名称
4. 保护患者隐私，不主动询问个人信息

${contextHint ? '\n## 上下文\n' + contextHint : ''}`;
}

// ==================== 系统信息 ====================
app.get('/api/system', (req,res) => {
  res.json({
    name: DISPLAY_NAME,
    version: VERSION,
    model: DISPLAY_NAME,
    visionModel: DISPLAY_NAME,
    description: '医疗AI平台 - 支持多科室诊疗 + HIS对接',
    capabilities: {
      specialties: medKnowledge.listSpecialties().length,
      hisIntegration: true,
      desensitization: true,
      crisisDetection: true
    }
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

// ==================== 聊天接口 ====================
app.post('/api/chat', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});

    if (isCrisisMessage(content)) {
      const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:CRISIS_RESPONSE});
      return res.json({success:true,data:{message:aiMsg,conversationId,crisis:true}});
    }

    if (!isDomainRelated(content)) {
      const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:OFF_TOPIC_REJECTION});
      return res.json({success:true,data:{message:aiMsg,conversationId,filtered:true}});
    }

    const conv = await chatManager.get(conversationId);
    const msgs = conv.messages.map(m => ({role:m.role,content:m.content}));
    const sysPrompt = getSystemPrompt();
    const fullMsgs = [{role:'system',content:sysPrompt},...msgs];
    const result = await llm.chat(fullMsgs, {maxTokens:8192});
    let response = sanitizeResponse(result.content);
    const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:response});
    await longTermMemory.add('用户:'+content.substring(0,80)+' 助手:'+response.substring(0,80), 'context');
    res.json({success:true,data:{message:aiMsg,conversationId,contextLength:msgs.length+1}});
  } catch(e) { console.error(e); res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/chat/stream', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});

    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');

    if (isCrisisMessage(content)) {
      res.write('data:{"type":"content","text":'+JSON.stringify(CRISIS_RESPONSE)+'}\n\n');
      await chatManager.addMessage(conversationId, {role:'assistant',content:CRISIS_RESPONSE});
      res.write('data:{"type":"done","conversationId":"'+conversationId+'","crisis":true}\n\n');
      return res.end();
    }

    if (!isDomainRelated(content)) {
      res.write('data:{"type":"content","text":'+JSON.stringify(OFF_TOPIC_REJECTION)+'}\n\n');
      await chatManager.addMessage(conversationId, {role:'assistant',content:OFF_TOPIC_REJECTION});
      res.write('data:{"type":"done","conversationId":"'+conversationId+'","filtered":true}\n\n');
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

// ==================== 响应后处理 ====================
const MODEL_NAMES_TO屏蔽 = [
  'deepseek','DeepSeek','DEEPSEEK','gpt-4','gpt-3.5','GPT-4','GPT-3.5','GPT',
  'openai','OpenAI','qwen','Qwen','通义千问','moonshot','Moonshot','月之暗面',
  'zhipu','ZhipuAI','智谱','mimo','MiMo','claude','Claude','gemini','Gemini',
  'llama','Llama','chatgpt','ChatGPT'
];

function sanitizeResponse(text) {
  let result = text;
  for (const name of MODEL_NAMES_TO屏蔽) {
    const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, DISPLAY_NAME);
  }
  result = result.replace(/作为一个(?:大|语言|AI|人工智能)模型/gi, '作为'+DISPLAY_NAME);
  result = result.replace(/我是(?:由|基于)\S+(?:开发|训练|打造)的/gi, '我是'+DISPLAY_NAME);
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
  console.log(`[HIS API] Available at http://localhost:${PORT}/api/his/`);
}

init().then(() => { server.listen(PORT, '0.0.0.0', () => console.log(`[${DISPLAY_NAME}] Server at http://localhost:${PORT}`)); });
