import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeftIcon,
  CodeBracketIcon,
  TerminalIcon,
  FolderIcon,
  WrenchScrewdriverIcon,
  PlayIcon,
  StopIcon,
  PlusIcon,
  TrashIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CommandLineIcon,
  ServerIcon,
  BeakerIcon
} from '@heroicons/react/24/outline';
import { autoAnimate } from '@formkit/auto-animate';
import toast from 'react-hot-toast';

const tools = [
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Visual Studio Code 集成开发环境',
    icon: CodeBracketIcon,
    color: 'from-blue-500 to-blue-600',
    status: 'running',
    version: '1.87.2',
    port: 3000
  },
  {
    id: 'git',
    name: 'Git',
    description: '版本控制系统',
    icon: ArrowPathIcon,
    color: 'from-orange-500 to-red-500',
    status: 'installed',
    version: '2.39.0'
  },
  {
    id: 'docker',
    name: 'Docker',
    description: '容器化平台',
    icon: ServerIcon,
    color: 'from-cyan-500 to-blue-500',
    status: 'running',
    version: '24.0.7'
  },
  {
    id: 'postman',
    name: 'Postman',
    description: 'API测试工具',
    icon: BeakerIcon,
    color: 'from-green-500 to-emerald-500',
    status: 'stopped',
    version: '10.24.0'
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: '命令行终端',
    icon: CommandLineIcon,
    color: 'from-gray-500 to-gray-600',
    status: 'running',
    version: 'builtin'
  },
  {
    id: 'file-manager',
    name: 'File Manager',
    description: '文件管理器',
    icon: FolderIcon,
    color: 'from-purple-500 to-pink-500',
    status: 'running',
    version: '1.0.0'
  }
];

const ToolCard = ({ tool, onToggle, onConfigure, onDelete }) => {
  const Icon = tool.icon;
  
  const getStatusColor = () => {
    switch (tool.status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'installing': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (tool.status) {
      case 'running': return '运行中';
      case 'stopped': return '已停止';
      case 'installing': return '安装中';
      case 'installed': return '已安装';
      default: return '未知';
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="relative group cursor-pointer rounded-2xl overflow-hidden backdrop-blur-sm border border-white/10 hover:border-white/20"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tool.color} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${tool.color} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{tool.name}</h3>
              <p className="text-sm text-gray-400">{tool.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <span className="text-xs text-gray-400">{getStatusText()}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            版本 {tool.version}
            {tool.port && <span className="ml-2">端口 {tool.port}</span>}
          </div>
          
          <div className="flex items-center space-x-2">
            {tool.status === 'running' || tool.status === 'stopped' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(tool);
                }}
                className={`p-2 rounded-lg transition-colors ${
                  tool.status === 'running' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400' 
                    : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                }`}
                title={tool.status === 'running' ? '停止' : '启动'}
              >
                {tool.status === 'running' ? (
                  <StopIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
              </button>
            ) : null}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfigure(tool);
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-gray-400"
              title="配置"
            >
              <Cog6ToothIcon className="w-4 h-4" />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(tool);
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

const ProgrammingToolsPage = ({ onBack }) => {
  const [toolsList, setToolsList] = useState(tools);
  const [searchTerm, setSearchTerm] = useState('');
  const parent = useRef(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    if (parent.current) {
      autoAnimate(parent.current);
    }
  }, []);

  const filteredTools = toolsList.filter(tool =>
    tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tool.features.some(feature => 
      feature.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleToggleTool = (tool) => {
    setToolsList(prev =>
      prev.map(t =>
        t.id === tool.id
          ? { ...t, status: t.status === 'running' ? 'stopped' : 'running' }
          : t
      )
    );
    
    toast.success(`${tool.name} ${tool.status === 'running' ? '已停止' : '已启动'}`);
  };

  const handleConfigureTool = (tool) => {
    setSelectedTool(tool);
    setShowConfig(true);
  };

  const handleDeleteTool = (tool) => {
    setToolsList(prev => prev.filter(t => t.id !== tool.id));
    toast.success(`${tool.name} 已删除`);
  };

  const handleAddTool = () => {
    const newTool = {
      id: `tool-${Date.now()}`,
      name: '新工具',
      description: '描述信息',
      icon: WrenchScrewdriverIcon,
      color: 'from-gray-500 to-gray-600',
      status: 'installed',
      version: '1.0.0'
    };
    
    setToolsList(prev => [...prev, newTool]);
    toast.success('新工具已添加');
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
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <CodeBracketIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">编程工具多元化</h1>
            <p className="text-sm text-gray-400">集成多种编程开发工具和环境</p>
          </div>
        </div>
        
        <button
          onClick={handleAddTool}
          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 flex items-center space-x-2"
        >
          <PlusIcon className="w-5 h-5" />
          <span>添加工具</span>
        </button>
      </div>
      
      {/* Search Bar */}
      <div className="p-6 border-b border-white/10">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索编程工具..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
      
      {/* Tools Grid */}
      <div className="p-6">
        <div ref={parent} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredTools.map((tool) => (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ToolCard
                  tool={tool}
                  onToggle={handleToggleTool}
                  onConfigure={handleConfigureTool}
                  onDelete={handleDeleteTool}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredTools.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CodeBracketIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">未找到匹配的工具</h3>
            <p className="text-gray-500">尝试其他搜索关键词或添加新工具</p>
          </div>
        )}
      </div>
      
      {/* Configuration Modal */}
      <AnimatePresence>
        {showConfig && selectedTool && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowConfig(false)}
          >
            <motion.div
              className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl border border-white/20 p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
            >
              <h3 className="text-xl font-bold text-white mb-4">配置 {selectedTool.name}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">工具名称</label>
                  <input
                    type="text"
                    defaultValue={selectedTool.name}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">描述</label>
                  <textarea
                    defaultValue={selectedTool.description}
                    rows={3}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">端口</label>
                  <input
                    type="number"
                    defaultValue={selectedTool.port || ''}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowConfig(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowConfig(false);
                    toast.success('配置已保存');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProgrammingToolsPage;