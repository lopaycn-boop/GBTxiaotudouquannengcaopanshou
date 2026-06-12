/**
 * 声控动作映射 — 中文语音指令 → Live2D 肢体动作/表情
 * 适配 Lisette 真人动作文件，支持模糊匹配fallback
 * 
 * 使用方法：
 *   import { parseVoiceCommand } from './voiceMotionMap'
 *   const actions = parseVoiceCommand(voiceText)
 *   actions.forEach(a => live2dRef.current[a.method](...a.args))
 */

// ── Lisette 实际动作文件列表 ──
// Animations: angry_idle, breathing, fling_scissors, frenzy_idle, hair_cut,
//   hand_fiddle_idle, happy_transition, hello_ani, jump_ani, run_idle,
//   sad_idle, sans_eye_glow_idle, shy_idle, sukaato_no_naka_ani, walking_idle
// Motions: Curious, Excited, Happy, Idle, Komi, Menacing, Panting, Shy

// ── 肢体动作映射 ──
// motion 名支持模糊匹配，会自动命中 Lisette 的真实动作文件
const MOTION_MAP = [
  // 打招呼系列
  { match: /挥手|拜拜|再见|bye|你好|嗨|hi|hello|打招呼/i,   motion: 'hello_ani',     desc: '挥手打招呼' },
  { match: /招手|过来|过来呀/i,                                motion: 'hello_ani',     desc: '招手' },

  // 跳跃系列
  { match: /跳|跳一下|蹦|蹦跶|jump/i,                         motion: 'jump_ani',      desc: '跳跃' },

  // 跑步/走路
  { match: /跑|快跑|逃跑|run/i,                               motion: 'run_idle',       desc: '跑步' },
  { match: /走|走路|散步|步行/i,                              motion: 'walking_idle',   desc: '走路' },

  // 情绪动作（Lisette 原生支持）
  { match: /害羞|羞羞|脸红|shy/i,                             motion: 'shy_idle',       desc: '害羞扭捏' },
  { match: /生气|哼|讨厌|烦|angry/i,                          motion: 'angry_idle',     desc: '生气跺脚' },
  { match: /难过|伤心|sad|哭|呜呜|好惨/i,                     motion: 'sad_idle',       desc: '伤心难过' },
  { match: /兴奋|激动|疯狂|燃|frenzy|excited/i,               motion: 'frenzy_idle',    desc: '兴奋疯狂' },
  { match: /高兴|开心|happy|笑|哈哈|乐/i,                     motion: 'happy_transition', desc: '开心转圈' },

  // 特殊动作
  { match: /呼吸|breath/i,                                     motion: 'breathing',       desc: '深呼吸' },
  { match: /甩剪刀|扔剪刀|fiing/i,                            motion: 'fling_scissors',  desc: '甩剪刀' },
  { match: /剪头发|理发|haircut/i,                            motion: 'hair_cut',        desc: '剪头发' },
  { match: /玩手|把玩|fiddle/i,                               motion: 'hand_fiddle_idle', desc: '玩手指' },
  { match: /裙摆|裙子|skirt/i,                                motion: 'sukauto_no_naka_ani', desc: '撩裙子' },
  { match: /眼睛发光|发光|glow/i,                             motion: 'sans_eye_glow_idle', desc: '眼睛发光' },

  // Motions 文件夹动作
  { match: /好奇|curious|探索/i,                              motion: 'Curious',         desc: '好奇张望' },
  { match: /安静|发呆|idle|无聊|放空/i,                       motion: 'Idle',            desc: '安静待机' },
  { match: /喘气|累|panting/i,                                motion: 'Panting',         desc: '气喘吁吁' },
  { match: /威慑|压迫|menacing/i,                             motion: 'Menacing',        desc: '威慑姿态' },
  { match: /转圈|旋转|扭|跳舞|跳舞吧|dance/i,                 motion: 'Excited',         desc: '兴奋跳舞' },
  { match: /装可爱|卖萌|萌|可爱/i,                            motion: 'Happy',           desc: '卖萌可爱' },

  // 组合动作（多个映射确保命中）
  { match: /飞吻|么么哒|亲|kiss/i,                            motion: 'happy_transition', desc: '飞吻(开心)' },
  { match: /敬礼|立正|军礼/i,                                 motion: 'hello_ani',       desc: '敬礼(打招呼)' },
  { match: /举手|报告|我有话说/i,                             motion: 'hello_ani',       desc: '举手' },
  { match: /比心|爱心|比❤|爱你/i,                             motion: 'Happy',           desc: '比心(开心)' },
  { match: /耶|yeah|✌|比二|剪刀手/i,                         motion: 'Happy',           desc: '剪刀手(开心)' },
  { match: /鼓掌|棒|厉害|太强了/i,                            motion: 'Excited',         desc: '鼓掌(兴奋)' },
  { match: /抱抱|抱一下|求抱/i,                               motion: 'shy_idle',        desc: '抱抱(害羞)' },
  { match: /鞠躬|谢谢|感谢/i,                                 motion: 'hello_ani',       desc: '鞠躬感谢' },
  { match: /伸懒腰|伸个懒腰|好累/i,                           motion: 'breathing',       desc: '伸懒腰(深呼吸)' },
  { match: /打拳|出拳|嘿咻/i,                                 motion: 'Menacing',        desc: '出拳(威慑)' },
  { match: /点头|好的|嗯嗯|同意/i,                            motion: 'Idle',            desc: '点头' },
  { match: /摇头|不不|不行|不要/i,                            motion: 'shy_idle',        desc: '摇头害羞' },
  { match: /思考|想想|让我想想|嗯\.\.\.|think/i,              motion: 'Curious',         desc: '思考中' },
  { match: /害怕|好怕|恐惧|吓/i,                              motion: 'sad_idle',        desc: '害怕发抖' },
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
 * 纯动作指令只触发AI助手动作，不走AI对话
 */
export function isPureMotionCommand(text) {
  if (!text) return false
  const purePatterns = [
    /^挥[手一]/, /^拜拜$/, /^再见$/, /^bye$/i, /^你好$/, /^嗨$/, /^hi$/i, /^hello$/i,
    /^跳[一下]?$/, /^蹦[一下]?$/, /^jump$/i,
    /^跑[一下]?$/, /^快跑$/, /^走[路一]?$/, /^散步$/,
    /^转圈$/, /^旋转$/, /^扭[一一]?扭$/,
    /^比心$/, /^爱心$/, /^耶$/, /^yeah$/i, /^✌$/, /^比二$/, /^剪刀手$/,
    /^鼓掌$/, /^抱抱$/, /^飞吻$/, /^么么哒$/, /^亲[一个]?$/,
    /^敬礼$/, /^鞠躬$/, /^伸懒腰$/, /^伸个?懒腰$/, /^打拳$/, /^出拳$/,
    /^招手$/, /^举[手一]$/, /^过来$/,
    /^点头$/, /^摇头$/, /^跳舞$/, /^dance$/i,
    /^装可爱$/, /^卖萌$/, /^发呆$/, /^卖个萌$/, /^可爱$/,
    /^害羞$/, /^羞羞$/, /^生气$/, /^哼$/, /^难过$/, /^伤心$/,
    /^哭$/, /^呜呜$/, /^好惨$/, /^开心$/, /^笑$/, /^哈哈$/,
    /^兴奋$/, /^激动$/, /^好奇$/, /^喘气$/, /^好累$/,
    /^眼睛发光$/, /^发光$/, /^甩剪刀$/,
    /^玩手$/, /^裙摆$/, /^呼吸$/, /^breath$/i,
    /^害怕$/, /^好怕$/, /^恐惧$/, /^吓[死]?$/,
    /^威慑$/, /^安静$/, /^卖个萌$/,
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
