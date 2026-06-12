const { app, BrowserWindow, screen, protocol, net, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

// ── Register app:// protocol BEFORE app.ready ──
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-media-stream');
//app.commandLine.appendSwitch('enable-transparent-visuals');

let backendProcess = null;
let backendShutdown = false;
let backendReady = false;
let mainWindow = null;

const BACKEND_PORT = 8003;
const APP_NAME = 'GBTxiaotudou 全能操盘手';
app.setName(APP_NAME);

const LOG_DIR = app.getPath('userData');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
const LOG_FILE = path.join(LOG_DIR, 'glass-app.log');

function writeLog(level, msg, writer) {
  const line = `[${new Date().toISOString()}] ${level} ${msg}`;
  writer(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8'); } catch (e) { console.error(`[log-write-failed] ${e.message}`); }
}

const logger = {
  info: (msg) => writeLog('ℹ️ ', msg, console.log),
  success: (msg) => writeLog('✅', msg, console.log),
  warn: (msg) => writeLog('⚠️ ', msg, console.warn),
  error: (msg) => writeLog('❌', msg, console.error),
};

logger.info('═════════════════════════════════════════');
logger.info(`${APP_NAME} 玻璃悬浮APP启动`);
logger.info(`版本: ${app.getVersion()} | 平台: ${process.platform} | Electron: ${process.versions.electron}`);

function getResourcePath() {
  return app.isPackaged ? path.join(process.resourcesPath) : path.join(__dirname, '..', '..');
}

function findPython() {
  const resourcesPath = getResourcePath();
  const embeddedPython = path.join(resourcesPath, 'python', 'python.exe');
  if (fs.existsSync(embeddedPython)) { logger.success(`找到嵌入式Python: ${embeddedPython}`); return embeddedPython; }
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py', 'C:\\Python311\\python.exe', 'C:\\Python312\\python.exe']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try { execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 }); logger.success(`找到系统Python: ${cmd}`); return cmd; }
    catch (_) {}
  }
  logger.error('未找到Python！'); return null;
}

function findBackendDir() {
  const resourcesPath = getResourcePath();
  const possible = [
    path.join(resourcesPath, 'backend'),
    path.join(__dirname, '..', 'backend'),
  ];
  for (const dir of possible) {
    if (fs.existsSync(path.join(dir, 'main.py'))) { logger.success(`找到后端: ${dir}`); return dir; }
  }
  logger.error('未找到后端目录！'); return null;
}

function findPotatoDir() {
  const resourcesPath = getResourcePath();
  const possible = [
    path.join(resourcesPath, 'potato'),
    path.join(__dirname, '..', '..', 'potato'),
  ];
  for (const dir of possible) {
    if (fs.existsSync(path.join(dir, '__init__.py'))) { logger.success(`找到potato包: ${dir}`); return dir; }
  }
  return null;
}

function findFrontendDir() {
  const possible = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'frontend-dist'),
        path.join(app.getAppPath(), 'dist'),
      ]
    : [
        path.join(__dirname, 'dist'),
        path.join(__dirname, 'dist2'),
        path.join(__dirname, 'glass_app'),
      ];

  for (const dir of possible) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      logger.success(`找到前端页面: ${dir}`);
      return dir;
    }
  }

  logger.error('未找到前端页面目录！');
  return possible[0];
}

function checkBackendHealth(timeout = 10000) {
  return new Promise((resolve) => {
    let checks = 0;
    const max = Math.ceil(timeout / 500);
    const check = () => {
      checks++;
      if (checks > max) { logger.error(`后端健康检查超时(${timeout}ms)`); resolve(false); return; }
      if (!backendProcess || backendProcess.killed) { resolve(false); return; }
      const http = require('http');
      const req = http.get(`http://localhost:${BACKEND_PORT}/health`, { timeout: 500 }, (res) => {
        if (res.statusCode === 200) { logger.success('后端健康检查通过'); resolve(true); }
        else { setTimeout(check, 500); }
      });
      req.on('error', () => { if (checks < max) setTimeout(check, 500); else resolve(false); });
    };
    check();
  });
}

function startBackend() {
  logger.info('启动后端...');
  const py = findPython();
  if (!py) { logger.error('Python不可用'); return; }
  const backendDir = findBackendDir();
  if (!backendDir) { logger.error('后端目录不可用'); return; }
  const env = { ...process.env };
  env.PORT = String(BACKEND_PORT);
  env.PET_BACKEND_PORT = String(BACKEND_PORT);
  env.POTATO_SECRETS_ENV_FALLBACK = 'true';
  env.POTATO_TRADING_MODE = env.POTATO_TRADING_MODE || 'dry_run';
  const potatoDir = findPotatoDir();
  const pythonPaths = [backendDir];
  if (potatoDir) pythonPaths.push(path.dirname(potatoDir));
  env.PYTHONPATH = pythonPaths.join(path.delimiter);
  const isPackaged = app.isPackaged;
  const uvicornApp = isPackaged ? 'main:app' : 'desktop_pet.backend.main:app';
  try {
    backendProcess = spawn(py, ['-m', 'uvicorn', uvicornApp, '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], { cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'], env, detached: false });
    backendProcess.stdout.on('data', (data) => { const msg = data.toString().trim(); if (msg) fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [backend] ${msg}\n`, 'utf-8'); });
    backendProcess.stderr.on('data', (data) => { const msg = data.toString().trim(); if (msg) fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [backend-err] ${msg}\n`, 'utf-8'); });
    backendProcess.on('error', (e) => { logger.error(`后端进程错误: ${e.message}`); });
    backendProcess.on('exit', (code, signal) => { if (!backendShutdown) { logger.error(`后端意外退出(code=${code})`); } backendReady = false; });
    logger.success(`后端进程已启动 (PID: ${backendProcess.pid})`);
  } catch (e) { logger.error(`启动后端异常: ${e.message}`); }
}

function killBackend() {
  if (!backendProcess) return;
  backendShutdown = true;
  logger.info('停止后端...');
  try {
    if (process.platform === 'win32') { execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore', timeout: 5000 }); }
    else { backendProcess.kill('SIGTERM'); }
    logger.success('后端已停止');
  } catch (e) { try { backendProcess.kill(); } catch (__) {} }
  backendProcess = null;
}

function registerAppProtocol() {
  const frontendDir = findFrontendDir();

  protocol.handle('app', (request) => {
    const urlPath = decodeURI(new URL(request.url).pathname);
    const relativePath = urlPath.replace(/^\//, '') || 'index.html';
    const filePath = path.join(frontendDir, relativePath);
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
    return net.fetch(fileUrl);
  });
  logger.info(`Registered app:// protocol → ${frontendDir}`);
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const winW = Math.min(1400, Math.floor(screenW * 0.85));
  const winH = Math.min(900, Math.floor(screenH * 0.88));

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.max(0, (screenW - winW) / 2),
    y: Math.max(0, (screenH - winH) / 2),
    frame: false,           // 无边框
    transparent: false,     // 不透明（新UI自带深色背景）
    backgroundColor: '#1a1a1b',
    alwaysOnTop: false,
    hasShadow: true,
    resizable: true,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webgl: true,
      webSecurity: false,  // 允许file://页面嵌入http:// iframe
      webviewTag: true,    // 允许webview嵌入外部页面
    },
  });

  // 全部权限自动允许
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  mainWindow.webContents.session.setPermissionCheckHandler(() => true);

  mainWindow.loadURL('app://localhost/index.html');

  // 渲染器日志
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const lvl = ['verbose','info','warning','error'][level] || level;
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [renderer:${lvl}] ${message} (${sourceId}:${line})\n`, 'utf-8');
  });

  // 渲染进程崩溃保护：自动重载而不是关闭窗口
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logger.error(`渲染进程崩溃: ${details.reason} ${details.exitCode}`);
    if (details.reason === 'crashed' || details.reason === 'oom') {
      setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload(); }, 1000);
    }
  });
  mainWindow.webContents.on('crashed', () => {
    logger.error('渲染进程crashed，1秒后重载...');
    setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload(); }, 1000);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  logger.success('玻璃悬浮窗口已创建');
}

// ── IPC: 窗口控制 ──
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => { if (mainWindow) { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); } });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('window-always-on-top', (_e, flag) => { if (mainWindow) mainWindow.setAlwaysOnTop(flag); });
ipcMain.on('eval-js', (_e, code) => { if (mainWindow) mainWindow.webContents.executeJavaScript(code).catch(()=>{}); });

app.whenReady().then(() => {
  registerAppProtocol();

  // 检查后端是否已经在运行
  checkBackendHealth(2000).then((healthy) => {
    if (!healthy) {
      startBackend();
    } else {
      logger.success('后端已在运行');
      backendReady = true;
    }
    // 等后端就绪再开窗
    const waitAndCreate = () => {
      checkBackendHealth(15000).then((ok) => {
        if (ok) { backendReady = true; }
        createWindow();
      });
    };
    setTimeout(waitAndCreate, 2000);
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { killBackend(); app.quit(); } });
app.on('before-quit', () => { killBackend(); logger.info('应用已关闭'); });
process.on('uncaughtException', (err) => { logger.error(`未捕获异常: ${err.message}`); });

// 阻止渲染进程崩溃导致整个应用退出
app.on('render-process-gone', (_e, _wc, details) => { logger.error('app级渲染崩溃: ' + details.reason); });
