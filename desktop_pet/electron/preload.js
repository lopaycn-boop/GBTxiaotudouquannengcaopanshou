const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('potatoAPI', {
  // ═══════════════════════════════════════════════════════════════
  // 系统 & 窗口控制
  // ═══════════════════════════════════════════════════════════════
  shellOpen: (url) => ipcRenderer.invoke('shell-open', url),
  shellOpenPath: (p) => ipcRenderer.invoke('shell-open-path', p),
  systemInfo: () => ipcRenderer.invoke('system-info'),
  executeCommand: (cmd, args) => ipcRenderer.invoke('execute-command', cmd, args),
  cleanupPC: (level) => ipcRenderer.invoke('cleanup-pc', level),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAlwaysOnTop: (onTop) => ipcRenderer.invoke('set-always-on-top', onTop),
  setWindowSize: (w, h) => ipcRenderer.invoke('set-window-size', w, h),
  setWindowPosition: (x, y) => ipcRenderer.invoke('set-window-position', x, y),
  minimize: () => ipcRenderer.invoke('minimize'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  getBounds: () => ipcRenderer.invoke('get-bounds'),
  powerStatus: () => ipcRenderer.invoke('power-status'),
  screenSources: () => ipcRenderer.invoke('screen-sources'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // ═══════════════════════════════════════════════════════════════
  // 摄像头 / 视频
  // ═══════════════════════════════════════════════════════════════
  cameraGetDevices: () => ipcRenderer.invoke('camera-get-devices'),
  cameraCapture: (deviceId, opts) => ipcRenderer.invoke('camera-capture', deviceId, opts),
  cameraStartStream: (deviceId) => ipcRenderer.invoke('camera-start-stream', deviceId),
  cameraStopStream: () => ipcRenderer.invoke('camera-stop-stream'),

  // ═══════════════════════════════════════════════════════════════
  // 麦克风 / 音频
  // ═══════════════════════════════════════════════════════════════
  micGetDevices: () => ipcRenderer.invoke('mic-get-devices'),
  micStartRecord: (deviceId, opts) => ipcRenderer.invoke('mic-start-record', deviceId, opts),
  micStopRecord: () => ipcRenderer.invoke('mic-stop-record'),
  micGetVolume: () => ipcRenderer.invoke('mic-get-volume'),
  micSetVolume: (vol) => ipcRenderer.invoke('mic-set-volume', vol),

  // ═══════════════════════════════════════════════════════════════
  // 蓝牙
  // ═══════════════════════════════════════════════════════════════
  bluetoothScan: () => ipcRenderer.invoke('bluetooth-scan'),
  bluetoothGetDevices: () => ipcRenderer.invoke('bluetooth-get-devices'),
  bluetoothConnect: (deviceId) => ipcRenderer.invoke('bluetooth-connect', deviceId),
  bluetoothDisconnect: (deviceId) => ipcRenderer.invoke('bluetooth-disconnect', deviceId),
  bluetoothPair: (deviceId) => ipcRenderer.invoke('bluetooth-pair', deviceId),
  bluetoothUnpair: (deviceId) => ipcRenderer.invoke('bluetooth-unpair', deviceId),
  bluetoothGetServices: (deviceId) => ipcRenderer.invoke('bluetooth-get-services', deviceId),
  bluetoothReadWrite: (deviceId, serviceId, charId, action, value) =>
    ipcRenderer.invoke('bluetooth-read-write', deviceId, serviceId, charId, action, value),

  // ═══════════════════════════════════════════════════════════════
  // 屏幕截图 & 录制
  // ═══════════════════════════════════════════════════════════════
  screenCapture: (displayId) => ipcRenderer.invoke('screen-capture', displayId),
  screenCaptureRegion: (x, y, w, h) => ipcRenderer.invoke('screen-capture-region', x, y, w, h),
  screenGetDisplays: () => ipcRenderer.invoke('screen-get-displays'),
  screenStartRecord: (opts) => ipcRenderer.invoke('screen-start-record', opts),
  screenStopRecord: () => ipcRenderer.invoke('screen-stop-record'),

  // ═══════════════════════════════════════════════════════════════
  // 键盘 & 鼠标控制 (robotjs 原生)
  // ═══════════════════════════════════════════════════════════════
  mouseMove: (x, y) => ipcRenderer.invoke('mouse-move', x, y),
  mouseMoveRelative: (dx, dy) => ipcRenderer.invoke('mouse-move-relative', dx, dy),
  mouseMoveSmooth: (x, y) => ipcRenderer.invoke('mouse-move-smooth', x, y),
  mouseClick: (x, y, button) => ipcRenderer.invoke('mouse-click', x, y, button),
  mouseDoubleClick: (x, y) => ipcRenderer.invoke('mouse-double-click', x, y),
  mouseScroll: (x, y, amount) => ipcRenderer.invoke('mouse-scroll', x, y, amount),
  mouseDrag: (fromX, fromY, toX, toY) => ipcRenderer.invoke('mouse-drag', fromX, fromY, toX, toY),
  mouseToggle: (state, button) => ipcRenderer.invoke('mouse-toggle', state, button),
  mouseGetPos: () => ipcRenderer.invoke('mouse-get-pos'),
  keyboardType: (text) => ipcRenderer.invoke('keyboard-type', text),
  keyboardPress: (key, modifiers) => ipcRenderer.invoke('keyboard-press', key, modifiers),
  keyboardHotkey: (keys) => ipcRenderer.invoke('keyboard-hotkey', keys),
  keyboardToggle: (key, state) => ipcRenderer.invoke('keyboard-toggle', key, state),

  // ═══════════════════════════════════════════════════════════════
  // 剪贴板
  // ═══════════════════════════════════════════════════════════════
  clipboardRead: () => ipcRenderer.invoke('clipboard-read'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard-write', text),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard-read-image'),
  clipboardWriteImage: (b64) => ipcRenderer.invoke('clipboard-write-image', b64),

  // ═══════════════════════════════════════════════════════════════
  // 通知
  // ═══════════════════════════════════════════════════════════════
  showNotification: (title, body, opts) => ipcRenderer.invoke('show-notification', title, body, opts),

  // ═══════════════════════════════════════════════════════════════
  // 网络 & WiFi
  // ═══════════════════════════════════════════════════════════════
  networkInfo: () => ipcRenderer.invoke('network-info'),
  wifiScan: () => ipcRenderer.invoke('wifi-scan'),
  wifiConnect: (ssid, password) => ipcRenderer.invoke('wifi-connect', ssid, password),

  // ═══════════════════════════════════════════════════════════════
  // 文件系统（受控访问）
  // ═══════════════════════════════════════════════════════════════
  fsReadDir: (dirPath) => ipcRenderer.invoke('fs-read-dir', dirPath),
  fsReadFile: (filePath, encoding) => ipcRenderer.invoke('fs-read-file', filePath, encoding),
  fsWriteFile: (filePath, content) => ipcRenderer.invoke('fs-write-file', filePath, content),
  fsStat: (filePath) => ipcRenderer.invoke('fs-stat', filePath),
  fsMkdir: (dirPath) => ipcRenderer.invoke('fs-mkdir', dirPath),

  // ═══════════════════════════════════════════════════════════════
  // 系统电源操作
  // ═══════════════════════════════════════════════════════════════
  systemShutdown: () => ipcRenderer.invoke('system-shutdown'),
  systemRestart: () => ipcRenderer.invoke('system-restart'),
  systemSleep: () => ipcRenderer.invoke('system-sleep'),
  systemLock: () => ipcRenderer.invoke('system-lock'),
  systemVolume: (action) => ipcRenderer.invoke('system-volume', action),
  systemBrightness: (action) => ipcRenderer.invoke('system-brightness', action),

  // ═══════════════════════════════════════════════════════════════
  // 进程管理
  // ═══════════════════════════════════════════════════════════════
  processList: () => ipcRenderer.invoke('process-list'),
  processKill: (pid) => ipcRenderer.invoke('process-kill', pid),

  // ═══════════════════════════════════════════════════════════════
  // 浏览器操控 (Electron 内嵌浏览器)
  // ═══════════════════════════════════════════════════════════════
  browserOpen: (url, opts) => ipcRenderer.invoke('browser-open', url, opts),
  browserNavigate: (url) => ipcRenderer.invoke('browser-navigate', url),
  browserExecuteJS: (script) => ipcRenderer.invoke('browser-execute-js', script),
  browserScreenshot: () => ipcRenderer.invoke('browser-screenshot'),
  browserGetUrl: () => ipcRenderer.invoke('browser-get-url'),
  browserClose: () => ipcRenderer.invoke('browser-close'),
  browserWaitForElement: (selector, timeout) => ipcRenderer.invoke('browser-wait-for-element', selector, timeout),
  browserClickElement: (selector) => ipcRenderer.invoke('browser-click-element', selector),
  browserFillInput: (selector, value) => ipcRenderer.invoke('browser-fill-input', selector, value),
  browserGetText: (selector) => ipcRenderer.invoke('browser-get-text', selector),

  // ═══════════════════════════════════════════════════════════════
  // OCR 屏幕文字识别
  // ═══════════════════════════════════════════════════════════════
  ocrScreen: (x, y, w, h) => ipcRenderer.invoke('ocr-screen', x, y, w, h),

  // ═══════════════════════════════════════════════════════════════
  // APP 操控 (通达信/同花顺/大智慧等桌面程序)
  // ═══════════════════════════════════════════════════════════════
  appActivate: (appName) => ipcRenderer.invoke('app-activate', appName),
  appListWindows: () => ipcRenderer.invoke('app-list-windows'),

  // ═══════════════════════════════════════════════════════════════
  // A股操盘专用 API
  // ═══════════════════════════════════════════════════════════════
  tradeGetStockInfo: (code) => ipcRenderer.invoke('trade-get-stock-info', code),
  tradePlaceOrder: (params) => ipcRenderer.invoke('trade-place-order', params),
  tradeCancelOrder: (orderId) => ipcRenderer.invoke('trade-cancel-order', orderId),
  tradeGetPositions: () => ipcRenderer.invoke('trade-get-positions'),
  tradeGetOrders: () => ipcRenderer.invoke('trade-get-orders'),
  tradeGetAccount: () => ipcRenderer.invoke('trade-get-account'),
  tradeAutoOperate: (plan) => ipcRenderer.invoke('trade-auto-operate', plan),

  // ═══════════════════════════════════════════════════════════════
  // 云桌面 API
  // ═══════════════════════════════════════════════════════════════
  cloudDesktopStart: () => ipcRenderer.invoke('cloud-desktop-start'),
  cloudDesktopStop: () => ipcRenderer.invoke('cloud-desktop-stop'),
  cloudDesktopOpen: () => ipcRenderer.invoke('cloud-desktop-open'),
  cloudDesktopStatus: () => ipcRenderer.invoke('cloud-desktop-status'),

  // ═══════════════════════════════════════════════════════════════
  // 事件监听
  // ═══════════════════════════════════════════════════════════════
  onTrayAction: (callback) => {
    ipcRenderer.on('tray-action', (event, action) => callback(action));
  },
  onSystemEvent: (callback) => {
    ipcRenderer.on('system-event', (event, data) => callback(data));
  },
  onBluetoothDevice: (callback) => {
    ipcRenderer.on('bluetooth-device-found', (event, device) => callback(device));
  },
  onCameraFrame: (callback) => {
    ipcRenderer.on('camera-frame', (event, data) => callback(data));
  },
});
