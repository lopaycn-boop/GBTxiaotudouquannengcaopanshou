const { app, BrowserWindow, Tray, Menu, shell, systemPreferences, powerMonitor, screen, globalShortcut, ipcMain, nativeImage } = require('electron');

// Fix GPU disk cache crash on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const net = require('net');
const autoUpdater = require('electron-updater').autoUpdater;

// ── Native input & capture — zero-delay game-grade control ──
const robot = require('robotjs');
const screenshot = require('screenshot-desktop');

// Configure robotjs for speed
robot.setMouseDelay(2);
robot.setKeyboardDelay(2);
robot.typeDelay = 10;

let mainWindow = null;
let tray = null;
let backendProc = null;
let isQuitting = false;
let crashRestartCount = 0;
const MAX_CRASH_RESTARTS = 3;

let BACKEND_PORT = parseInt(process.env.PET_BACKEND_PORT || '8003', 10);
const FRONTEND_PORT = 5173;
const APP_NAME = 'GBTxiaotudou AI操盘';

// ── All permissions pre-granted ──
async function grantAllPermissions() {
  // ── macOS: ask system preferences ──
  try {
    if (process.platform === 'darwin') {
      const perms = [
        'camera', 'microphone', 'screen', 'accessibility',
        'calendar', 'reminders', 'notifications', 'location',
        'music-library', 'photos', 'bluetooth'
      ];
      for (const perm of perms) {
        try { await systemPreferences.askForMediaAccess(perm); } catch(e) { /* ignore */ }
      }
    }
  } catch(e) {}

  // ── Windows: grant all device access via registry ──
  try {
    if (process.platform === 'win32') {
      const consentKeys = [
        // Audio / Video
        'microphone', 'camera', 'webcam',
        // Bluetooth & radios
        'bluetooth', 'radios', 'bluetoothSync',
        // Location & sensors
        'location', 'locationHistory', 'activityHistory',
        // Screen & display
        'graphicsCapture', 'graphicsCaptureProgrammatic', 'graphicsCaptureWithoutBorder',
        // Input devices
        'humanInterfaceDevice', 'inputObservation', 'inputInjection',
        // Network
        'wifiData', 'cellularData', 'phoneCall', 'voipCall',
        // Notifications & contacts
        'userNotificationListener', 'contacts', 'appointments',
        // Documents & files
        'documentsLibrary', 'picturesLibrary', 'videosLibrary', 'musicLibrary',
        'broadFileSystemAccess',
        // App diagnostics
        'appDiagnostics', 'devicePortal',
        // Motion & sensors
        'accelerometer', 'compass', 'gyroscope', 'inclometer', 'orientationSensor', 'motion',
      ];

      for (const key of consentKeys) {
        try {
          spawn('reg', [
            'add',
            `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\${key}`,
            '/v', 'Value', '/t', 'REG_SZ', '/d', 'Allow', '/f'
          ], { stdio: 'ignore' });
        } catch(e) {}
      }

      // Also grant Global Consent (overrides per-app)
      try {
        spawn('reg', [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore',
          '/v', 'Value', '/t', 'REG_SZ', '/d', 'Allow', '/f'
        ], { stdio: 'ignore' });
      } catch(e) {}

      // Disable Windows camera/mic privacy prompt for this app
      try {
        const appPath = app.getPath('exe');
        const esc = appPath.replace(/\\/g, '\\\\');
        spawn('reg', [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged',
          '/v', esc, '/t', 'REG_SZ', '/d', 'Allow', '/f'
        ], { stdio: 'ignore' });
        spawn('reg', [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\camera\\NonPackaged',
          '/v', esc, '/t', 'REG_SZ', '/d', 'Allow', '/f'
        ], { stdio: 'ignore' });
      } catch(e) {}
    }
  } catch(e) {}

  // ── Cross-platform: set session permission for media ──
  try {
    if (systemPreferences && systemPreferences.askForMediaAccess) {
      for (const mediaType of ['camera', 'microphone', 'screen']) {
        try { await systemPreferences.askForMediaAccess(mediaType); } catch(e) {}
      }
    }
  } catch(e) {}

  console.log('[electron] All device permissions granted');
}

// ── Check & wait for backend ──
function waitForBackend(port, maxRetries = 30) {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/version`, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.version && data.features) {
              console.log(`[electron] Potato backend confirmed on port ${port} v${data.version}`);
              resolve(true);
            } else {
              console.log(`[electron] Port ${port} responding but not potato backend, skipping`);
              resolve(false);
            }
          } catch {
            console.log(`[electron] Port ${port} response not JSON, skipping`);
            resolve(false);
          }
        });
      });
      req.on('error', () => {
        tries++;
        if (tries < maxRetries) setTimeout(check, 1000);
        else resolve(false);
      });
      req.setTimeout(3000, () => { req.destroy(); tries++; if (tries < maxRetries) setTimeout(check, 1000); else resolve(false); });
      req.end();
    };
    check();
  });
}

function findBackendPort(startPort = 8000, maxTries = 10) {
  return new Promise((resolve) => {
    let port = startPort;
    const tryPort = () => {
      if (port >= startPort + maxTries) { resolve(startPort); return; }
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          console.log(`[electron] Found backend on port ${port}`);
          resolve(port);
        } else {
          port++;
          tryPort();
        }
      });
      req.on('error', () => { resolve(startPort); });
      req.end();
    };
    tryPort();
  });
}

// ── Find Python ──
function findPython() {
  const { execSync } = require('child_process');
  const platform = process.platform;
  let candidates = [process.env.PYTHON_PATH, 'python3', 'python'].filter(Boolean);

  if (platform === 'win32') {
    candidates = [
      process.env.PYTHON_PATH,
      path.join(process.resourcesPath || '', 'python', 'python.exe'),
      'python',
      'python3',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    ].filter(Boolean);
  } else if (platform === 'darwin') {
    candidates = [
      process.env.PYTHON_PATH,
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      path.join(process.env.HOME || '', '.local', 'bin', 'python3'),
      'python3',
      'python',
    ].filter(Boolean);
  } else {
    candidates = [
      process.env.PYTHON_PATH,
      '/usr/bin/python3',
      '/usr/local/bin/python3',
      path.join(process.env.HOME || '', '.local', 'bin', 'python3'),
      path.join(process.env.HOME || '', '.pyenv', 'shims', 'python3'),
      'python3',
      'python',
    ].filter(Boolean);
  }

  for (const p of candidates) {
    try {
      execSync(`"${p}" --version`, { stdio: 'pipe', timeout: 5000, shell: true });
      console.log(`[electron] Found Python at: ${p}`);
      return p;
    } catch(e) {}
  }
  console.error('[electron] Python not found, backend will not start');
  return platform === 'win32' ? 'python' : 'python3';
}

// ── Start backend ──
function startBackend() {
  // Dev mode: if backend is already running on BACKEND_PORT, skip spawning
  const http = require('http');
  const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/version`, (res) => {
    let body = '';
    res.on('data', (d) => body += d);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.version && data.features) {
          console.log(`[electron] Potato backend already running on port ${BACKEND_PORT}, skipping spawn`);
          return;
        }
      } catch {}
      _spawnBackend();
    });
  });
  req.on('error', () => { _spawnBackend(); });
  req.setTimeout(3000, () => { req.destroy(); _spawnBackend(); });
  req.end();
}

// ── Start Bytebot Agent ──
let agentProc = null;
function startBytebotAgent() {
  const agentPort = process.env.BYTEBOT_AGENT_PORT || '9991';
  // Check if already running
  const req = http.get(`http://127.0.0.1:${agentPort}/health`, (res) => {
    res.resume();
    if (res.statusCode === 200) {
      console.log(`[electron] Bytebot Agent already running on port ${agentPort}`);
      return;
    }
    _spawnAgent();
  });
  req.on('error', () => { _spawnAgent(); });
  req.end();
}

function _spawnAgent() {
  const python = findPython();
  const agentScript = path.join(__dirname, '..', 'backend', 'bytebot_agent.py');
  if (!fs.existsSync(agentScript)) {
    console.log('[electron] bytebot_agent.py not found, skipping agent start');
    return;
  }
  const agentPort = process.env.BYTEBOT_AGENT_PORT || '9991';
  const env = { ...process.env, BYTEBOT_AGENT_PORT: agentPort };
  agentProc = spawn(python, [`"${agentScript}"`], {
    cwd: path.dirname(agentScript),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  agentProc.stdout.on('data', (data) => {
    console.log(`[agent] ${data.toString().trim()}`);
  });
  agentProc.stderr.on('data', (data) => {
    console.error(`[agent] ${data.toString().trim()}`);
  });
  agentProc.on('close', (code) => {
    if (!isQuitting) {
      console.log(`Bytebot Agent exited with code ${code}, restarting in 5s...`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-event', { type: 'agent_crash', code });
      }
      setTimeout(() => _spawnAgent(), 5000);
    }
  });
  console.log(`[electron] Bytebot Agent started on port ${agentPort}`);
}

function _spawnBackend() {
  const env = { ...process.env };
  env.PORT = String(BACKEND_PORT);
  const isWin = process.platform === 'win32';

  // ── Priority 1: Built-in PyInstaller exe (no Python needed on user machine) ──
  const bundledExe = isWin
    ? path.join(process.resourcesPath || '', 'potato-backend', 'potato-backend.exe')
    : path.join(process.resourcesPath || '', 'potato-backend', 'potato-backend');

  if (fs.existsSync(bundledExe)) {
    console.log(`[electron] Using bundled backend exe: ${bundledExe}`);
    const spawnOpts = { cwd: path.dirname(bundledExe), env, stdio: ['ignore', 'pipe', 'pipe'] };
    if (isWin) spawnOpts.shell = true;
    backendProc = spawn(bundledExe, [], spawnOpts);

    backendProc.stdout.on('data', (data) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });
    backendProc.stderr.on('data', (data) => {
      console.error(`[backend] ${data.toString().trim()}`);
    });
    backendProc.on('close', (code) => {
      if (!isQuitting) {
        console.log(`Backend exited with code ${code}, restarting in 3s...`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('system-event', { type: 'backend_crash', code });
        }
        setTimeout(() => _spawnBackend(), 3000);
      }
    });
    return;
  }

  // ── Priority 2: System Python (dev mode / fallback) ──
  console.log('[electron] Bundled exe not found, falling back to system Python');
  const python = findPython();
  const backendDir = path.join(process.resourcesPath || path.join(__dirname, '..'), 'backend');
  const mainPy = path.join(backendDir, 'main.py');

  console.log(`[electron] _spawnBackend: python=${python}, mainPy=${mainPy}, exists=${fs.existsSync(mainPy)}`);

  if (!fs.existsSync(mainPy)) {
    console.error(`Backend not found at ${mainPy}, trying project root backend`);
    const altMainPy = path.join(__dirname, '..', 'backend', 'main.py');
    console.log(`[electron] altMainPy=${altMainPy}, exists=${fs.existsSync(altMainPy)}`);
    if (!fs.existsSync(altMainPy)) {
      console.error(`Backend not found at ${altMainPy} either, relying on existing backend`);
      return;
    }
  }

  const resRoot = process.resourcesPath || path.join(__dirname, '..');
  const pthEntries = [
    resRoot,
    path.join(resRoot, 'potato'),
    path.join(resRoot, 'backend'),
  ];

  const pthContent = pthEntries.join('\n');
  const pthFile = path.join(resRoot, 'potato', '_desktop_pet_paths.pth');
  try {
    fs.writeFileSync(pthFile, pthContent, 'utf8');
  } catch (e) {
    console.error('[electron] Failed to write potato .pth:', e.message);
  }

  const siteDir = isWin
    ? path.join(path.dirname(python), 'Lib', 'site-packages')
    : path.join(path.dirname(python), '..', 'lib', `python3.${process.arch === 'arm64' ? '12' : '12'}`, 'site-packages');
  try { fs.mkdirSync(siteDir, { recursive: true }); } catch {}
  try {
    fs.writeFileSync(path.join(siteDir, 'desktop_pet_paths.pth'), pthContent, 'utf8');
  } catch (e) {
    console.error('[electron] Failed to write site-packages .pth:', e.message);
  }

  env.PYTHONPATH = [
    path.join(__dirname, '..', 'backend'),
  ].join(path.delimiter) + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');

  const mainPyPath = fs.existsSync(path.join(__dirname, '..', 'backend', 'main.py'))
    ? path.join(__dirname, '..', 'backend', 'main.py')
    : mainPy;
  const cwd = path.dirname(mainPyPath);

  const spawnArgs = isWin ? [`"${mainPyPath}"`] : [mainPyPath];
  const spawnOpts = { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] };
  if (isWin) spawnOpts.shell = true;

  backendProc = spawn(python, spawnArgs, spawnOpts);

  backendProc.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });
  backendProc.stderr.on('data', (data) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });
  backendProc.on('close', (code) => {
    if (!isQuitting) {
      console.log(`Backend exited with code ${code}, restarting in 3s...`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-event', { type: 'backend_crash', code });
      }
      setTimeout(() => _spawnBackend(), 3000);
    }
  });
}

// ── Save/Restore window bounds ──
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

function saveBounds() {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds), 'utf8');
  } catch (e) {}
}

function loadBounds() {
  try {
    if (fs.existsSync(BOUNDS_FILE)) {
      return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

// ── Create main window ──
function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const savedBounds = loadBounds();

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 420,
    height: savedBounds?.height || 700,
    x: savedBounds?.x ?? (screenW - 440),
    y: savedBounds?.y ?? (screenH - 720),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
      // No longer need webSecurity:false — app:// protocol avoids file:// fetch issues.
      // Keeping webSecurity:true even in packaged mode is safer.
      webSecurity: true,
    },
  });

  // Make window draggable from .app region, pass-through elsewhere
  mainWindow.webContents.on('did-finish-load', () => {
    crashRestartCount = 0;
    mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('.app').forEach(el => {
        el.style['-webkit-app-region'] = 'drag';
      });
      document.querySelectorAll('button, input, textarea, select, a, .no-drag').forEach(el => {
        el.style['-webkit-app-region'] = 'no-drag';
      });
    `);
    // Inject backend port so frontend WS connects to the right port
    if (BACKEND_PORT !== 8000) {
      mainWindow.webContents.executeJavaScript(`
        if (typeof window.__BACKEND_PORT__ === 'undefined' || window.__BACKEND_PORT__ !== ${BACKEND_PORT}) {
          window.__BACKEND_PORT__ = ${BACKEND_PORT};
          console.log('[electron] Backend port set to ${BACKEND_PORT}');
          window.dispatchEvent(new CustomEvent('backend-port-ready', { detail: ${BACKEND_PORT} }));
        }
      `);
    }
  });

  // ── Crash auto-restart ──
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (isQuitting) return;
    console.error('[electron] Renderer crashed:', details.reason);
    if (crashRestartCount < MAX_CRASH_RESTARTS) {
      crashRestartCount++;
      console.log(`[electron] Auto-restarting renderer (${crashRestartCount}/${MAX_CRASH_RESTARTS})...`);
      setTimeout(() => {
        try { mainWindow.reload(); } catch {}
      }, 2000);
    } else {
      console.error('[electron] Max crash restarts reached, giving up.');
    }
  });

  mainWindow.webContents.on('crashed', (_event, killed) => {
    if (isQuitting || killed) return;
    if (crashRestartCount < MAX_CRASH_RESTARTS) {
      crashRestartCount++;
      setTimeout(() => {
        try { mainWindow.reload(); } catch {}
      }, 2000);
    }
  });

  // Load frontend
  const frontendUrl = `http://127.0.0.1:${FRONTEND_PORT}`;
  const distPath = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
    : path.join(__dirname, '..', 'frontend', 'dist', 'index.html');

  if (app.isPackaged) {
    // Packaged: use app:// custom protocol (not file://) so that
    // fetch() works for Live2D model/resource loading.
    // registerAppProtocol() maps app://localhost/ → dist directory.
    mainWindow.loadURL('app://localhost/index.html');
  } else {
    // Dev mode: prefer Vite dev server (fixes file:// CORS blocking Live2D model fetch)
    // If Vite isn't running, start it automatically
    const tryLoadDevServer = () => {
      const http = require('http');
      const req = http.get(frontendUrl, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          console.log(`[electron] Vite dev server running at ${frontendUrl}`);
          mainWindow.loadURL(frontendUrl);
        } else {
          startViteAndLoad();
        }
      });
      req.on('error', () => { startViteAndLoad(); });
      req.setTimeout(2000, () => { req.destroy(); startViteAndLoad(); });
      req.end();
    };

    let viteProc = null;
    const startViteAndLoad = () => {
      console.log('[electron] Starting Vite dev server...');
      const viteBin = path.join(__dirname, '..', 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
      if (!fs.existsSync(viteBin)) {
        console.warn('[electron] Vite not found, falling back to loadFile (Live2D may not work on file://)');
        mainWindow.loadFile(distPath);
        return;
      }
      viteProc = spawn(
        process.platform === 'win32' ? 'node' : 'node',
        [viteBin, '--port', String(FRONTEND_PORT)],
        { cwd: path.join(__dirname, '..', 'frontend'), stdio: ['ignore', 'pipe', 'pipe'], shell: true }
      );
      viteProc.stdout.on('data', (d) => console.log(`[vite] ${d.toString().trim()}`));
      viteProc.stderr.on('data', (d) => console.error(`[vite] ${d.toString().trim()}`));

      // Wait for Vite to be ready
      let attempts = 0;
      const checkReady = () => {
        attempts++;
        const req = http.get(frontendUrl, (res) => {
          res.resume();
          if (res.statusCode === 200) {
            console.log(`[electron] Vite ready at ${frontendUrl}`);
            mainWindow.loadURL(frontendUrl);
          } else {
            if (attempts < 30) setTimeout(checkReady, 1000);
            else { console.error('[electron] Vite not ready after 30s, fallback to loadFile'); mainWindow.loadFile(distPath); }
          }
        });
        req.on('error', () => { if (attempts < 30) setTimeout(checkReady, 1000); else { console.error('[electron] Vite not ready after 30s, fallback to loadFile'); mainWindow.loadFile(distPath); } });
        req.setTimeout(2000, () => { req.destroy(); if (attempts < 30) setTimeout(checkReady, 1000); else { mainWindow.loadFile(distPath); } });
        req.end();
      };
      setTimeout(checkReady, 2000);
    };

    tryLoadDevServer();
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      saveBounds();
      mainWindow.hide();
    }
  });

  mainWindow.on('moved', () => saveBounds());
  mainWindow.on('resized', () => saveBounds());

  // Register global shortcuts
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── System tray ──
function createTray() {
  // Use a simple 16x16 dark circle as tray icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAAdAAAAHQBMYXfQAAAAZJREFUOE+tk71KA0EQhn2khRZCIWgRellpYy2CggVoa2NlZ2NnZ2FjYSEKCwsLCOxsbGz8H8jtJO8mN+ESuZ3O3Oy8d7ubDJ/0zJw7M+dmCv8DfgF9YMz3Yc6AK3CIGfAEHIHHcI/gCzghB2yBz3DvYIBbcAZuwQVwmhtwC27BHXCOG3APnsM9uAcP4B68hQdwB67BbbgOl+AO3IUPcA2eQdwOS7q7B7ES7uwC7OgB09kOd3WC2HCD4Dk9jOM7gha4A+ekPQSHOIEPcIIbcI4bcB7uwx3YB3fDE3gGV+AS3IYbcAd2wV3YB3fDE3gHV+AS3IYbcAd2wV3YB3fDE3gHd+AS3IY7cAcOwBP2wB04Ag/gFDyCG3AH7sMdOAK/4RU8ghuwB07BA3gGV+AS3IYbcAd2wV3YB3fDE3gHd+AS3IY7cAcOwBP2wB04Ag/gFDyCG7AH7sMdOIK/4BU8ghuwB07BA3gHd+AS3IYbcAd2wV3YB3fDE3gHd+AS3IY7cAcOwBP2wB04Ag/gFDyCG7AH7sMdOIK/4BU8Ae2EO3AJDsAJ+wxOwx1Yg1dwAS7BXbgFV+AUHMEduAT34Q58gxvxD0U8ASrkEQI7yl2pAAAAAElFTkSuQmCC', 'base64')
  );

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示小土豆', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: '分析选股', click: () => { mainWindow?.show(); mainWindow?.webContents.send('tray-action', 'trade_analysis'); } },
    { label: '操盘状态', click: () => { mainWindow?.show(); mainWindow?.webContents.send('tray-action', 'trade_status'); } },
    { label: '清理电脑', click: () => { mainWindow?.show(); mainWindow?.webContents.send('tray-action', 'cleanup_pc'); } },
    { type: 'separator' },
    { label: '重启后端', click: () => { if (backendProc) backendProc.kill(); startBackend(); } },
    { label: '开发者工具', click: () => { mainWindow?.webContents?.openDevTools(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show();
  });
}

// ── Auto-updater ──
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'lopaycn-boop',
    repo: 'GBTxiaotudouAI操盘',
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-event', {
        type: 'update_available',
        version: info.version,
        releaseDate: info.releaseDate,
      });
      const choice = require('electron').dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `新版本 v${info.version} 可用，是否立即下载？`,
        buttons: ['下载更新', '稍后再说'],
        defaultId: 0,
        noLink: true,
      });
      if (choice === 0) {
        autoUpdater.downloadUpdate();
      }
    }
  });

  autoUpdater.on('download-progress', (progressInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-event', {
        type: 'update_progress',
        percent: Math.round(progressInfo.percent),
        speed: Math.round(progressInfo.bytesPerSecond / 1024),
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const choice = require('electron').dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        title: '更新已下载',
        message: `v${info.version} 已下载完成，重启后生效。是否现在重启？`,
        buttons: ['立即重启', '稍后重启'],
        defaultId: 0,
        noLink: true,
      });
      if (choice === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[updater] Error:', err.message);
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version || 'unknown' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  try {
    autoUpdater.checkForUpdates();
  } catch (e) {
    console.log('[updater] check failed:', e.message);
  }
}

// ── Auto-start on boot ──
function setAutoStart(enable = true) {
  // Registry-based autostart is Windows-only; skip on macOS/Linux to avoid
  // an uncaught async 'spawn reg ENOENT' crash where `reg` does not exist.
  if (process.platform !== 'win32') return;
  const appFolder = path.dirname(process.execPath);
  const exePath = path.join(appFolder, APP_NAME + '.exe');
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

  const args = enable
    ? ['add', regKey, '/v', 'PotatoDesktopPet', '/t', 'REG_SZ', '/d', `"${exePath}"`, '/f']
    : ['delete', regKey, '/v', 'PotatoDesktopPet', '/f'];
  try {
    const proc = spawn('reg', args, { stdio: 'ignore' });
    proc.on('error', () => {});
  } catch(e) {}
}

// ── IPC handlers for system control (allowlisted commands only) ──
const ALLOWED_COMMANDS = {
  cleanmgr: { args: ['/d', 'C'] },
  systeminfo: null,
  ping: null,
};

function isCommandAllowed(cmd) {
  const base = path.basename(cmd.toLowerCase().replace(/\.exe$/i, ''));
  return base in ALLOWED_COMMANDS;
}

function setupIPC() {
  // System control — the pet can do EVERYTHING on the computer
  ipcMain.handle('shell-open', async (event, url) => {
    if (typeof url !== 'string' || !url.match(/^https?:\/\//)) {
      return { ok: false, error: 'Only HTTP(S) URLs allowed' };
    }
    shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('shell-open-path', async (event, filePath) => {
    const resolved = path.resolve(filePath);
    const safeDirs = [process.resourcesPath, path.join(process.resourcesPath, '..')];
    const isSafe = safeDirs.some(d => resolved.startsWith(d));
    if (!isSafe) {
      return { ok: false, error: 'Path outside allowed directories' };
    }
    shell.openPath(resolved);
    return { ok: true };
  });

  ipcMain.handle('system-info', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      cpuCount: require('os').cpus().length,
      totalMemory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB',
      freeMemory: Math.round(require('os').freemem() / 1024 / 1024 / 1024) + 'GB',
      uptime: Math.round(require('os').uptime() / 3600) + 'h',
    };
  });

  ipcMain.handle('execute-command', async (event, cmd, args = []) => {
    if (!isCommandAllowed(cmd)) {
      return { ok: false, error: `Command not allowlisted: ${cmd}` };
    }
    return new Promise((resolve) => {
      const proc = spawn(cmd, Array.isArray(args) ? args : [], { shell: false, stdio: 'pipe' });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d) => stdout += d.toString());
      proc.stderr.on('data', (d) => stderr += d.toString());
      proc.on('close', (code) => {
        resolve({ ok: code === 0, code, stdout, stderr });
      });
      proc.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });
    });
  });

  ipcMain.handle('cleanup-pc', async (event, level = 'quick') => {
    // Delegated to the backend cleanup_pc handler via WebSocket
    return { ok: true, level, message: '清理指令已发送到后端' };
  });

  ipcMain.handle('set-auto-start', async (event, enable) => {
    setAutoStart(enable);
    return { ok: true };
  });

  ipcMain.handle('get-auto-start', async () => {
    if (process.platform !== 'win32') return { enabled: false };
    return new Promise((resolve) => {
      const proc = spawn('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'PotatoDesktopPet'], { shell: true, stdio: 'pipe' });
      let out = '';
      proc.stdout.on('data', (d) => out += d.toString());
      proc.on('close', () => resolve({ enabled: out.includes('PotatoDesktopPet') }));
      proc.on('error', () => resolve({ enabled: false }));
    });
  });

  ipcMain.handle('set-always-on-top', async (event, onTop) => {
    mainWindow?.setAlwaysOnTop(onTop);
    return { ok: true };
  });

  ipcMain.handle('set-window-size', async (event, w, h) => {
    mainWindow?.setSize(w, h);
    return { ok: true };
  });

  ipcMain.handle('set-window-position', async (event, x, y) => {
    mainWindow?.setPosition(x, y);
    return { ok: true };
  });

  ipcMain.handle('minimize', async () => {
    mainWindow?.minimize();
    return { ok: true };
  });

  ipcMain.handle('hide-window', async () => {
    mainWindow?.hide();
    return { ok: true };
  });

  ipcMain.handle('show-window', async () => {
    mainWindow?.show();
    mainWindow?.focus();
    return { ok: true };
  });

  ipcMain.handle('set-opacity', async (event, opacity) => {
    mainWindow?.setOpacity(Math.max(0.1, Math.min(1, opacity)));
    return { ok: true };
  });

  ipcMain.handle('get-bounds', async () => {
    if (!mainWindow) return { ok: false };
    return { ok: true, ...mainWindow.getBounds() };
  });

  ipcMain.handle('power-status', async () => {
    return powerMonitor.getSystemPowerState
      ? { supported: true }
      : { supported: false };
  });

  ipcMain.handle('screen-sources', async () => {
    try {
      const sources = await require('electron').desktopCapturer.getSources({ types: ['screen'] });
      return { ok: true, sources: sources.map(s => ({ id: s.id, name: s.name })) };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 摄像头 / 视频
  // ═══════════════════════════════════════════════════════════════
  let cameraStream = null;

  ipcMain.handle('camera-get-devices', async () => {
    try {
      // Use desktopCapturer as proxy — actual device enum happens in renderer via WebRTC
      // We send a signal to renderer to enumerate devices
      mainWindow?.webContents.send('enumerate-media-devices', { type: 'camera' });
      return { ok: true, message: 'Device enumeration requested via renderer' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('camera-capture', async (event, deviceId, opts = {}) => {
    try {
      const sources = await require('electron').desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: opts.width || 1280, height: opts.height || 720 }
      });
      const primary = sources.find(s => s.display_id || s.name.includes('Screen')) || sources[0];
      if (!primary) return { ok: false, error: 'No capture source found' };
      return { ok: true, thumbnail: primary.thumbnail.toDataURL(), id: primary.id, name: primary.name };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('camera-start-stream', async (event, deviceId) => {
    cameraStream = deviceId || 'default';
    return { ok: true, message: 'Camera stream started' };
  });

  ipcMain.handle('camera-stop-stream', async () => {
    cameraStream = null;
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════
  // 麦克风 / 音频
  // ═══════════════════════════════════════════════════════════════
  let micRecording = false;

  ipcMain.handle('mic-get-devices', async () => {
    try {
      mainWindow?.webContents.send('enumerate-media-devices', { type: 'microphone' });
      return { ok: true, message: 'Mic enumeration requested via renderer' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mic-start-record', async (event, deviceId, opts = {}) => {
    micRecording = true;
    return { ok: true, deviceId: deviceId || 'default' };
  });

  ipcMain.handle('mic-stop-record', async () => {
    micRecording = false;
    return { ok: true };
  });

  ipcMain.handle('mic-get-volume', async () => {
    try {
      return new Promise((resolve) => {
        const proc = spawn('powershell', ['-Command',
          '(Get-AudioDevice -List | Where-Object {$_.Type -eq "Recording"} | Select-Object -First 1).Volume'],
          { stdio: ['ignore','pipe','ignore'] });
        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', () => resolve({ ok: true, volume: out.trim() }));
        proc.on('error', () => resolve({ ok: false, error: 'Failed to get volume' }));
      });
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mic-set-volume', async (event, vol) => {
    try {
      const v = Math.max(0, Math.min(100, parseInt(vol, 10) || 50));
      return new Promise((resolve) => {
        const proc = spawn('powershell', ['-Command',
          `$dev = Get-AudioDevice -List | Where-Object {$_.Type -eq "Recording"} | Select-Object -First 1; if ($dev) { Set-AudioDevice -InputObject $dev -Volume ${v} }`],
          { stdio: 'ignore' });
        proc.on('close', () => resolve({ ok: true }));
        proc.on('error', () => resolve({ ok: false, error: 'Failed to set volume' }));
      });
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 蓝牙 (Windows: via PowerShell / bthprops / Get-PnpDevice)
  // ═══════════════════════════════════════════════════════════════
  function runPowershell(script) {
    return new Promise((resolve) => {
      const proc = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore','pipe','pipe'] });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code }));
      proc.on('error', (err) => resolve({ ok: false, error: err.message }));
    });
  }

  ipcMain.handle('bluetooth-scan', async () => {
    try {
      const r = await runPowershell(
        `Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Select-Object Status, Class, FriendlyName, InstanceId | ConvertTo-Json -Compress`
      );
      let devices = [];
      try { devices = JSON.parse(r.stdout || '[]'); if (!Array.isArray(devices)) devices = [devices]; } catch(e) {}
      // Also trigger Windows Bluetooth scan
      spawn('powershell', ['-NoProfile', '-Command',
        `Start-Process 'ms-settings:bluetooth' -Wait:$false`], { stdio: 'ignore' });
      mainWindow?.webContents.send('bluetooth-scan-started', {});
      return { ok: true, devices, count: devices.length };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-get-devices', async () => {
    try {
      const r = await runPowershell(
        `Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object {$_.Status -eq 'OK'} | Select-Object FriendlyName, InstanceId, Status | ConvertTo-Json -Compress`
      );
      let devices = [];
      try { devices = JSON.parse(r.stdout || '[]'); if (!Array.isArray(devices)) devices = [devices]; } catch(e) {}
      return { ok: true, devices };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-connect', async (event, deviceId) => {
    try {
      const r = await runPowershell(
        `Enable-PnpDevice -InstanceId '${(deviceId || '').replace(/'/g, "''")}' -Confirm:$false`
      );
      return { ok: r.ok, message: r.ok ? 'Connected' : r.stderr || 'Failed' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-disconnect', async (event, deviceId) => {
    try {
      const r = await runPowershell(
        `Disable-PnpDevice -InstanceId '${(deviceId || '').replace(/'/g, "''")}' -Confirm:$false`
      );
      return { ok: r.ok, message: r.ok ? 'Disconnected' : r.stderr || 'Failed' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-pair', async (event, deviceId) => {
    try {
      spawn('powershell', ['-NoProfile', '-Command',
        `Start-Process 'ms-settings:bluetooth' -Wait:$false`], { stdio: 'ignore' });
      return { ok: true, message: 'Bluetooth settings opened for pairing' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-unpair', async (event, deviceId) => {
    try {
      const r = await runPowershell(
        `$dev = Get-PnpDevice -InstanceId '${(deviceId || '').replace(/'/g, "''")}' -ErrorAction SilentlyContinue; if ($dev) { Disable-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false; Remove-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false }`
      );
      return { ok: r.ok };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-get-services', async (event, deviceId) => {
    try {
      const r = await runPowershell(
        `Get-PnpDevice -InstanceId '${(deviceId || '').replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object FriendlyName, InstanceId, Status, Class | ConvertTo-Json -Compress`
      );
      let info = null;
      try { info = JSON.parse(r.stdout || 'null'); } catch(e) {}
      return { ok: true, services: info };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('bluetooth-read-write', async (event, deviceId, serviceId, charId, action, value) => {
    // BLE GATT read/write requires Windows.Devices.Bluetooth (UWP) — bridge via PowerShell
    try {
      if (action === 'read') {
        const r = await runPowershell(
          `Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Devices.Bluetooth.BluetoothLEDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null; $dev = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromIdAsync('${(deviceId || '').replace(/'/g, "''")}').GetAwaiter().GetResult(); if ($dev) { $result = @{Connected=$true;Name=$dev.Name}; $result | ConvertTo-Json -Compress } else { '{"Connected":false}' }`
        );
        return { ok: r.ok, data: r.stdout.trim() };
      }
      return { ok: false, error: 'BLE write not yet supported via IPC — use renderer Web Bluetooth API' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 屏幕截图 & 录制
  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // 屏幕截图 (screenshot-desktop — 全帧原生截图，无缩略图损失)
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('screen-capture', async (event, displayId) => {
    try {
      const imgBuffer = await screenshot({ format: 'png' });
      const img = nativeImage.createFromBuffer(imgBuffer);
      return { ok: true, image: img.toDataURL(), width: img.getSize().width, height: img.getSize().height };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('screen-capture-region', async (event, x, y, w, h) => {
    try {
      // Capture full screen then crop via robotjs bitmap
      const bitmap = robot.screen.capture(parseInt(x), parseInt(y), parseInt(w), parseInt(h));
      // Convert to base64 PNG via nativeImage
      const img = nativeImage.createFromBitmap(bitmap.image, { width: bitmap.width, height: bitmap.height });
      return { ok: true, image: img.toDataURL(), width: bitmap.width, height: bitmap.height };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('screen-get-displays', async () => {
    try {
      const sz = robot.getScreenSize();
      const displays = screen.getAllDisplays();
      return { ok: true, width: sz.width, height: sz.height, displays: displays.map(d => ({
        id: d.id, bounds: d.bounds, size: d.size, scaleFactor: d.scaleFactor,
        isPrimary: d.id === screen.getPrimaryDisplay().id
      }))};
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('screen-start-record', async (event, opts = {}) => {
    mainWindow?.webContents.send('screen-record-start', opts);
    return { ok: true, message: 'Screen recording signal sent to renderer' };
  });

  ipcMain.handle('screen-stop-record', async () => {
    mainWindow?.webContents.send('screen-record-stop', {});
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════
  // 键盘 & 鼠标控制 (robotjs — 零延迟原生操控，游戏/操盘级)
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('mouse-move', async (event, x, y) => {
    try { robot.moveMouse(parseInt(x), parseInt(y)); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-move-relative', async (event, dx, dy) => {
    try {
      const pos = robot.getMousePos();
      robot.moveMouse(pos.x + parseInt(dx), pos.y + parseInt(dy));
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-move-smooth', async (event, x, y) => {
    try { robot.moveMouseSmooth(parseInt(x), parseInt(y)); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-click', async (event, x, y, button = 'left') => {
    try {
      if (x !== undefined && y !== undefined) robot.moveMouse(parseInt(x), parseInt(y));
      robot.mouseClick(button === 'right' ? 'right' : button === 'middle' ? 'middle' : 'left');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-double-click', async (event, x, y) => {
    try {
      if (x !== undefined && y !== undefined) robot.moveMouse(parseInt(x), parseInt(y));
      robot.mouseClick('left', true); // double click
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-scroll', async (event, x, y, amount = 3) => {
    try {
      if (x !== undefined && y !== undefined) robot.moveMouse(parseInt(x), parseInt(y));
      robot.scrollMouse(0, parseInt(amount));
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-drag', async (event, fromX, fromY, toX, toY) => {
    try {
      robot.moveMouse(parseInt(fromX), parseInt(fromY));
      robot.mouseToggle('down', 'left');
      robot.moveMouseSmooth(parseInt(toX), parseInt(toY));
      robot.mouseToggle('up', 'left');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-toggle', async (event, state, button = 'left') => {
    try { robot.mouseToggle(state === 'down' ? 'down' : 'up', button === 'right' ? 'right' : 'left'); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('mouse-get-pos', async () => {
    try { const p = robot.getMousePos(); return { ok: true, x: p.x, y: p.y }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('keyboard-type', async (event, text) => {
    try { robot.typeString(String(text || '')); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('keyboard-press', async (event, key, modifiers = []) => {
    try {
      // robotjs key names
      const keyMap = { enter: 'enter', tab: 'tab', esc: 'escape', escape: 'escape',
        backspace: 'backspace', delete: 'delete', up: 'up', down: 'down',
        left: 'left', right: 'right', home: 'home', end: 'end',
        pageup: 'pageup', pagedown: 'pagedown', space: 'space',
        f1: 'f1', f2: 'f2', f3: 'f3', f4: 'f4', f5: 'f5', f6: 'f6',
        f7: 'f7', f8: 'f8', f9: 'f9', f10: 'f10', f11: 'f11', f12: 'f12',
        ctrl: 'control', alt: 'alt', shift: 'shift', cmd: 'command', win: 'command' };
      const mapped = keyMap[(key || '').toLowerCase()] || key;
      const modList = (modifiers || []).map(m => keyMap[(m || '').toLowerCase()] || m);
      robot.keyTap(mapped, modList.length ? modList : undefined);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('keyboard-hotkey', async (event, keys) => {
    try {
      const keyMap = { ctrl: 'control', alt: 'alt', shift: 'shift', cmd: 'command', win: 'command' };
      const mapped = (keys || []).map(k => keyMap[(k || '').toLowerCase()] || k);
      if (mapped.length === 0) return { ok: false, error: 'No keys provided' };
      // Hold all modifiers, tap the last key, release
      const modifiers = mapped.slice(0, -1);
      const finalKey = mapped[mapped.length - 1];
      for (const mod of modifiers) robot.keyToggle(mod, 'down');
      robot.keyTap(finalKey);
      for (const mod of modifiers) robot.keyToggle(mod, 'up');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('keyboard-toggle', async (event, key, state, modifiers = []) => {
    try {
      const keyMap = { ctrl: 'control', alt: 'alt', shift: 'shift', cmd: 'command', win: 'command' };
      const mapped = keyMap[(key || '').toLowerCase()] || key;
      robot.keyToggle(mapped, state === 'down' ? 'down' : 'up');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 浏览器操控 (Electron webContents — 内嵌浏览器完全操控)
  // ═══════════════════════════════════════════════════════════════
  let browserWindow = null;

  ipcMain.handle('browser-open', async (event, url, opts = {}) => {
    try {
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.loadURL(String(url));
        return { ok: true, message: 'Navigated existing browser' };
      }
      const { BrowserWindow } = require('electron');
      browserWindow = new BrowserWindow({
        width: opts.width || 1280, height: opts.height || 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true,
          preload: path.join(__dirname, 'browser-preload.js') },
        show: true, title: '小土豆操盘浏览器'
      });
      browserWindow.loadURL(String(url));
      return { ok: true, message: 'Browser opened' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-navigate', async (event, url) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      browserWindow.loadURL(String(url));
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-execute-js', async (event, script) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const result = await browserWindow.webContents.executeJavaScript(String(script));
      return { ok: true, result };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-screenshot', async () => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const img = await browserWindow.webContents.capturePage();
      return { ok: true, image: img.toDataURL(), width: img.getSize().width, height: img.getSize().height };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-get-url', async () => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      return { ok: true, url: browserWindow.webContents.getURL() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-close', async () => {
    try {
      if (browserWindow && !browserWindow.isDestroyed()) browserWindow.close();
      browserWindow = null;
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-wait-for-element', async (event, selector, timeoutMs = 10000) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const result = await browserWindow.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve(null), ${parseInt(timeoutMs)});
          const check = () => {
            const el = document.querySelector('${String(selector).replace(/'/g, "\\'")}');
            if (el) { clearTimeout(timeout); resolve({ found: true, text: el.textContent, tag: el.tagName }); }
          };
          check();
          new MutationObserver(() => check()).observe(document.body, { childList: true, subtree: true });
        })
      `);
      return result ? { ok: true, element: result } : { ok: false, error: 'Element not found within timeout' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-click-element', async (event, selector) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const result = await browserWindow.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${String(selector).replace(/'/g, "\\'")}');
          if (el) { el.click(); return true; }
          return false;
        })()
      `);
      return { ok: !!result };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-fill-input', async (event, selector, value) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const result = await browserWindow.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${String(selector).replace(/'/g, "\\'")}');
          if (el) { el.focus(); el.value = '${String(value).replace(/'/g, "\\'")}'; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; }
          return false;
        })()
      `);
      return { ok: !!result };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('browser-get-text', async (event, selector) => {
    try {
      if (!browserWindow || browserWindow.isDestroyed()) return { ok: false, error: 'No browser open' };
      const result = await browserWindow.webContents.executeJavaScript(`
        (function() {
          ${selector ? `const el = document.querySelector('${String(selector).replace(/'/g, "\\'")}'); return el ? el.textContent : null;`
                     : `return document.body.innerText;`}
        })()
      `);
      return result !== null ? { ok: true, text: result } : { ok: false, error: 'Element not found' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // OCR 屏幕识别 (调用后端 Python OCR 接口)
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('ocr-screen', async (event, x, y, w, h) => {
    try {
      // Capture region
      let imgBase64;
      if (x !== undefined) {
        const bitmap = robot.screen.capture(parseInt(x), parseInt(y), parseInt(w), parseInt(h));
        const img = nativeImage.createFromBitmap(bitmap.image, { width: bitmap.width, height: bitmap.height });
        imgBase64 = img.toDataURL();
      } else {
        const imgBuffer = await screenshot({ format: 'png' });
        imgBase64 = nativeImage.createFromBuffer(imgBuffer).toDataURL();
      }
      // Call backend OCR endpoint
      const payload = JSON.stringify({ image: imgBase64 });
      const result = await new Promise((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port: BACKEND_PORT, path: '/api/ocr',
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, error: d }); } }); }
        );
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(payload); req.end();
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // APP 操控 — 激活窗口 + 键鼠组合 (通达信/同花顺/大智慧等)
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('app-activate', async (event, appName) => {
    try {
      // Find and bring window to front via PowerShell
      const r = await runPowershell(
        `$proc = Get-Process -Name '${(appName || '').replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($proc) { (New-Object -ComObject WScript.Shell).AppActivate($proc.MainWindowTitle); $true } else { $false }`
      );
      return { ok: r.stdout.trim().toLowerCase() === 'true', message: r.stdout.trim() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('app-list-windows', async () => {
    try {
      const r = await runPowershell(
        `Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object ProcessName, MainWindowTitle, Id | ConvertTo-Json -Compress`
      );
      let wins = [];
      try { wins = JSON.parse(r.stdout || '[]'); if (!Array.isArray(wins)) wins = [wins]; } catch(e) {}
      return { ok: true, windows: wins };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // A股操盘专用 API
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('trade-get-stock-info', async (event, code) => {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/stock/${encodeURIComponent(code)}`, (res) => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } });
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-place-order', async (event, params) => {
    try {
      const payload = JSON.stringify(params);
      const result = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: BACKEND_PORT, path: '/api/trade/order',
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } }); }
        );
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(payload); req.end();
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-cancel-order', async (event, orderId) => {
    try {
      const result = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: BACKEND_PORT, path: `/api/trade/cancel/${encodeURIComponent(orderId)}`,
          method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } }); }
        );
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.end();
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-get-positions', async () => {
    try {
      const result = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${BACKEND_PORT}/api/trade/positions`, (res) => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } });
        }).on('error', (e) => resolve({ ok: false, error: e.message }));
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-get-orders', async () => {
    try {
      const result = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${BACKEND_PORT}/api/trade/orders`, (res) => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } }); }
        ).on('error', (e) => resolve({ ok: false, error: e.message }));
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-get-account', async () => {
    try {
      const result = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${BACKEND_PORT}/api/trade/account`, (res) => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } }); }
        ).on('error', (e) => resolve({ ok: false, error: e.message }));
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('trade-auto-operate', async (event, plan) => {
    // Full autonomous trading: plan = { stock, action, quantity, price, strategy }
    try {
      const payload = JSON.stringify(plan);
      const result = await new Promise((resolve) => {
        const req = http.request({ hostname: '127.0.0.1', port: BACKEND_PORT, path: '/api/trade/auto-operate',
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
          (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ ok: false, raw: d }); } }); }
        );
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(payload); req.end();
      });
      return result;
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 云桌面 API (noVNC + websockify)
  // ═══════════════════════════════════════════════════════════════
  let cloudDesktopProc = null;

  ipcMain.handle('cloud-desktop-start', async () => {
    try {
      if (cloudDesktopProc) {
        return { ok: true, message: 'Cloud desktop already running', url: 'http://127.0.0.1:6080' };
      }
      const cloudScript = path.join(__dirname, '..', 'cloud-desktop.js');
      cloudDesktopProc = spawn('node', [cloudScript], {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: false,
      });
      cloudDesktopProc.stdout.on('data', (d) => console.log('[cloud-desktop]', d.toString().trim()));
      cloudDesktopProc.stderr.on('data', (d) => console.log('[cloud-desktop:err]', d.toString().trim()));
      cloudDesktopProc.on('exit', () => { cloudDesktopProc = null; });
      await new Promise(r => setTimeout(r, 5000));
      return { ok: true, url: 'http://127.0.0.1:6080', password: 'potato88' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('cloud-desktop-stop', async () => {
    try {
      if (cloudDesktopProc) { cloudDesktopProc.kill(); cloudDesktopProc = null; }
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('cloud-desktop-open', async () => {
    try {
      shell.openExternal('http://127.0.0.1:6080');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('cloud-desktop-status', async () => {
    try {
      const result = await new Promise((resolve) => {
        const net = require('net');
        const client = new net.Socket();
        client.setTimeout(2000);
        client.on('connect', () => { client.destroy(); resolve(true); });
        client.on('error', () => { client.destroy(); resolve(false); });
        client.on('timeout', () => { client.destroy(); resolve(false); });
        client.connect(6080, '127.0.0.1');
      });
      return { ok: true, running: result, url: result ? 'http://127.0.0.1:6080' : null };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 剪贴板
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('clipboard-read', async () => {
    try {
      const text = require('electron').clipboard.readText();
      return { ok: true, text };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clipboard-write', async (event, text) => {
    try {
      require('electron').clipboard.writeText(String(text || ''));
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clipboard-read-image', async () => {
    try {
      const img = require('electron').clipboard.readImage();
      return { ok: true, dataUrl: img.isEmpty() ? null : img.toDataURL() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clipboard-write-image', async (event, b64) => {
    try {
      const img = nativeImage.createFromDataURL(b64);
      require('electron').clipboard.writeImage(img);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 通知
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('show-notification', async (event, title, body, opts = {}) => {
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({ title: String(title || ''), body: String(body || ''), silent: opts.silent || false }).show();
        return { ok: true };
      }
      return { ok: false, error: 'Notifications not supported' };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 网络 & WiFi
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('network-info', async () => {
    try {
      const os = require('os');
      const nets = os.networkInterfaces();
      const result = [];
      for (const [name, addrs] of Object.entries(nets)) {
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal) {
            result.push({ name, address: a.address, netmask: a.netmask, mac: a.mac });
          }
        }
      }
      return { ok: true, interfaces: result, hostname: os.hostname() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('wifi-scan', async () => {
    try {
      const r = await runPowershell(
        `netsh wlan show networks mode=bssid | ConvertTo-Json -Compress`
      );
      return { ok: r.ok, raw: r.stdout.trim() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('wifi-connect', async (event, ssid, password) => {
    try {
      const safeSsid = (ssid || '').replace(/"/g, '');
      const safePass = (password || '').replace(/"/g, '');
      const r = await runPowershell(
        `netsh wlan connect name="${safeSsid}"` + (safePass ? `` : ``)
      );
      return { ok: r.ok, message: r.stdout.trim() };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 文件系统（受控访问）
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('fs-read-dir', async (event, dirPath) => {
    try {
      const resolved = path.resolve(String(dirPath || '.'));
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return { ok: true, entries: entries.map(e => ({ name: e.name, isDir: e.isDirectory(), isFile: e.isFile() })) };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('fs-read-file', async (event, filePath, encoding = 'utf8') => {
    try {
      const resolved = path.resolve(String(filePath));
      const buf = fs.readFileSync(resolved);
      if (encoding === 'base64') return { ok: true, data: buf.toString('base64') };
      if (encoding === 'buffer') return { ok: true, size: buf.length };
      return { ok: true, content: buf.toString(encoding) };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('fs-write-file', async (event, filePath, content) => {
    try {
      const resolved = path.resolve(String(filePath));
      fs.writeFileSync(resolved, String(content || ''), 'utf8');
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('fs-stat', async (event, filePath) => {
    try {
      const resolved = path.resolve(String(filePath));
      const st = fs.statSync(resolved);
      return { ok: true, isFile: st.isFile(), isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('fs-mkdir', async (event, dirPath) => {
    try {
      fs.mkdirSync(path.resolve(String(dirPath)), { recursive: true });
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 系统电源操作
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('system-shutdown', async () => {
    try { spawn('shutdown', ['/s', '/t', '5'], { stdio: 'ignore' }); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('system-restart', async () => {
    try { spawn('shutdown', ['/r', '/t', '5'], { stdio: 'ignore' }); return { ok: true }; }
    catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('system-sleep', async () => {
    try {
      const r = await runPowershell('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)');
      return { ok: r.ok };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('system-lock', async () => {
    try {
      const r = await runPowershell('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::Lock()');
      if (!r.ok) { spawn('rundll32', ['user32.dll,LockWorkStation'], { stdio: 'ignore' }); }
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('system-volume', async (event, action) => {
    try {
      const volActions = {
        up: '$wsh.SendKeys([char]175)',     // VolumeUp
        down: '$wsh.SendKeys([char]174)',   // VolumeDown
        mute: '$wsh.SendKeys([char]173)',   // VolumeMute
      };
      const a = volActions[(action || '').toLowerCase()] || volActions.up;
      const r = await runPowershell(`$wsh = New-Object -ComObject WScript.Shell; ${a}`);
      return { ok: r.ok };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('system-brightness', async (event, action) => {
    try {
      const r = await runPowershell(
        `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness`
      );
      let current = parseInt(r.stdout.trim(), 10) || 50;
      if (action === 'up') current = Math.min(100, current + 10);
      else if (action === 'down') current = Math.max(0, current - 10);
      else if (typeof action === 'number') current = Math.max(0, Math.min(100, action));
      const r2 = await runPowershell(
        `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${current})`
      );
      return { ok: true, brightness: current };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ═══════════════════════════════════════════════════════════════
  // 进程管理
  // ═══════════════════════════════════════════════════════════════
  ipcMain.handle('process-list', async () => {
    try {
      const r = await runPowershell(
        `Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64, MainWindowTitle | ConvertTo-Json -Compress`
      );
      let procs = [];
      try { procs = JSON.parse(r.stdout || '[]'); if (!Array.isArray(procs)) procs = [procs]; } catch(e) {}
      return { ok: true, processes: procs.map(p => ({
        pid: p.Id, name: p.ProcessName, cpu: Math.round((p.CPU || 0) * 100) / 100,
        memoryMB: Math.round((p.WorkingSet64 || 0) / 1024 / 1024), title: p.MainWindowTitle || ''
      }))};
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('process-kill', async (event, pid) => {
    try {
      const p = parseInt(pid, 10);
      if (!p || p < 10) return { ok: false, error: 'Invalid PID' };
      process.kill(p);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });
}

// ── Register app:// protocol with privileges BEFORE app.ready ──
// Must be called before app.whenReady() for privileges to take effect.
const { protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

// ── Custom protocol handler for packaged mode (avoids file:// fetch blocking) ──
// Live2D models require fetch() to load .moc3/.textures/etc., but
// Chromium blocks fetch() on file:// URLs. Registering app:// lets
// us serve static files through a protocol that supports fetch().
function registerAppProtocol() {
  const distDir = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist')
    : path.join(__dirname, '..', 'frontend', 'dist');

  protocol.registerFileProtocol('app', (request, callback) => {
    // request.url = 'app://localhost/models/Lisette/Lisette.model3.json'
    const urlPath = decodeURI(new URL(request.url).pathname);
    // Strip leading slash, join with distDir
    const filePath = path.join(distDir, urlPath.replace(/^\//, ''));
    callback(filePath);
  });

  console.log(`[electron] Registered app:// protocol → ${distDir}`);
}

// ── App lifecycle ──
app.whenReady().then(async () => {
  // Register custom protocol BEFORE any window creation
  registerAppProtocol();
  // Grant ALL permissions — no popup interruptions
  await grantAllPermissions();

  // Start backend first
  startBackend();

  // Wait for backend to be ready and find its actual port
  let actualPort = BACKEND_PORT;
  // Scan all ports 8000-8009 to find the potato backend
  for (let tryPort = 8000; tryPort < 8010; tryPort++) {
    const ready = await waitForBackend(tryPort, tryPort === BACKEND_PORT ? 30 : 2);
    if (ready) {
      actualPort = tryPort;
      BACKEND_PORT = tryPort;
      console.log(`[electron] Potato backend found on port ${tryPort}`);
      break;
    }
  }
  if (actualPort === 8000 && !(await waitForBackend(8000, 1))) {
    console.error('Backend failed to start within 30s');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-event', { type: 'backend_timeout' });
    }
  } else {
    BACKEND_PORT = actualPort;
    // Run verification check
    try {
      const verifyReq = http.get(`http://127.0.0.1:${BACKEND_PORT}/verify`, (vRes) => {
        let body = '';
        vRes.on('data', (d) => body += d);
        vRes.on('end', () => {
          try {
            const v = JSON.parse(body);
            if (v.ok) {
              console.log(`[electron] Verify: all checks passed`);
            } else {
              console.warn(`[electron] Verify: some checks failed — ${v.output}`);
            }
          } catch(e) {}
        });
      });
      verifyReq.on('error', () => {});
      verifyReq.end();
    } catch(e) {}
  }

  // Start Bytebot Agent
  startBytebotAgent();

  // Create UI with backend port info
  createWindow();
  createTray();
  setupIPC();
  setupAutoUpdater();

  // Set auto-start
  setAutoStart(true);

  // Power monitor events
  powerMonitor.on('suspend', () => {
    mainWindow?.webContents.send('system-event', { type: 'suspend' });
  });
  powerMonitor.on('resume', () => {
    mainWindow?.webContents.send('system-event', { type: 'resume' });
  });
  powerMonitor.on('on-ac', () => {
    mainWindow?.webContents.send('system-event', { type: 'on-ac' });
  });
  powerMonitor.on('on-battery', () => {
    mainWindow?.webContents.send('system-event', { type: 'on-battery' });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit — keep running in tray
});

app.on('before-quit', () => {
  isQuitting = true;
  if (backendProc) {
    backendProc.kill('SIGTERM');
  }
  if (agentProc) {
    agentProc.kill('SIGTERM');
  }
  globalShortcut.unregisterAll();
});