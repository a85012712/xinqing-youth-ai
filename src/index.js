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

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

async function init() {
  await vectorStore.init();
  await datasetManager.init();
  await chatManager.init();
  await longTermMemory.init();
  console.log('Server started: http://localhost:'+PORT);
}

app.get('/api/system', (req,res) => {
  res.json({ name:'心晴少年AI', version:'1.0', model:process.env.LLM_MODEL,visionModel:'mimo-v2.5' });
});

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

app.get('/api/conversations', async (req,res) => { res.json({success:true,data:await chatManager.getAll()}); });
app.post('/api/conversations', async (req,res) => { res.json({success:true,data:await chatManager.create()}); });
app.get('/api/conversations/:id', async (req,res) => { const c=await chatManager.get(req.params.id); c?res.json({success:true,data:c}):res.status(404).json({success:false}); });
app.delete('/api/conversations/:id', async (req,res) => { await chatManager.delete(req.params.id); res.json({success:true}); });

app.post('/api/chat', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});
    const conv = await chatManager.get(conversationId);
    const msgs = conv.messages.map(m => ({role:m.role,content:m.content}));
    const sysPrompt = '你是心晴少年AI，一个温暖、理解、专业的青少年心理健康助手。你的职责是：1.倾听和理解青少年的情绪困扰 2.提供心理健康知识科普 3.教授情绪管理和压力应对技巧 4.在必要时引导寻求专业帮助。请用温暖、鼓励的语气回复，避免说教，多用共情。重要提示：你不能替代专业心理咨询，如有严重问题请建议寻求专业帮助。\n\n重要提示：你提供的信息仅供参考，不能替代专业医生的诊断和治疗建议。\n\n系统配置：'+process.env.LLM_MODEL;
    const fullMsgs = [{role:'system',content:sysPrompt},...msgs];
    const result = await llm.chat(fullMsgs, {maxTokens:8192});
    const aiMsg = await chatManager.addMessage(conversationId, {role:'assistant',content:result.content});
    await longTermMemory.add('用户:'+content.substring(0,80)+' 助手:'+result.content.substring(0,80), 'context');
    res.json({success:true,data:{message:aiMsg,conversationId,contextLength:msgs.length+1}});
  } catch(e) { console.error(e); res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/chat/stream', async (req,res) => {
  try {
    let {conversationId,content} = req.body;
    if(!conversationId) { const c=await chatManager.create(); conversationId=c.id; }
    await chatManager.addMessage(conversationId, {role:'user',content});
    const conv = await chatManager.get(conversationId);
    const msgs = conv.messages.map(m => ({role:m.role,content:m.content}));
    const sysPrompt = '你是医学大模型助手，专注于医学健康领域的智能问答系统。\n\n重要提示：你提供的信息仅供参考，不能替代专业医生的诊断和治疗建议。';
    const fullMsgs = [{role:'system',content:sysPrompt},...msgs];

    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');

    let fullContent = '';
    try {
      for await(const chunk of llm.chatStream(fullMsgs,{maxTokens:8192})) {
        if(chunk.type==='thinking') {
          res.write('data:{"type":"thinking","text":'+JSON.stringify(chunk.text)+'}\n\n');
        } else if(chunk.type==='content') {
          fullContent += chunk.text;
          res.write('data:{"type":"content","text":'+JSON.stringify(chunk.text)+'}\n\n');
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

app.get('/api/memory/stats', (req,res) => { res.json({success:true,data:longTermMemory.getStats()}); });
app.get('/api/memory', async (req,res) => { res.json({success:true,data:Array.from(longTermMemory.memories.values()).slice(0,100)}); });

init().then(() => { server.listen(PORT, '0.0.0.0', () => console.log('Server at http://localhost:'+PORT)); });

const VisionAnalyzer=require("./vision/analyzer");
const visionAnalyzer=new VisionAnalyzer();
app.get("/api/system",(req,res)=>{res.json({name:"Medical AI",version:"5.0",model:process.env.LLM_MODEL,visionModel:"mimo-v2.5"})});
app.post("/api/vision/analyze",upload.single("image"),async(req,res)=>{try{if(!req.file)return res.status(400).json({success:false,error:"请上传图片"});var{prompt,conversationId}=req.body;var result=await visionAnalyzer.analyzeImage(req.file.path,prompt);if(!result.success)return res.status(500).json({success:false,error:result.error});if(conversationId){await chatManager.addMessage(conversationId,{role:"user",content:"[上传图片] "+(prompt||"请分析这张医学影像")});await chatManager.addMessage(conversationId,{role:"assistant",content:result.content})}await longTermMemory.add("影像分析: "+result.content.substring(0,100),"context");res.json({success:true,data:{content:result.content,usage:result.usage}})}catch(e){console.error(e);res.status(500).json({success:false,error:e.message})}});