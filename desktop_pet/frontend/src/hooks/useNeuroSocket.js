import { useRef, useEffect, useCallback, useState } from 'react';

// WS token will be fetched from /health endpoint at runtime
let _cachedWsToken = '';

async function fetchWsToken() {
  if (_cachedWsToken) return _cachedWsToken;
  try {
    const r = await fetch('/health');
    if (!r.ok) {
      // 可能前端跑在5173，后端在8000
      const r2 = await fetch('http://127.0.0.1:8000/health');
      if (r2.ok) { const d = await r2.json(); _cachedWsToken = d.ws_token || ''; return _cachedWsToken; }
    } else {
      const d = await r.json();
      _cachedWsToken = d.ws_token || '';
      return _cachedWsToken;
    }
  } catch (_e) { /* ignore */ }
  return '';
}

function buildWsUrl(baseUrl, token) {
  if (!token) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function useNeuroSocket(url, onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      // 获取 WS token
      const token = await fetchWsToken();
      const wsUrl = buildWsUrl(url, token);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (_e) {
          onMessageRef.current?.({ type: 'raw', data: event.data });
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
        retryRef.current++;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will handle retry
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [url]);

  const sendPacket = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { sendPacket, connected };
}
