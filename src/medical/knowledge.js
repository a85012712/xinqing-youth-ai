/**
 * 医疗知识模块 - 多科室支持
 */
const SPECIALTIES = {
  psychology: { name:'心理科', aliases:['心理','精神','情绪'], keywords:['抑郁','焦虑','失眠','情绪','压力','自杀','自残','厌学','叛逆','霸凌','孤独','自卑'] },
  internal: { name:'内科', aliases:['内科','呼吸','消化','心血管'], keywords:['发热','咳嗽','头痛','胸闷','心慌','腹痛','腹泻','高血压','糖尿病','冠心病','肺炎'] },
  surgery: { name:'外科', aliases:['外科','骨科','普外'], keywords:['骨折','外伤','肿块','疝气','阑尾','胆囊','甲状腺','腰椎','膝关节','椎间盘'] },
  general: { name:'全科', aliases:['全科','综合','门诊'], keywords:['感冒','发烧','过敏','皮疹','疲劳','乏力','食欲不振'] },
  pediatrics: { name:'儿科', aliases:['儿科','小儿','儿童'], keywords:['小儿','婴儿','宝宝','发育','疫苗','湿疹','手足口','哮喘'] },
  gynecology: { name:'妇产科', aliases:['妇产','妇科'], keywords:['月经','痛经','怀孕','产检','不孕'] },
  dermatology: { name:'皮肤科', aliases:['皮肤'], keywords:['皮疹','痘痘','湿疹','荨麻疹','瘙痒'] },
  ent: { name:'耳鼻喉科', aliases:['耳鼻喉','五官科'], keywords:['耳鸣','鼻塞','鼻炎','咽喉','扁桃体'] },
  ophthalmology: { name:'眼科', aliases:['眼科'], keywords:['视力','近视','散光','眼红','干眼'] }
};

const EMERGENCY_KEYWORDS = ['胸痛','呼吸困难','大出血','昏迷','抽搐','休克','心梗','脑梗','中风','窒息'];
const CRISIS_KEYWORDS = ['自杀','轻生','不想活','想死','去死','活不下去','结束生命','割腕','跳楼','喝药','上吊'];

class MedicalKnowledge {
  constructor() { this.specialties = SPECIALTIES; }

  detectSpecialty(text) {
    if (!text) return null;
    const scores = {};
    for (const [key, spec] of Object.entries(this.specialties)) {
      let score = 0;
      for (const kw of spec.keywords) { if (text.includes(kw)) score++; }
      for (const alias of spec.aliases) { if (text.includes(alias)) score += 2; }
      if (score > 0) scores[key] = score;
    }
    if (Object.keys(scores).length === 0) return null;
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return { specialty: sorted[0][0], name: this.specialties[sorted[0][0]].name, confidence: Math.min(sorted[0][1]/3, 1) };
  }

  isEmergency(text) { return EMERGENCY_KEYWORDS.some(kw => text.includes(kw)); }
  isCrisis(text) { return CRISIS_KEYWORDS.some(kw => text.includes(kw)); }

  buildHISPrompt(options = {}) {
    const { specialty, chiefComplaint, diagnosis, patientInfo } = options;
    let prompt = `你是心晴医疗大模型，请根据以下信息给出诊断建议：\n\n## 诊疗规则\n1. 给出鉴别诊断（2-3个）\n2. 建议进一步检查\n3. 提供治疗方案\n4. 标注注意事项\n\n`;
    if (specialty) prompt += `## 当前科室：${this.specialties[specialty]?.name || specialty}\n`;
    if (patientInfo) prompt += `## 患者（已脱敏）\n门诊号：${patientInfo.outpatientNo||'未知'}\n年龄：${patientInfo.age||'未知'}\n性别：${patientInfo.gender||'未知'}\n`;
    if (chiefComplaint) prompt += `## 主诉\n${chiefComplaint}\n`;
    if (diagnosis) prompt += `## 初步诊断\n${diagnosis}\n`;
    prompt += `\n⚠️ 以上分析仅供参考，最终以医生诊断为准。`;
    return prompt;
  }

  listSpecialties() {
    return Object.entries(this.specialties).map(([key, spec]) => ({ key, name: spec.name }));
  }
}

module.exports = MedicalKnowledge;
