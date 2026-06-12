import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowsPointingOutIcon,
  XMarkIcon,
  PlayIcon,
  PauseIcon,
  VolumeUpIcon,
  VolumeXMarkIcon,
  ViewfinderCircleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

const HD3DDisplay = ({ title, content, onClose, onFullscreen }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const displayRef = useRef(null);

  useEffect(() => {
    let hideControlsTimer;
    if (showControls && isPlaying) {
      hideControlsTimer = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(hideControlsTimer);
  }, [showControls, isPlaying]);

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleFullscreen = () => {
    if (displayRef.current) {
      if (displayRef.current.requestFullscreen) {
        displayRef.current.requestFullscreen();
      }
    }
    if (onFullscreen) onFullscreen();
  };

  const render3DContent = () => {
    return (
      <div className="relative w-full h-full bg-black">
        {/* 3D 液晶背景效果 */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-cyan-900/20" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiIC8+PC9zdmc+')] opacity-20" />
          
          {/* 3D 深度效果 */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-gradient-to-r from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-1/3 h-1/3 bg-gradient-to-r from-purple-400/10 to-pink-400/10 rounded-full blur-3xl animate-pulse delay-1000" />
            <div className="absolute top-1/3 left-1/3 w-1/4 h-1/4 bg-gradient-to-r from-green-400/10 to-emerald-400/10 rounded-full blur-3xl animate-pulse delay-2000" />
          </div>

          {/* 高清内容区域 */}
          <div className="absolute inset-4 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="mb-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-2xl">
                  <ViewfinderCircleIcon className="w-10 h-10 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400">
                {title}
              </h2>
              <p className="text-gray-300 mb-6">{content}</p>
              
              {/* 3D 效果指示器 */}
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>3D HD</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span>液晶屏</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <span>4K</span>
                </div>
              </div>
            </div>
          </div>

          {/* 液晶屏扫描线效果 */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent animate-scan" style={{
              animation: 'scan 8s linear infinite'
            }} />
          </div>
        </div>

        {/* 3D 边框效果 */}
        <div className="absolute inset-0 border-2 border-white/20 rounded-lg pointer-events-none">
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-cyan-400 rounded-full shadow-lg" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full shadow-lg" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-400 rounded-full shadow-lg" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full shadow-lg" />
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* 3D 液晶显示容器 */}
      <div 
        ref={displayRef}
        className="relative w-full h-96 bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/20"
        style={{
          transform: 'perspective(1000px) rotateX(5deg) rotateY(-5deg)',
          transformStyle: 'preserve-3d',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowControls(false)}
      >
        {render3DContent()}

        {/* 控制层 */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/80 pointer-events-auto"
            >
              {/* 顶部控制栏 */}
              <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h3 className="text-white font-semibold text-lg">{title}</h3>
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full">HD</span>
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full">3D</span>
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">4K</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
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
                    title="关闭"
                  >
                    <XMarkIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>

              {/* 底部控制栏 */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={togglePlay}
                      className="p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      title={isPlaying ? '暂停' : '播放'}
                    >
                      {isPlaying ? (
                        <PauseIcon className="w-5 h-5 text-white" />
                      ) : (
                        <PlayIcon className="w-5 h-5 text-white" />
                      )}
                    </button>
                    
                    <button
                      onClick={toggleMute}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      title={isMuted ? '取消静音' : '静音'}
                    >
                      {isMuted ? (
                        <VolumeXMarkIcon className="w-4 h-4 text-gray-400" />
                      ) : (
                        <VolumeUpIcon className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <span>亮度: {brightness}%</span>
                    <span>对比度: {contrast}%</span>
                    <span>饱和度: {saturation}%</span>
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
                  <label className="text-xs text-gray-400 block mb-1">亮度</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={brightness}
                    onChange={(e) => setBrightness(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">对比度</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={contrast}
                    onChange={(e) => setContrast(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">饱和度</label>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={saturation}
                    onChange={(e) => setSaturation(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-white/10">
                <button
                  onClick={() => {
                    setBrightness(100);
                    setContrast(100);
                    setSaturation(100);
                  }}
                  className="w-full px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors"
                >
                  重置设置
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

export default HD3DDisplay;