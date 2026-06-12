import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeftIcon,
  CloudIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { autoAnimate } from '@formkit/auto-animate';
import toast from 'react-hot-toast';
import HDCloudDesktop from '../components/HDCloudDesktop';

const cloudServers = [
  {
    id: 'server-1',
    name: '开发服务器-01',
    description: 'Ubuntu 22.04 LTS 开发环境',
    status: 'running',
    os: 'Ubuntu 22.04 LTS',
    cpu: '4核',
    memory: '8GB',
    storage: '100GB SSD',
    region: '北京',
    ip: '192.168.1.100',
    uptime: '3天12小时',
    cost: '￥120/月'
  },
  {
    id: 'server-2',
    name: '测试服务器-02',
    description: 'Windows Server 2022 测试环境',
    status: 'stopped',
    os: 'Windows Server 2022',
    cpu: '8核',
    memory: '16GB',
    storage: '200GB SSD',
    region: '上海',
    ip: '192.168.1.101',
    uptime: '0小时',
    cost: '￥280/月'
  },
  {
    id: 'server-3',
    name: '生产服务器-03',
    description: 'CentOS 8 生产环境',
    status: 'running',
    os: 'CentOS 8',
    cpu: '16核',
    memory: '32GB',
    storage: '500GB SSD',
    region: '深圳',
    ip: '192.168.1.102',
    uptime: '15天8小时',
    cost: '￥580/月'
  }
];

const CloudServerCard = ({ server, onConnect, onDelete }) => {
  const getStatusColor = () => {
    switch (server.status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'starting': return 'bg-yellow-500';
      case 'stopping': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (server.status) {
      case 'running': return '运行中';
      case 'stopped': return '已停止';
      case 'starting': return '启动中';
      case 'stopping': return '停止中';
      default: return '未知';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="relative group cursor-pointer rounded-2xl overflow-hidden backdrop-blur-sm border border-white/10 hover:border-white/20"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-600 opacity-10 group-hover:opacity-20 transition-opacity duration-300" />
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
              <CloudIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{server.name}</h3>
              <p className="text-sm text-gray-400">{server.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <span className="text-xs text-gray-400">{getStatusText()}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-xs">
            <span className="text-gray-500">操作系统:</span>
            <span className="text-white ml-1">{server.os}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">CPU:</span>
            <span className="text-white ml-1">{server.cpu}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">内存:</span>
            <span className="text-white ml-1">{server.memory}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">存储:</span>
            <span className="text-white ml-1">{server.storage}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">区域:</span>
            <span className="text-white ml-1">{server.region}</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">IP:</span>
            <span className="text-white ml-1">{server.ip}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <ClockIcon className="w-3 h-3 inline mr-1" />
            {server.uptime} • {server.cost}
          </div>
          
          <div className="flex items-center space-x-2">
            {server.status === 'running' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect(server);
                }}
                className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 transition-colors text-green-400"
                title="连接"
              >
                <CloudIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect(server);
                }}
                className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 transition-colors text-blue-400"
                title="启动"
              >
                <CloudIcon className="w-4 h-4" />
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(server);
              }}
              className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-400"
              title="删除"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const CloudComputerPage = ({ onBack }) => {
  const [servers, setServers] = useState(cloudServers);
  const [searchTerm, setSearchTerm] = useState('');
  const parent = useRef(null);
  const [selectedServer, setSelectedServer] = useState(null);
  const [showRemoteDesktop, setShowRemoteDesktop] = useState(false);

  useEffect(() => {
    if (parent.current) {
      autoAnimate(parent.current);
    }
  }, []);

  const filteredServers = servers.filter(server =>
    server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.os.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConnect = (server) => {
    setSelectedServer(server);
    setShowRemoteDesktop(true);
    toast.success(`正在连接到 ${server.name}`);
  };

  const handleDelete = (server) => {
    setServers(prev => prev.filter(s => s.id !== server.id));
    toast.success(`${server.name} 已删除`);
  };

  const handleAddServer = () => {
    const newServer = {
      id: `server-${Date.now()}`,
      name: '新服务器',
      description: '描述信息',
      status: 'stopped',
      os: 'Ubuntu 22.04 LTS',
      cpu: '2核',
      memory: '4GB',
      storage: '50GB SSD',
      region: '北京',
      ip: '192.168.1.x',
      uptime: '0小时',
      cost: '￥80/月'
    };
    
    setServers(prev => [...prev, newServer]);
    toast.success('新服务器已添加');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-400" />
          </button>
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
            <CloudIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">云电脑</h1>
            <p className="text-sm text-gray-400">远程云桌面和开发环境 - 高清3D液晶显示</p>
          </div>
        </div>
        
        <button
          onClick={handleAddServer}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all duration-200 flex items-center space-x-2"
        >
          <PlusIcon className="w-5 h-5" />
          <span>创建服务器</span>
        </button>
      </div>
      
      {/* Search Bar */}
      <div className="p-6 border-b border-white/10">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索云服务器..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          <svg
            className="absolute left-4 top-3.5 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      
      {/* Servers Grid */}
      <div className="p-6">
        <div ref={parent} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredServers.map((server) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <CloudServerCard
                  server={server}
                  onConnect={handleConnect}
                  onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredServers.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CloudIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">未找到匹配的服务器</h3>
            <p className="text-gray-500">尝试其他搜索关键词或创建新服务器</p>
          </div>
        )}
      </div>
      
      {/* 高清云电脑远程桌面 */}
      <AnimatePresence>
        {showRemoteDesktop && selectedServer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowRemoteDesktop(false)}
          >
            <motion.div
              className="relative w-full max-w-6xl"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
            >
              <HDCloudDesktop
                server={selectedServer}
                onClose={() => setShowRemoteDesktop(false)}
                onFullscreen={() => {}}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CloudComputerPage;