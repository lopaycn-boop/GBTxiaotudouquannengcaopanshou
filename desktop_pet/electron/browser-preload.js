// browser-preload.js — 小土豆操盘浏览器窗口的 preload
// 提供安全的桥接让主进程操控浏览器内容
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('potatoBrowser', {
  // 允许网页主动通知主进程（如页面加载完成、关键元素出现）
  notifyReady: (info) => ipcRenderer.send('browser-page-ready', info),
  notifyEvent: (eventName, data) => ipcRenderer.send('browser-event', { eventName, data }),

  // 接收主进程指令
  onCommand: (callback) => {
    ipcRenderer.on('browser-command', (event, cmd) => callback(cmd));
  },
});
