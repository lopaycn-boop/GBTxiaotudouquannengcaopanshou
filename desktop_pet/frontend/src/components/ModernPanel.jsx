import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XMarkIcon,
  CodeBracketIcon,
  ChatBubbleLeftRightIcon,
  CloudIcon,
  SparklesIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

const modules = [
  {
    id: 'programming-tools',
    name: '编程工具',
    description: '集成多种编程开发工具和环境',
    icon: CodeBracketIcon,
    color: 'from-blue-500 to-blue-600',
    features: ['VS Code', 'Git', 'Docker', 'Terminal', 'File Manager']
  },
  {
    id: 'ai-chat',
    name: 'AI对话',
    description: '多模型AI对话助手',
    icon: ChatBubbleLeftRightIcon,
    color: 'from-purple-500 to-pink-600',
    features: ['GPT-4', 'Claude 3', 'Gemini Pro', 'DeepSeek', 'GLM-4']
  },
  {
    id: 'cloud-computer',
    name: '云电脑',
    description: '远程云桌面和开发环境',
    icon: CloudIcon,
    color: 'from-cyan-500 to-blue-600',
    features: ['4K显示', '远程连接', '多系统支持', '高性能']
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    description: '智能数据分析和可视化',
    icon: DocumentTextIcon,
    color: 'from-green-500 to-emerald-600',
    features: ['Python', 'R', 'Jupyter', 'Pandas', 'Matplotlib']
  },
  {
    id: 'api-testing',
    name: 'API测试',
    description: 'API开发和测试工具',
    icon: BeakerIcon,
    color: 'from-orange-500 to-red-600',
    features: ['Postman', 'Swagger', 'REST', 'GraphQL', 'WebSocket']
  },
  {
    id: 'system-monitor',
    name: '系统监控',
    description: '实时系统性能监控',
    icon: CpuChipIcon,
    color: 'from-gray-500 to-gray-600',
    features: ['CPU', '内存', '磁盘', '网络', '进程']
  }
];

const ModuleCard = ({ module, isSelected, onSelect }) => {
  const Icon = module.icon;
  
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`relative group cursor-pointer rounded-2xl overflow-hidden backdrop-blur-sm border ${
        isSelected 
          ? 'border-white/30 shadow-lg shadow-white/20' 
          : 'border-white/10 hover:border-white/20'
      }`}
      onClick={() => onSelect(module)}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${module.color} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{module.name}</h3>
              <p className="text-sm text-gray-400">{module.description}</p>
            </div>
          </div>
          
          {isSelected && (
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {module.features.slice(0, 3).map((feature, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-white/10 rounded-full text-xs text-gray-300"
            >
              {feature}
            </span>
          ))}
          {module.features.length > 3 && (
            <span className="px-2 py-1 bg-white/10 rounded-full text-xs text-gray-300">
              +{module.features.length - 3}
            </span>
          )}
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <SparklesIcon className="w-3 h-3 text-cyan-400" />
            <span className="text-xs text-cyan-400">现代化</span>
          </div>
          
          <ArrowRightIcon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
        </div>
      </div>
    </motion.div>
  );
};

const ModernPanel = ({ onModuleSelect, selectedModule, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl border border-white/20 w-full max-w-6xl max-h-[90vh] overflow-hidden"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
              <SparklesIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">GBTxiaotudou</h1>
              <p className="text-sm text-gray-400">全栈编程现代化面板</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                isSelected={selectedModule?.id === module.id}
                onSelect={onModuleSelect}
              />
            ))}
          </div>
          
          {/* Info Section */}
          <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-3">功能特点</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-sm text-gray-300">现代化界面设计</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                <span className="text-sm text-gray-300">高清3D液晶显示</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full" />
                <span className="text-sm text-gray-300">流畅动画效果</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-cyan-400 rounded-full" />
                <span className="text-sm text-gray-300">响应式布局</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full" />
                <span className="text-sm text-gray-300">智能交互</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-pink-400 rounded-full" />
                <span className="text-sm text-gray-300">多平台支持</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>版本 1.0.0</span>
            <span>© 2024 GBTxiaotudou 全能操盘手</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ModernPanel;