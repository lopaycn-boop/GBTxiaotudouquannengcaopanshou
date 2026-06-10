/**
 * 声控动作映射 — 中文语音指令 → Live2D 肢体动作/表情
 * 
 * 使用方法：
 *   import { parseVoiceCommand } from './voiceMotionMap'
 *   const actions = parseVoiceCommand(voiceText)
 *   actions.forEach(a => live2dRef.current[a.method](...a.args))
 */

// ── 肢体动作映射 ──
// key: 正则匹配中文指令, motion: Live2D motion group
const MOTION_MAP = [
  // 手臂动作
  { match: /挥手|拜拜|再见|bye/i,          motion: 'Wave',           desc: '挥手' },
  { match: /招手|过来|过来呀/i,             motion: 'Wave',           desc: '招手' },
  { match: /举手|报告|我有话说/i,           motion: 'Point',          desc: '举手' },
  { match: /指一指|指一下|指向/i,           motion: 'Point',          desc: '指向' },
  { match: /比心|爱心|比❤|爱你/i,           motion: 'Heart',          desc: '比心' },
  { match: /耶|yeah|✌|比二|剪刀手/i,       motion: 'Peace',          desc: '剪刀手' },
  { match: /鼓掌|棒|厉害|太强了/i,          motion: 'Clap',           desc: '鼓掌' },
  { match: /握手|握个手|合作/i,             motion: 'Handshake',      desc: '握手' },
  { match: /抱抱|抱一下|求抱/i,             motion: 'Hug',            desc: '抱抱' },
  
  // 全身动作
  { match: /跳|跳一下|蹦|蹦跶/i,           motion: 'Jump',           desc: '跳跃' },
  { match: /转圈|转一圈|旋转/i,             motion: 'Spin',           desc: '转圈' },
  { match: /跑|快跑|逃跑/i,                 motion: 'Run',            desc: '跑步' },
  { match: /站|站起来|起立/i,               motion: 'Stand',          desc: '站立' },
  { match: /坐|坐下|休息/i,                 motion: 'Sit',            desc: '坐下' },
  { match: /鞠躬|谢谢|感谢/i,              motion: 'Bow',            desc: '鞠躬' },
  { match: /扭|扭一扭|跳舞|跳舞吧|dance/i,  motion: 'Dance',          desc: '跳舞' },
  { match: /伸懒腰|伸个懒腰|好累/i,         motion: 'Stretch',        desc: '伸懒腰' },
  { match: /弯腰|捡|掉/i,                   motion: 'Bend',           desc: '弯腰' },
  { match: /打拳|出拳|嘿咻/i,              motion: 'Punch',          desc: '出拳' },
  { match: /飞吻|么么哒|亲/i,              motion: 'Kiss',           desc: '飞吻' },
  { match: /敬礼|立正|军礼/i,              motion: 'Salute',         desc: '敬礼' },
  { match: /摇头|不不|不行|不要/i,          motion: 'ShakeHead',      desc: '摇头' },
  { match: /点头|好的|嗯嗯|同意/i,         motion: 'Nod',            desc: '点头' },

  // Lisette 特殊动画
  { match: /害羞|羞羞|脸红/i,              motion: 'Shy',            desc: '害羞' },
  { match: /生气|哼|讨厌|烦/i,             motion: 'Angry',          desc: '生气' },
  { match: /哭|呜呜|好惨|伤心/i,           motion: 'Cry',            desc: '哭' },
  { match: /笑|哈哈|开心|乐/i,             motion: 'Laugh',          desc: '大笑' },
  { match: /思考|想想|让我想想|嗯\.\.\./i, motion: 'Think',          desc: '思考' },
  { match: /害怕|好怕|恐惧|吓/i,           motion: 'Scared',         desc: '害怕' },
  { match: /装可爱|卖萌|萌/i,              motion: 'Cute',           desc: '卖萌' },
  { match: /发呆|无聊|放空/i,              motion: 'Daze',           desc: '发呆' },
  { match: /打招呼|你好|嗨|hi/i,           motion: 'Greet',          desc: '打招呼' },
]

// ── 表情映射 ──
const EXPRESSION_MAP = [
  { match: /开心|高兴|棒|太好了/i,        expression: 'happy',  desc: '开心' },
  { match: /害羞|脸红|羞/i,              expression: 'shy',    desc: '害羞' },
  { match: /生气|愤怒|哼/i,              expression: 'angry',  desc: '生气' },
  { match: /惊讶|天哪|哇/i,              expression: 'surprised', desc: '惊讶' },
  { match: /难过|伤心|哭/i,              expression: 'sad',    desc: '难过' },
  { match: /思考|想想|嗯\.\.\./i,         expression: 'thinking', desc: '沉思' },
  { match: /嘟嘴|哼/i,                   expression: 'pout',   desc: '嘟嘴' },
  { match: /委屈|呜/i,                   expression: 'cry',    desc: '委屈' },
  { match: /眨眼|抛媚眼/i,               expression: 'blink',  desc: '眨眼' },
  { match: /吐舌|调皮/i,                 expression: 'tongue', desc: '吐舌' },
  { match: /脸红|红了/i,                 expression: 'blush',  desc: '脸红' },
  { match: /哭|泪目|流泪/i,              expression: 'tears',  desc: '泪目' },
  { match: /猫耳|喵/i,                   expression: 'catear', desc: '猫耳' },
]

/**
 * 解析语音文本，返回需要执行的动作列表
 * @param {string} text - 语音识别文本
 * @returns {Array<{type: 'motion'|'expression', method: string, args: Array, desc: string}>}
 */
export function parseVoiceCommand(text) {
  if (!text || typeof text !== 'string') return []
  
  const actions = []
  
  // 优先匹配肢体动作（动作比表情更有表现力）
  for (const rule of MOTION_MAP) {
    if (rule.match.test(text)) {
      actions.push({
        type: 'motion',
        method: 'playMotionByName',
        args: [rule.motion],
        desc: rule.desc,
      })
      break // 一个语音指令只触发一个动作
    }
  }
  
  // 附加表情（可以和动作叠加）
  for (const rule of EXPRESSION_MAP) {
    if (rule.match.test(text)) {
      actions.push({
        type: 'expression',
        method: 'showExpression',
        args: [rule.expression, true],
        desc: rule.desc,
      })
      break
    }
  }
  
  return actions
}

/**
 * 检查文本是否是纯动作指令（不需要AI回复的动作口令）
 * 纯动作指令只触发桌宠动作，不走AI对话
 */
export function isPureMotionCommand(text) {
  if (!text) return false
  const purePatterns = [
    /^挥[手一]/, /^拜拜$/, /^再见$/, /^bye$/i,
    /^跳[一下]?$/, /^蹦[一下]?$/, /^转圈$/, /^旋转$/,
    /^比心$/, /^爱心$/, /^耶$/, /^yeah$/i, /^✌$/,
    /^鼓掌$/, /^抱抱$/, /^飞吻$/, /^么么哒$/,
    /^敬礼$/, /^鞠躬$/, /^伸懒腰$/, /^打拳$/,
    /^招手$/, /^举[手一]$/, /^比二$/, /^剪刀手$/,
    /^点头$/, /^摇头$/, /^跳舞$/, /^dance$/i,
    /^装可爱$/, /^卖萌$/, /^发呆$/, /^卖个萌$/,
    /^扭[一一]?扭$/, /^伸个?懒腰$/,
  ]
  return purePatterns.some(p => p.test(text.trim()))
}

/**
 * 获取所有可用的动作指令（用于帮助提示）
 */
export function getAvailableCommands() {
  const commands = new Set()
  MOTION_MAP.forEach(r => commands.add(r.desc))
  return [...commands]
}
