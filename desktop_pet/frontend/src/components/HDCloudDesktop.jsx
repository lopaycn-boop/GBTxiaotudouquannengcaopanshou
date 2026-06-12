import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ComputerDesktopIcon,
  PlayIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
  ClockIcon,
  WifiIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

const HDCloudDesktop = ({ server, onClose, onFullscreen }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState('4k');
  const [fps, setFps] = useState(60);
  const [bandwidth, setBandwidth] = useState(100);
  const desktopRef = useRef(null);

  useEffect(() => {
    let hideControlsTimer;
    if (showControls && isConnected) {
      hideControlsTimer = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(hideControlsTimer);
  }, [showControls, isConnected]);

  const handleConnect = () => {
    setIsConnected(true);
    setTimeout(() => {
      setShowControls(false);
    }, 2000);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleFullscreen = () => {
    if (desktopRef.current) {
      if (desktopRef.current.requestFullscreen) {
        desktopRef.current.requestFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
    if (onFullscreen) onFullscreen();
  };

  const renderDesktopContent = () => {
    return (
      <div className="relative w-full h-full bg-black">
        {/* 高清桌面背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
          {/* 网格背景 */}
          <div className="absolute inset-0 opacity-10">
            <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiIC8+PC9zdmc+')]"/>
          </div>
          
          {/* 桌面图标区域 */}
          <div className="absolute inset-8 p-4">
            <div className="grid grid-cols-8 gap-4">
              {Array.from({ length: 32 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center space-y-1 opacity-80 hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/10">
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-cyan-400 rounded" />
                  </div>
                  <span className="text-xs text-gray-300 text-center leading-tight">应用{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 任务栏 */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/90 to-black/50 backdrop-blur-sm border-t border-white/10">
            <div className="flex items-center h-full px-2">
              <div className="flex items-center space-x-1">
                <div className="w-6 h-6 bg-green-500/20 rounded border border-green-500/30 flex items-center justify-center">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                </div>
                <span className="text-xs text-green-400">已连接</span>
              </div>
              
              <div className="flex-1 flex items-center justify-center space-x-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="w-16 h-6 bg-white/10 rounded border border-white/20 flex items-center justify-center">
                    <span className="text-xs text-gray-400">程序{i + 1}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center space-x-2 text-xs text-gray-400">
                <ClockIcon className="w-3 h-3" />
                <span>{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>

          {/* 高清效果覆盖层 */}
          <div className="absolute inset-0 pointer-events-none">
            {/* 扫描线效果 */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/2 to-transparent animate-scan" style={{
              animation: 'scan 4s linear infinite'
            }} />
            
            {/* CRT 效果 */}
            <div className="absolute inset-0 opacity-20">
              <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,transparent_0%,black_100%)]" />
            </div>
          </div>
        </div>

        {/* 连接状态覆盖层 */}
        {!isConnected && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-2xl">
                <ComputerDesktopIcon className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">连接到 {server.name}</h3>
              <p className="text-gray-400 mb-6">{server.ip} • {server.os}</p>
              
              <button
                onClick={handleConnect}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex items-center space-x-2"
              >
                <PlayIcon className="w-5 h-5" />
                <span>开始连接</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* 高清云电脑容器 */}
      <div 
        ref={desktopRef}
        className="relative w-full h-[500px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/20"
        style={{
          transform: 'perspective(1200px) rotateX(2deg) rotateY(-2deg)',
          transformStyle: 'preserve-3d',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowControls(false)}
      >
        {renderDesktopContent()}

        {/* 控制层 */}
        <AnimatePresence>
          {showControls && isConnected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/80 pointer-events-auto"
            >
              {/* 顶部控制栏 */}
              <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <ComputerDesktopIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{server.name}</h3>
                    <p className="text-xs text-gray-400">{server.ip} • {server.os}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full">HD</span>
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full">4K</span>
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">60fps</span>
                  </div>
                  
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    title="设置"
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4 text-gray-400" />
                  </button>
                  
                  <button
                    onClick={handleFullscreen}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    title="全屏"
                  >
                    <ArrowsPointingOutIcon className="w-4 h-4 text-gray-400" />
                  </button>
                  
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                    title="断开连接"
                  >
                    <XMarkIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* 底部状态栏 */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <div className="flex items-center space-x-1">
                      <CpuChipIcon className="w-3 h-3" />
                      <span>CPU: 45%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MemoryStickIcon className="w-3 h-3" />
                      <span>内存: 62%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <WifiIcon className="w-3 h-3" />
                      <span>延迟: 12ms</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <SignalIcon className="w-3 h-3" />
                      <span>带宽: {bandwidth}Mbps</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400">在线</span>
                    </div>
                    <span className="text-xs text-gray-500">分辨率: 1920x1080</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 设置面板 */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-4 right-4 w-64 bg-black/90 backdrop-blur-sm border border-white/20 rounded-xl p-4"
            >
              <h4 className="text-white font-medium mb-3">显示设置</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">画质</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                  >
                    <option value="720p">720p HD</option>
                    <option value="1080p">1080p FHD</option>
                    <option value="4k">4K UHD</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">帧率</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                  >
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                    <option value={120}>120 FPS</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">带宽限制</label>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    value={bandwidth}
                    onChange={(e) => setBandwidth(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10Mbps</span>
                    <span>{bandwidth}Mbps</span>
                    <span>1Gbps</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-white/10">
                <button
                  onClick={handleDisconnect}
                  className="w-full px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                >
                  断开连接
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3D 阴影效果 */}
      <div className="absolute -bottom-4 left-4 right-4 h-8 bg-gradient-to-t from-black/50 to-transparent rounded-b-2xl blur-xl" />
    </div>
  );
};

export default HDCloudDesktop;