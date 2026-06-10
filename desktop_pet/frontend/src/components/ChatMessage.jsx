import { memo } from 'react';
import { renderMessageContent } from '../hooks/useMessageRenderer.jsx';
import PropTypes from 'prop-types';

const SECRET_PATTERNS = [
  { re: /(sk-[a-zA-Z0-9]{8,})/gi, label: 'API_KEY' },
  { re: /(key[a-z_]*[=:]\s*)["']?([a-zA-Z0-9\-_]{16,})["']?/gi, label: 'KEY' },
  { re: /(token[a-z_]*[=:]\s*)["']?([a-zA-Z0-9\-_.]{16,})["']?/gi, label: 'TOKEN' },
  { re: /(secret[a-z_]*[=:]\s*)["']?([a-zA-Z0-9\-_.]{16,})["']?/gi, label: 'SECRET' },
  { re: /(password[a-z_]*[=:]\s*)["']?([^\s"']{6,})["']?/gi, label: 'PASSWORD' },
  { re: /(Bearer\s+)([a-zA-Z0-9\-_.]{16,})/gi, label: 'BEARER' },
  { re: /([a-zA-Z0-9+/]{48,}={1,2})(?=[\s\]|}]|$)/g, label: 'BASE64_SECRET' },
];

function _maskSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const { re, label } of SECRET_PATTERNS) {
    result = result.replace(re, (match, prefix, secret) => {
      if (secret) return `${prefix || ''}[${label} hidden]`;
      return `[${label} hidden]`;
    });
  }
  return result;
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ChatMessage = memo(function ChatMessage({ msg, _index, _onRetry, _onDelete, _lang, copyToClipboard: _copyFn }) {
  const semanticClass = msg.type === 'system'
    ? msg.content?.startsWith('❌') || msg.content?.startsWith('🛑') ? ' error'
    : msg.content?.startsWith('✅') || msg.content?.startsWith('🔗') ? ' success'
    : msg.content?.startsWith('🟢') || msg.content?.startsWith('🔴') || msg.content?.startsWith('📊') || msg.content?.startsWith('🔬') ? ' trade'
    : msg.content?.startsWith('⚠️') || msg.content?.startsWith('🛡️') ? ' warning'
    : ''
    : '';

  return (
    <div
      className={`chat-msg ${msg.type}${semanticClass}`}
      style={{ position: 'relative' }}
      role="article"
      aria-label={`${msg.type} message`}
    >
      <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: 2 }}>{formatTs(msg.ts)}</div>
      {msg.type === 'image' && msg.content?.startsWith('data:image') ? (
        <div>
          <img src={msg.content} alt={msg.alt || 'QR Code'} style={{ maxWidth: '200px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(msg.content, '_blank')} />
          {msg.alt && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{msg.alt}</div>}
        </div>
      ) : msg.type === 'system' && msg.content?.includes('录音中') ? (
        <>
          {msg.content}
          <div className="voice-bars">
            <div className="bar" /><div className="bar" /><div className="bar" /><div className="bar" /><div className="bar" />
          </div>
        </>
      ) : (msg.type === 'system' || msg.type === 'assistant') && typeof msg.content === 'string' && msg.content.includes('\n') ? (
        renderMessageContent(msg.content)
      ) : msg.content}
      {msg.image && (msg.image.startsWith('data:image/') || msg.image.startsWith('/9j/')) && (
        <img src={msg.image} alt="screenshot" className="chat-screenshot" />
      )}
    </div>
  );
}, (prev, next) => prev.msg.ts === next.msg.ts && prev.msg.content === next.msg.content && prev.msg.type === next.msg.type);

export default ChatMessage;

_maskSecrets.propTypes = {
  msg: PropTypes.shape({
      type: PropTypes.any,
      content: PropTypes.any,
      ts: PropTypes.any,
      alt: PropTypes.any,
      image: PropTypes.any
    }),
  index: PropTypes.number,
  onRetry: PropTypes.func,
  onDelete: PropTypes.func,
  lang: PropTypes.string,
  copyToClipboard: PropTypes.func
};
