/**
 * HIS 对接 API - 标准化RESTful接口
 */
const express = require('express');
const router = express.Router();
const Desensitizer = require('../desensitize');
const MedicalKnowledge = require('../medical/knowledge');

const desensitizer = new Desensitizer();
const medKnowledge = new MedicalKnowledge();

// POST /api/his/analyze - HIS主接口
router.post('/analyze', async (req, res) => {
  try {
    const rawData = req.body;
    if (!rawData.chiefComplaint && !rawData.diagnosis) {
      return res.status(400).json({ success: false, error: '缺少 chiefComplaint 或 diagnosis', code: 'MISSING_PARAMS' });
    }
    const { desensitized, originalFields } = desensitizer.desensitizeHISData(rawData);
    const specialty = rawData.specialty ? { specialty: rawData.specialty, name: medKnowledge.specialties[rawData.specialty]?.name } : medKnowledge.detectSpecialty(rawData.chiefComplaint + ' ' + (rawData.diagnosis || ''));
    const isCrisis = medKnowledge.isCrisis(rawData.chiefComplaint + ' ' + (rawData.diagnosis || ''));
    const isEmergency = medKnowledge.isEmergency(rawData.chiefComplaint + ' ' + (rawData.diagnosis || ''));

    if (isCrisis) {
      return res.json({ success: true, data: { alert: 'CRISIS', alertLevel: 'HIGH', message: '检测到心理危机信号', crisisHotlines: [{ name: '全国24小时心理援助热线', phone: '400-161-9995' }], desensitizedFields: originalFields } });
    }

    const prompt = medKnowledge.buildHISPrompt({ specialty: specialty?.specialty, chiefComplaint: desensitized.chiefComplaint, diagnosis: desensitized.diagnosis, patientInfo: { outpatientNo: rawData.outpatientNo, age: rawData.patient?.age, gender: rawData.patient?.gender } });

    res.json({ success: true, data: { prompt, specialty, emergency: isEmergency ? { alert: 'EMERGENCY', alertLevel: 'HIGH', message: '检测到急危重症关键词' } : null, desensitizedFields: originalFields, desensitizedData: desensitized, timestamp: new Date().toISOString() } });
  } catch (e) { console.error('[HIS API] Error:', e); res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// POST /api/his/diagnose - 诊断建议接口
router.post('/diagnose', async (req, res) => {
  try {
    const { outpatientNo, chiefComplaint, vitalSigns, labResults, imaging } = req.body;
    if (!chiefComplaint) return res.status(400).json({ success: false, error: '缺少 chiefComplaint' });

    const specialty = medKnowledge.detectSpecialty(chiefComplaint);
    let prompt = `你是心晴医疗大模型，请根据以下信息给出诊断建议：\n\n门诊号：${outpatientNo||'未提供'}\n主诉：${chiefComplaint}`;
    if (vitalSigns) { prompt += '\n## 生命体征'; if (vitalSigns.temperature) prompt += `\n- 体温：${vitalSigns.temperature}℃`; if (vitalSigns.bloodPressure) prompt += `\n- 血压：${vitalSigns.bloodPressure}`; }
    if (labResults?.length) { prompt += '\n## 检验结果'; labResults.forEach(l => { prompt += `\n- ${l.name}：${l.result}${l.flag?' ('+l.flag+')':''}`; }); }
    if (imaging?.length) { prompt += '\n## 影像结果'; imaging.forEach(i => { prompt += `\n- ${i.type}（${i.part}）：${i.finding}`; }); }
    prompt += '\n\n请给出：1.鉴别诊断 2.建议检查 3.治疗建议 4.注意事项';

    res.json({ success: true, data: { prompt, specialty, alerts: { emergency: medKnowledge.isEmergency(chiefComplaint), crisis: medKnowledge.isCrisis(chiefComplaint) } } });
  } catch (e) { res.status(500).json({ success: false, error: '服务器内部错误' }); }
});

// POST /api/his/desensitize - 独立脱敏接口
router.post('/desensitize', (req, res) => {
  const { desensitized, originalFields } = desensitizer.desensitizeHISData(req.body);
  res.json({ success: true, data: { desensitized, maskedFields: originalFields } });
});

// GET /api/his/specialties - 科室列表
router.get('/specialties', (req, res) => { res.json({ success: true, data: medKnowledge.listSpecialties() }); });

// GET /api/his/health - 健康检查
router.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'healthy', service: '心晴医疗AI', version: '2.0', capabilities: { specialties: 9, desensitization: true, crisisDetection: true } } });
});

module.exports = router;
