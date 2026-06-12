import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const ONBOARDING_KEY = 'potato_onboarding_done';

const STEPS = [
  {
    icon: '🔑', title: '配置AI密钥',
    desc: '输入你的AI API Key，至少填一个即可使用。没有？去 deepseek.com 免费获取',
    action: 'key_input',
    keys: [
      { id: 'DEEPSEEK_API_KEY', label: 'DeepSeek', placeholder: 'sk-...', required: true },
      { id: 'SILICON_API_KEY', label: 'SiliconFlow', placeholder: 'sk-...', required: false },
      { id: 'OPENAI_API_KEY', label: 'OpenAI', placeholder: 'sk-...', required: false },
    ]
  },
  { icon: '💬', title: '语音或文字对话', desc: '点击胸口麦克风录音，或直接打字。说"小土豆"也可以唤醒', action: 'chat' },
  { icon: '📈', title: 'AI自主操盘', desc: '设定投入金额后，小土豆自动执行7阶段交易闭环：盘前→选股→分析→下单→盘中→复盘→收仓', action: 'trade' },
  { icon: '🛡️', title: '风控保护', desc: '止损5%/止盈10%/最多3只持仓/稳健模式，全部AI自主管理。在设置面板可以调整参数', action: 'settings' },
  { icon: '⚙️', title: '个性化设置', desc: '右上角设置可以调整音量、透明度、语音唤醒、桌面通知等', action: 'done' },
];

export default function OnboardingWizard({ onComplete, _sendPacket }) {
  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [keyValues, setKeyValues] = useState({});
  const [keyError, setKeyError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (done) { setSkipped(true); onComplete?.(); }
  }, [onComplete]);

  if (skipped) return null;

  const current = STEPS[step];

  const handleNext = async () => {
    // Step 0: validate & save API keys
    if (step === 0) {
      const hasAnyKey = Object.values(keyValues).some(v => v && v.trim().length > 5);
      if (!hasAnyKey) {
        setKeyError('请至少填写一个API Key');
        return;
      }
      setSaving(true);
      setKeyError('');
      try {
        // Save keys via backend API
        for (const [k, v] of Object.entries(keyValues)) {
          if (v && v.trim()) {
            await fetch('/api/secrets/upsert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: k, value: v.trim() })
            });
          }
        }
      } catch (e) {
        // Even if save fails, allow proceeding (demo mode will work)
        console.warn('Failed to save API keys:', e);
      }
      setSaving(false);
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(ONBOARDING_KEY, '1');
      onComplete?.();
    }
  };

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    onComplete?.();
  };

  const handleKeyChange = (keyId, value) => {
    setKeyValues(prev => ({ ...prev, [keyId]: value }));
    if (keyError) setKeyError('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1a1a2e', borderRadius: 20, width: 420, padding: 0, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', border: '1px solid rgba(105,240,174,0.2)' }}>
        <div style={{ padding: '28px 28px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{current.icon}</div>
          <h2 style={{ color: '#69f0ae', margin: '0 0 8px', fontSize: 18 }}>{current.title}</h2>
          <p style={{ color: '#bbb', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>{current.desc}</p>
        </div>

        {/* API Key input fields for step 0 */}
        {step === 0 && current.keys && (
          <div style={{ padding: '0 28px', marginBottom: 16 }}>
            {current.keys.map(k => (
              <div key={k.id} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 4 }}>
                  {k.label} {k.required && <span style={{ color: '#ff6b6b' }}>*</span>}
                </label>
                <input
                  type="password"
                  placeholder={k.placeholder}
                  value={keyValues[k.id] || ''}
                  onChange={e => handleKeyChange(k.id, e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
                    background: '#0d0d1a', border: '1px solid #333', borderRadius: 10,
                    color: '#fff', fontSize: 14, outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = '#69f0ae'}
                  onBlur={e => e.target.style.borderColor = '#333'}
                />
              </div>
            ))}
            {keyError && <p style={{ color: '#ff6b6b', fontSize: 12, margin: '4px 0 0' }}>{keyError}</p>}
          </div>
        )}

        <div style={{ padding: '0 28px 24px' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i === step ? '#69f0ae' : i < step ? '#4a7c3f' : '#333' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={handleSkip} style={{ background: 'none', border: '1px solid #444', borderRadius: 10, padding: '8px 20px', color: '#888', cursor: 'pointer', fontSize: 13 }}>
              跳过
            </button>
            <button
              onClick={handleNext}
              disabled={saving}
              style={{
                background: saving ? '#444' : '#69f0ae', border: 'none', borderRadius: 10,
                padding: '8px 24px', color: saving ? '#888' : '#1a1a2e', cursor: saving ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600
              }}
            >
              {saving ? '保存中...' : step < STEPS.length - 1 ? '下一步' : '开始使用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

OnboardingWizard.propTypes = {
  onComplete: PropTypes.func,
  sendPacket: PropTypes.func
};
