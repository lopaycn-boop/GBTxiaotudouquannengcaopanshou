import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  UserIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
  Cog6ToothIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';
import { autoAnimate } from '@formkit/auto-animate';
import toast from 'react-hot-toast';

const models = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    description: '最强大的语言模型，适合复杂任务',
    color: 'from-green-500 to-emerald-600',
    status: 'available',
    maxTokens: 8192
  },
  {
    id: 'claude-3',
    name: 'Claude 3',
    provider: 'Anthropic',
    description: '智能对话助手，擅长推理和分析',
    color: 'from-purple-500 to-pink-600',
    status: 'available',
    maxTokens: 100000
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: '多模态AI模型，支持文本和图像',
    color: 'from-blue-500 to-cyan-600',
    status: 'available',
    maxTokens: 32768
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'DeepSeek AI',
    description: '中文优化的语言模型',
    color: 'from-orange-500 to-red-600',
    status: 'available',
    maxTokens: 32768
  },
  {
    id: 'glm-4',
    name: 'GLM-4',
    provider: '智谱AI',
    description: '通用语言模型，支持中文对话',
    color: 'from-cyan-500 to-blue-600',
    status: 'available',
    maxTokens: 128000
  }
];

const messages = [
  {
    id: 1,
    type: 'user',
    content: '你好，我想了解一下GBTxiaotudou全能操盘手的功能',
    timestamp: new Date(Date.now() - 300000),
    model: 'gpt-4'
  },
  {
    id: 2,
    type: 'assistant',
    content: 'GBTxiaotudou全能操盘手是一个集成了多种AI功能的智能交易助手。主要功能包括：\n\n1. **智能交易分析** - 使用AI分析市场趋势和交易机会\n2. **风险评估** - 实时监控交易风险\n3. **自动化交易** - 支持自动执行交易策略\n4. **数据可视化** - 提供直观的图表和分析报告\n5. **多平台支持** - 支持多个交易市场和平台\n\n您想了解哪个具体功能呢？',
    timestamp: new Date(Date.now() - 290000),
    model: 'gpt-4'
  }
];

const ModelCard = ({ model, isSelected, onSelect }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`relative group cursor-pointer rounded-xl overflow-hidden backdrop-blur-sm border ${
        isSelected 
          ? 'border-white/30 shadow-lg shadow-white/20' 
          : 'border-white/10 hover:border-white/20'
      }`}
      onClick={() => onSelect(model)}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${model.color} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
      
      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-white">{model.name}</h3>
          <div className={`w-2 h-2 rounded-full ${
            model.status === 'available' ? 'bg-green-400' : 
            model.status === 'maintenance' ? 'bg-yellow-400' : 'bg-red-400'
          }`} />
        </div>
        
        <p className="text-xs text-gray-400 mb-2">{model.provider}</p>
        <p className="text-xs text-gray-500">最大token: {model.maxTokens.toLocaleString()}</p>
        
        <p className="text-xs text-gray-400 mt-2 line-clamp-2">{model.description}</p>
      </div>
    </motion.div>
  );
};

const ChatMessage = ({ message, onCopy, onSpeak }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.success('已复制到剪贴板');
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.lang = 'zh-CN';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex max-w-2xl ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 ${message.type === 'user' ? 'ml-3' : 'mr-3'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            message.type === 'user' 
              ? 'bg-gradient-to-br from-blue-500 to-purple-600' 
              : 'bg-gradient-to-br from-green-500 to-emerald-500'
          }`}>
            {message.type === 'user' ? (
              <UserIcon className="w-4 h-4 text-white" />
            ) : (
              <CpuChipIcon className="w-4 h-4 text-white" />
            )}
          </div>
        </div>
        
        <div className={`relative rounded-2xl p-4 ${
          message.type === 'user'
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
            : 'bg-white/10 backdrop-blur-sm border border-white/20 text-gray-100'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs opacity-70">
              {message.type === 'user' ? '用户' : message.model}
            </span>
            <span className="text-xs opacity-50">{formatTime(message.timestamp)}</span>
          </div>
          
          <div className="text-sm whitespace-pre-wrap">
            {message.content}
          </div>
          
          {message.type === 'assistant' && (
            <div className="flex items-center space-x-2 mt-3">
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="复制"
              >
                <DocumentDuplicateIcon className="w-4 h-4 opacity-60 hover:opacity-100" />
              </button>
              <button
                onClick={handleSpeak}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title={isSpeaking ? '停止朗读' : '朗读'}
              >
                {isSpeaking ? (
                  <SpeakerXMarkIcon className="w-4 h-4 opacity-60 hover:opacity-100" />
                ) : (
                  <SpeakerWaveIcon className="w-4 h-4 opacity-60 hover:opacity-100" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const AIChatPage = ({ onBack }) => {
  const [messagesList, setMessagesList] = useState(messages);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const parent = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (parent.current) {
      autoAnimate(parent.current);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messagesList]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMessage = {
      id: messagesList.length + 1,
      type: 'user',
      content: inputText,
      timestamp: new Date(),
      model: selectedModel.id
    };

    setMessagesList(prev => [...prev, newMessage]);
    setInputText('');

    // 模拟AI回复
    setTimeout(() => {
      const aiResponse = {
        id: messagesList.length + 2,
        type: 'assistant',
        content: `我正在使用 ${selectedModel.name} 处理您的问题："${inputText}"\n\n这是一个模拟回复。在实际应用中，这里会连接到相应的AI模型API来生成真实的回复。`,
        timestamp: new Date(),
        model: selectedModel.id
      };
      setMessagesList(prev => [...prev, aiResponse]);
    }, 1000);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      toast.success('开始录音');
    } else {
      toast.success('停止录音');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-400" />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI对话框</h1>
            <p className="text-xs text-gray-400">多模型AI对话助手</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors flex items-center space-x-2"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>{selectedModel.name}</span>
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <Cog6ToothIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
      
      {/* Model Selector */}
      <AnimatePresence>
        {showModelSelector && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-white/10 bg-black/20"
          >
            <div className="p-4">
              <h3 className="text-sm font-medium text-white mb-3">选择AI模型</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {models.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    isSelected={selectedModel.id === model.id}
                    onSelect={(model) => {
                      setSelectedModel(model);
                      setShowModelSelector(false);
                      toast.success(`已切换到 ${model.name}`);
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4" ref={parent}>
        <div className="max-w-4xl mx-auto">
          {messagesList.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onCopy={() => {}}
              onSpeak={() => {}}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Input Area */}
      <div className="border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入您的问题..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex flex-col space-y-2">
              <button
                onClick={toggleRecording}
                className={`p-3 rounded-xl transition-colors ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-white/10 hover:bg-white/20'
                }`}
                title={isRecording ? '停止录音' : '开始录音'}
              >
                <MicrophoneIcon className={`w-5 h-5 ${isRecording ? 'text-white' : 'text-gray-400'}`} />
              </button>
              
              <button
                onClick={handleSend}
                disabled={!inputText.trim()}
                className={`p-3 rounded-xl transition-colors ${
                  inputText.trim()
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white'
                    : 'bg-white/10 text-gray-500 cursor-not-allowed'
                }`}
                title="发送"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>当前模型: {selectedModel.name}</span>
              <span>最大token: {selectedModel.maxTokens.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>支持快捷键: Enter发送, Shift+Enter换行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatPage;