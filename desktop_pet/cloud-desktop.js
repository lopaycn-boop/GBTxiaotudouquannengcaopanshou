/**
 * GBT小土豆云桌面 — 一键启动脚本
 * 启动: node cloud-desktop.js
 * 访问: http://127.0.0.1:6080
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// ═══════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════
const CONFIG = {
  vncHost: '127.0.0.1',
  vncPort: 5900,           // TightVNC 端口
  webPort: 6080,           // noVNC 访问端口
  vncPassword: 'potato88',  // VNC 密码
  novncPath: path.join(__dirname, 'novnc'),
  pythonPath: 'C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
};

let websockifyProcess = null;

// ═══════════════════════════════════════════════════
// 检查 VNC 服务是否运行
// ═══════════════════════════════════════════════════
function checkVNC() {
  return new Promise((resolve) => {
    const net = require('net');
    const client = new net.Socket();
    client.setTimeout(2000);
    client.on('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.on('error', () => {
      client.destroy();
      resolve(false);
    });
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.connect(CONFIG.vncPort, CONFIG.vncHost);
  });
}

// ═══════════════════════════════════════════════════
// 启动 TightVNC 服务
// ═══════════════════════════════════════════════════
function startVNC() {
  return new Promise((resolve, reject) => {
    console.log('[云桌面] 启动 TightVNC 服务...');
    exec('net start tvnserver', (error, stdout, stderr) => {
      // 可能已经在运行，不算错误
      setTimeout(async () => {
        const running = await checkVNC();
        if (running) {
          console.log('[云桌面] ✓ TightVNC 运行中 (端口 ' + CONFIG.vncPort + ')');
          resolve();
        } else {
          reject(new Error('TightVNC 启动失败'));
        }
      }, 2000);
    });
  });
}

// ═══════════════════════════════════════════════════
// 启动 websockify (VNC → WebSocket 代理)
// ═══════════════════════════════════════════════════
function startWebsockify() {
  return new Promise((resolve, reject) => {
    console.log('[云桌面] 启动 websockify 代理...');

    const target = `${CONFIG.vncHost}:${CONFIG.vncPort}`;
    const cmd = CONFIG.pythonPath;
    const args = [
      '-m', 'websockify',
      '--web', CONFIG.novncPath,
      CONFIG.webPort.toString(),
      target
    ];

    websockifyProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: false,
    });

    let started = false;

    websockifyProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[websockify]', msg);
      if (!started && msg.includes('listen')) {
        started = true;
        resolve();
      }
    });

    websockifyProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[websockify]', msg);
      if (!started) {
        // websockify often outputs to stderr
        if (msg.includes('listen') || msg.includes('6080') || msg.includes('running')) {
          started = true;
          resolve();
        }
      }
    });

    websockifyProcess.on('error', (err) => {
      console.error('[websockify] 启动失败:', err.message);
      reject(err);
    });

    websockifyProcess.on('exit', (code) => {
      console.log('[websockify] 进程退出, code=' + code);
      websockifyProcess = null;
    });

    // Timeout fallback
    setTimeout(() => {
      if (!started) {
        console.log('[云桌面] websockify 可能已启动（无确认消息），尝试访问...');
        started = true;
        resolve();
      }
    }, 5000);
  });
}

// ═══════════════════════════════════════════════════
// 注入品牌 CSS 到 noVNC
// ═══════════════════════════════════════════════════
function injectBrandCSS() {
  const brandCSS = `
/* ═══ GBT小土豆品牌主题 ═══ */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

#noVNC_control_bar {
  background: linear-gradient(180deg, #0a0a2e 0%, #111128 100%) !important;
  border-right: 1px solid rgba(0, 240, 255, 0.2) !important;
}

#noVNC_control_bar_handle div {
  background: linear-gradient(90deg, #00f0ff, #ff00e5) !important;
  border-radius: 2px !important;
}

.noVNC_button {
  filter: brightness(0.8) hue-rotate(180deg) !important;
  transition: all 0.3s !important;
}

.noVNC_button:hover, .noVNC_button:focus {
  filter: brightness(1.2) hue-rotate(180deg) !important;
  background: rgba(0, 240, 255, 0.1) !important;
  box-shadow: 0 0 15px rgba(0, 240, 255, 0.3) !important;
}

#noVNC_status_bar {
  background: linear-gradient(90deg, #0a0a2e, #111128) !important;
  border-top: 1px solid rgba(0, 240, 255, 0.2) !important;
}

#noVNC_status {
  color: #00f0ff !important;
  font-family: 'Orbitron', monospace !important;
  font-size: 11px !important;
  letter-spacing: 1px !important;
}

#noVNC_connect_button {
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(255, 0, 229, 0.2)) !important;
  border: 1px solid #00f0ff !important;
  color: #00f0ff !important;
  font-family: 'Orbitron', monospace !important;
  text-transform: uppercase !important;
  letter-spacing: 3px !important;
  border-radius: 8px !important;
  padding: 12px 24px !important;
}

#noVNC_connect_button:hover {
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.4), rgba(255, 0, 229, 0.4)) !important;
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.4) !important;
}

/* 侧面板 */
.noVNC_panel {
  background: rgba(10, 10, 30, 0.95) !important;
  border: 1px solid rgba(0, 240, 255, 0.15) !important;
  backdrop-filter: blur(20px) !important;
}

.noVNC_heading {
  color: #00f0ff !important;
  font-family: 'Orbitron', monospace !important;
  letter-spacing: 2px !important;
  border-bottom: 1px solid rgba(0, 240, 255, 0.2) !important;
}

input[type="text"], input[type="password"], input[type="number"], select {
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(0, 240, 255, 0.2) !important;
  color: #e0e0ff !important;
  border-radius: 4px !important;
}

input[type="text"]:focus, input[type="password"]:focus {
  border-color: #00f0ff !important;
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.2) !important;
}

/* 整体深色背景 */
body {
  background: #0a0a1a !important;
}

/* 密码对话框 */
.noVNC_password_input {
  background: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(0, 240, 255, 0.2) !important;
  color: #e0e0ff !important;
}
`;

  // Find the main CSS file
  const appDir = path.join(CONFIG.novncPath, 'app');
  const cssFiles = fs.readdirSync(path.join(appDir, 'styles')).filter(f => f.endsWith('.css'));
  
  // Write brand CSS as a separate file
  const brandPath = path.join(appDir, 'styles', 'gbt-potato-brand.css');
  fs.writeFileSync(brandPath, brandCSS);
  console.log('[云桌面] ✓ 品牌主题注入:', brandPath);

  // Inject import into the main CSS
  const mainCSS = path.join(appDir, 'styles', 'base.css');
  if (fs.existsSync(mainCSS)) {
    let content = fs.readFileSync(mainCSS, 'utf8');
    if (!content.includes('gbt-potato-brand')) {
      content = `@import url('gbt-potato-brand.css');\n` + content;
      fs.writeFileSync(mainCSS, content);
      console.log('[云桌面] ✓ 品牌CSS已注入 base.css');
    }
  }
}

// ═══════════════════════════════════════════════════
// 主启动流程
// ═══════════════════════════════════════════════════
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🥔 GBT小土豆 · 云操盘桌面 v3.0           ║');
  console.log('║   Cloud Trading Desktop System               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // 1. 注入品牌主题
  try {
    injectBrandCSS();
  } catch (e) {
    console.warn('[云桌面] 品牌注入失败 (非致命):', e.message);
  }

  // 2. 检查/启动 VNC
  const vncRunning = await checkVNC();
  if (!vncRunning) {
    try {
      await startVNC();
    } catch (e) {
      console.error('[云桌面] ✗ VNC 服务启动失败:', e.message);
      console.error('[云桌面] 请确认 TightVNC 已安装并手动启动');
      process.exit(1);
    }
  } else {
    console.log('[云桌面] ✓ TightVNC 已运行 (端口 ' + CONFIG.vncPort + ')');
  }

  // 3. 启动 websockify
  try {
    await startWebsockify();
  } catch (e) {
    console.error('[云桌面] ✗ websockify 启动失败:', e.message);
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🎉 云桌面已就绪!                            ║');
  console.log('║                                              ║');
  console.log('║  🌐 浏览器访问:                              ║');
  console.log('║     http://127.0.0.1:' + CONFIG.webPort + '                 ║');
  console.log('║                                              ║');
  console.log('║  🔑 VNC密码: ' + CONFIG.vncPassword + '                       ║');
  console.log('║                                              ║');
  console.log('║  🛑 停止: Ctrl+C                            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[云桌面] 正在关闭...');
  if (websockifyProcess) {
    websockifyProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (websockifyProcess) {
    websockifyProcess.kill();
  }
  process.exit(0);
});

main().catch(err => {
  console.error('[云桌面] 致命错误:', err);
  process.exit(1);
});
