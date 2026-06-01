/**
 * 数据脱敏模块 - 保护患者隐私
 */
const DEFAULT_RULES = {
  name: { type: 'mask', keep: [0, 0], mask: '**' },
  idCard: { type: 'mask', keep: [3, 4], mask: '********' },
  phone: { type: 'mask', keep: [3, 4], mask: '****' },
  address: { type: 'truncate', maxLen: 6 },
  cardNo: { type: 'keep_last', keep: 4 },
};

class Desensitizer {
  constructor(customRules = {}) {
    this.rules = { ...DEFAULT_RULES, ...customRules };
    this.sensitiveKeys = [
      'name','姓名','patientName','patient_name',
      'idCard','身份证','id_card','idNo','身份证号',
      'phone','手机','电话','tel','mobile','联系电话',
      'address','地址','住址','homeAddress',
      'insuranceNo','医保号','社保号',
      'cardNo','卡号','就诊卡号','bankCard','银行卡号','email','邮箱'
    ];
  }

  desensitizeField(value, fieldName) {
    if (!value || typeof value !== 'string') return value;
    const rule = this.matchRule(fieldName);
    if (!rule) return value;
    switch (rule.type) {
      case 'mask': return this.maskValue(value, rule.keep[0], rule.keep[1], rule.mask);
      case 'truncate': return value.substring(0, rule.maxLen) + '***';
      case 'keep_last': return '*'.repeat(Math.max(0, value.length - rule.keep)) + value.slice(-rule.keep);
      case 'remove': return '[已脱敏]';
      default: return value;
    }
  }

  desensitize(data) {
    if (!data || typeof data !== 'object') return data;
    const result = Array.isArray(data) ? [...data] : { ...data };
    for (const key of Object.keys(result)) {
      if (this.isSensitive(key) && typeof result[key] === 'string') {
        result[key] = this.desensitizeField(result[key], key);
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        result[key] = this.desensitize(result[key]);
      }
    }
    return result;
  }

  desensitizeHISData(hisData) {
    if (!hisData) return { desensitized: null, originalFields: [] };
    const desensitizedFields = [];
    const result = { ...hisData };
    if (result.patient) {
      const patient = { ...result.patient };
      for (const key of Object.keys(patient)) {
        if (this.isSensitive(key) && typeof patient[key] === 'string') {
          desensitizedFields.push(key);
          patient[key] = this.desensitizeField(patient[key], key);
        }
      }
      result.patient = patient;
    }
    const textFields = ['chiefComplaint','chief_complaint','presentIllness','pastHistory',
                        'diagnosis','treatment','note','主诉','现病史','既往史','诊断','治疗方案'];
    for (const field of textFields) {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = this.maskTextSensitiveInfo(result[field]);
      }
    }
    return { desensitized: result, originalFields: desensitizedFields };
  }

  maskTextSensitiveInfo(text) {
    if (!text) return text;
    let result = text;
    result = result.replace(/\b(\d{3})\d{11}(\d{4})\b/g, '$1***********$2');
    result = result.replace(/\b(1[3-9]\d)\d{4}(\d{4})\b/g, '$1****$2');
    result = result.replace(/(患者|姓名|病人)\s*[:：]?\s*([\u4e00-\u9fa5]{2,4})/g, '$1：**');
    return result;
  }

  isSensitive(key) {
    const lower = key.toLowerCase();
    return this.sensitiveKeys.some(sk => lower.includes(sk.toLowerCase()));
  }
  matchRule(fieldName) {
    const lower = fieldName.toLowerCase();
    for (const [pattern, rule] of Object.entries(this.rules)) {
      if (lower.includes(pattern.toLowerCase())) return rule;
    }
    return null;
  }
  maskValue(value, keepStart, keepEnd, maskChar) {
    if (value.length <= keepStart + keepEnd) return value;
    return value.substring(0, keepStart) + maskChar + value.slice(-keepEnd);
  }
}

module.exports = Desensitizer;
