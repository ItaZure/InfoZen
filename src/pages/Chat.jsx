import { useState, useRef, useEffect } from 'react';
import { Component } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Textarea from '../components/common/Textarea';
import Button from '../components/common/Button';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Breadcrumb from '../components/chat/Breadcrumb';
import LearningLog from '../components/chat/LearningLog';
import NotesEditor from '../components/chat/NotesEditor';
import ImagePreview from '../components/chat/ImagePreview';
import ImageModal from '../components/chat/ImageModal';
import copyIcon from '../assets/icons/copy.png';
import refreshIcon from '../assets/icons/refresh.png';
import deleteIcon from '../assets/icons/delete.png';

class MessageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error('Message render error:', err); }
  render() {
    if (this.state.hasError) {
      return <p className="font-sans leading-relaxed whitespace-pre-wrap break-words">{this.props.rawContent}</p>;
    }
    return this.props.children;
  }
}

const CodeBlock = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);

  const handleCopy = () => {
    const text = preRef.current?.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code mb-3">
      <pre ref={preRef} className="bg-muted rounded-md p-3 overflow-x-auto text-sm font-mono">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className={`absolute top-2 right-2 text-xs px-2 py-1 rounded opacity-0 group-hover/code:opacity-100 transition-all duration-150 ${
          copied ? 'text-green-600' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
};

const markdownComponents = {
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h1 className="font-serif text-xl font-bold mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="font-serif text-lg font-semibold mt-4 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="font-serif text-base font-semibold mt-3 mb-1">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ inline, children }) => inline
    ? <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{children}</code>
    : <code className="font-mono text-sm">{children}</code>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-accent pl-3 text-muted-foreground mb-3 italic">{children}</blockquote>,
  a: ({ href, children }) => <a href={href} className="text-accent underline hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>,
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full border-collapse text-sm">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border border-border">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border border-border">{children}</td>,
};

const Chat = () => {
  const [selectedTopic, setSelectedTopic] = useState('自由主题');
  const [topicData, setTopicData] = useState({
    '自由主题': { messages: [], tree: [], counter: 0, notes: '', logs: [] },
    '产品技术': { messages: [], tree: [], counter: 0, notes: '', logs: [] },
    '哲学': { messages: [], tree: [], counter: 0, notes: '', logs: [] },
    '商业': { messages: [], tree: [], counter: 0, notes: '', logs: [] },
    '英语': { messages: [], tree: [], counter: 0, notes: '', logs: [] },
  });
  const [inputValue, setInputValue] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [pastedImages, setPastedImages] = useState([]);
  const [viewingImage, setViewingImage] = useState(null);
  const [logViewMode, setLogViewMode] = useState('tree'); // 'tree' 或 'log'
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingTopic, setStreamingTopic] = useState(null); // 追踪正在流式回复的话题
  const [showSettings, setShowSettings] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState('low');
  const [webSearch, setWebSearch] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isUpdatingLog, setIsUpdatingLog] = useState(false);
  const settingsRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});

  const topics = ['自由主题', '产品技术', '哲学', '商业', '英语'];
  const currentData = topicData[selectedTopic];

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentData.messages]);

  useEffect(() => {
    if (!showSettings) return;
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  // 滚动到特定消息
  const scrollToMessage = (messageId) => {
    messageRefs.current[messageId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };

  // 加载话题数据
  const loadTopicData = async (topic) => {
    try {
      const res = await fetch(`/api/topics/${encodeURIComponent(topic)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTopicData((prev) => {
        // 检测是否有正在进行的流式回复
        // 如果当前正在加载且话题匹配，说明有未持久化的消息，不应该被覆盖
        const hasOngoingStream = isLoading && streamingTopic === topic;

        if (hasOngoingStream) {
          // 保留前端 state 的 messages 和 tree，只更新其他字段
          return {
            ...prev,
            [topic]: {
              ...prev[topic],
              notes: data.notes,
              logs: data.logs.length > 0 ? data.logs : prev[topic].logs,
              activityDates: data.activityDates,
            },
          };
        }

        // 没有正在进行的流式回复，正常加载数据
        return {
          ...prev,
          [topic]: {
            messages: data.messages,
            tree: data.tree,
            counter: data.messages.length,
            notes: data.notes,
            logs: data.logs.length > 0 ? data.logs : prev[topic].logs,
            activityDates: data.activityDates,
          },
        };
      });
    } catch (err) {
      console.error('Load topic data failed:', err);
    }
  };

  // 页面加载时加载当前话题
  useEffect(() => {
    loadTopicData(selectedTopic);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切换主题
  const handleTopicChange = (topic) => {
    setSelectedTopic(topic);
    setSelectedNode(null);
    setHighlightedMessageId(null);
    setPastedImages([]); // 清空图片
    loadTopicData(topic);
  };

  // 获取从根节点到指定节点的路径
  const getNodePath = (tree, targetNodeId) => {
    if (!targetNodeId) return [];

    const findPath = (nodes, target, currentPath = []) => {
      for (const node of nodes) {
        const newPath = [...currentPath, node];
        if (node.id === target) {
          return newPath;
        }
        if (node.children && node.children.length > 0) {
          const result = findPath(node.children, target, newPath);
          if (result) return result;
        }
      }
      return null;
    };

    return findPath(tree, targetNodeId) || [];
  };

  // 发送消息
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessageId = Date.now();
    const aiMessageId = userMessageId + 1;
    const messageContent = inputValue;

    // 创建用户消息
    const userMessage = {
      id: userMessageId,
      type: 'user',
      content: messageContent,
      images: [...pastedImages], // 包含图片
      timestamp: new Date(),
    };

    // 创建树节点
    const treeNode = {
      id: userMessageId,
      label: messageContent.substring(0, 20) + (messageContent.length > 20 ? '...' : ''),
      userMessageId: userMessageId,
      aiMessageId: aiMessageId,
      content: messageContent, // 保存完整内容
      summarized: false, // 是否已总结
      children: [],
    };

    // 获取当前选中节点的路径（用于生成 AI 回复）
    let contextPath = [];
    if (selectedNode) {
      contextPath = getNodePath(currentData.tree, selectedNode);
    }

    // 更新状态 - 只更新一次
    setTopicData((prev) => {
      const newData = { ...prev };
      const topic = { ...newData[selectedTopic] };
      const newCounter = topic.counter + 1;

      // 添加用户消息 + 空 AI 占位
      topic.messages = [
        ...topic.messages,
        userMessage,
        { id: aiMessageId, type: 'ai', content: '', timestamp: new Date() },
      ];

      // 更新树结构
      let newTree = JSON.parse(JSON.stringify(topic.tree)); // 深拷贝
      if (selectedNode) {
        // 如果有选中的节点，添加为子节点
        const addChild = (nodes) => {
          for (const node of nodes) {
            if (node.id === selectedNode) {
              node.children.push(treeNode);
              return true;
            }
            if (node.children && node.children.length > 0) {
              if (addChild(node.children)) return true;
            }
          }
          return false;
        };
        addChild(newTree);
      } else {
        // 否则添加为根节点
        newTree.push(treeNode);
      }

      topic.tree = newTree;
      topic.counter = newCounter;
      newData[selectedTopic] = topic;

      return newData;
    });

    // 清空输入
    setSelectedNode(userMessageId);
    setInputValue('');
    setPastedImages([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // 构造上下文消息
    const capturedTopic = selectedTopic;
    const contextMessages = contextPath.map((node) => {
      const userMsg = currentData.messages.find((m) => m.id === node.userMessageId);
      const aiMsg = currentData.messages.find((m) => m.id === node.aiMessageId);
      return {
        userContent: userMsg?.content || '',
        userImages: userMsg?.images || [],
        aiContent: aiMsg?.content || '',
      };
    });

    // 流式调用后端 API
    setIsLoading(true);
    setStreamingTopic(capturedTopic); // 标记正在流式回复的话题
    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: capturedTopic,
          message: messageContent,
          images: userMessage.images,
          parentNodeId: selectedNode || null,
          contextMessages,
          thinkingLevel,
          webSearch,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedAiContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulatedAiContent += delta;
              // 使用累积的完整内容更新，而不是增量追加
              setTopicData((prev) => {
                const newData = { ...prev };
                const topic = { ...newData[capturedTopic] };
                topic.messages = topic.messages.map((m) =>
                  m.id === aiMessageId ? { ...m, content: accumulatedAiContent } : m
                );
                newData[capturedTopic] = topic;
                return newData;
              });
            }
          } catch (e) { /* 跳过格式错误的 chunk */ }
        }
      }
      // 流式结束后持久化
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: capturedTopic,
            userMessage: {
              id: userMessageId,
              content: messageContent,
              images: userMessage.images,
              timestamp: userMessage.timestamp instanceof Date
                ? userMessage.timestamp.toISOString()
                : String(userMessage.timestamp),
            },
            aiMessage: {
              id: aiMessageId,
              content: accumulatedAiContent,
              timestamp: new Date().toISOString(),
            },
            treeNode: {
              id: treeNode.id,
              parentId: selectedNode || null,
              label: treeNode.label,
              content: treeNode.content,
            },
          }),
        });
        // 持久化成功后重新加载数据，同步树结构
        await loadTopicData(capturedTopic);
      } catch (saveErr) {
        console.error('Save conversation failed:', saveErr);
      }
    } catch (err) {
      console.error('Streaming failed:', err);
      setTopicData((prev) => {
        const newData = { ...prev };
        const topic = { ...newData[capturedTopic] };
        topic.messages = topic.messages.map((m) =>
          m.id === aiMessageId ? { ...m, content: '抱歉，AI 服务暂时不可用，请稍后重试。' } : m
        );
        newData[capturedTopic] = topic;
        return newData;
      });
    } finally {
      setIsLoading(false);
      setStreamingTopic(null); // 清除流式回复标记
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        // 检查是否已经达到最大数量
        if (pastedImages.length >= 5) {
          alert('最多只能上传 5 张图片');
          return;
        }

        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setPastedImages(prev => {
              if (prev.length < 5) {
                return [...prev, event.target.result];
              }
              return prev;
            });
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleRemoveImage = (index) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  };

  // 根据消息ID在树中查找节点
  const findNodeByMessageId = (tree, messageId, searchKey = 'userMessageId') => {
    for (const node of tree) {
      if (node[searchKey] === messageId) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNodeByMessageId(node.children, messageId, searchKey);
        if (found) return found;
      }
    }
    return null;
  };

  // 点击树节点
  const handleNodeClick = (node) => {
    setSelectedNode(node.id);
    setHighlightedMessageId(node.aiMessageId);
    // 滚动到用户消息
    scrollToMessage(node.userMessageId);
  };

  // 复制消息内容
  const handleCopy = (e, content, msgId) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // 刷新消息：重新生成 AI 回复
  const handleRefreshMessage = async (e, aiMessageId) => {
    e.stopPropagation();

    // 找到对应的树节点
    const node = findNodeByMessageId(currentData.tree, aiMessageId, 'aiMessageId');
    if (!node) return;

    // 找到该节点的父节点路径（不包含当前节点）
    const getParentPath = (tree, targetId, path = []) => {
      for (const node of tree) {
        if (node.id === targetId) {
          return path;
        }
        if (node.children && node.children.length > 0) {
          const found = getParentPath(node.children, targetId, [...path, node]);
          if (found) return found;
        }
      }
      return null;
    };

    const parentPath = getParentPath(currentData.tree, node.id) || [];

    // 构造上下文消息（父节点路径）
    const contextMessages = parentPath.map((n) => {
      const userMsg = currentData.messages.find((m) => m.id === n.userMessageId);
      const aiMsg = currentData.messages.find((m) => m.id === n.aiMessageId);
      return {
        userContent: userMsg?.content || '',
        userImages: userMsg?.images || [],
        aiContent: aiMsg?.content || '',
      };
    });

    // 获取用户消息
    const userMessage = currentData.messages.find((m) => m.id === node.userMessageId);
    if (!userMessage) return;

    // 清空当前 AI 回复内容
    setTopicData((prev) => {
      const newData = { ...prev };
      const topic = { ...newData[selectedTopic] };
      const messages = [...topic.messages];
      const aiMsgIndex = messages.findIndex((m) => m.id === aiMessageId);
      if (aiMsgIndex !== -1) {
        messages[aiMsgIndex] = { ...messages[aiMsgIndex], content: '' };
      }
      topic.messages = messages;
      newData[selectedTopic] = topic;
      return newData;
    });

    // 重新发送请求
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopic,
          message: userMessage.content,
          images: userMessage.images || [],
          parentNodeId: parentPath.length > 0 ? parentPath[parentPath.length - 1].id : null,
          contextMessages,
          thinkingLevel,
          webSearch,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedRefreshContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulatedRefreshContent += delta;
              setTopicData((prev) => {
                const newData = { ...prev };
                const topic = { ...newData[selectedTopic] };
                const messages = [...topic.messages];
                const aiMsgIndex = messages.findIndex((m) => m.id === aiMessageId);
                if (aiMsgIndex !== -1) {
                  messages[aiMsgIndex] = {
                    ...messages[aiMsgIndex],
                    content: messages[aiMsgIndex].content + delta,
                  };
                }
                topic.messages = messages;
                newData[selectedTopic] = topic;
                return newData;
              });
            }
          } catch (e) {}
        }
      }
      // 流式结束后更新持久化内容
      try {
        await fetch(`/api/conversations/${node.id}/ai-message`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: accumulatedRefreshContent }),
        });
      } catch (saveErr) {
        console.error('Update ai-message failed:', saveErr);
      }
    } catch (err) {
      console.error('Refresh message error:', err);
      alert('刷新失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 删除消息：删除节点���所有子孙节点
  const handleDeleteMessage = (e, aiMessageId) => {
    e.stopPropagation();

    // 找到对应的树节点
    const node = findNodeByMessageId(currentData.tree, aiMessageId, 'aiMessageId');
    if (!node) return;

    // 收集该节点及所有子孙节点的消息 ID
    const collectMessageIds = (node) => {
      const ids = [node.userMessageId, node.aiMessageId];
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          ids.push(...collectMessageIds(child));
        }
      }
      return ids;
    };

    const messageIdsToDelete = collectMessageIds(node);

    // 保存删除目标信息，显示确认弹窗
    setDeleteTarget({ node, messageIdsToDelete });
    setShowDeleteConfirm(true);
  };

  // 确认删除
  const confirmDeleteMessage = () => {
    if (!deleteTarget) return;

    const { node, messageIdsToDelete } = deleteTarget;

    // 找到被删除节点的父节点
    const findParentNode = (tree, targetId, parent = null) => {
      for (const n of tree) {
        if (n.id === targetId) return parent;
        if (n.children && n.children.length > 0) {
          const found = findParentNode(n.children, targetId, n);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };

    const parentNode = findParentNode(currentData.tree, node.id);

    setTopicData((prev) => {
      const newData = { ...prev };
      const topic = { ...newData[selectedTopic] };

      // 删除消息
      topic.messages = topic.messages.filter((m) => !messageIdsToDelete.includes(m.id));

      // 从树中删除节点
      const removeNode = (tree, targetId) => {
        return tree.filter((n) => {
          if (n.id === targetId) return false;
          if (n.children && n.children.length > 0) {
            n.children = removeNode(n.children, targetId);
          }
          return true;
        });
      };

      topic.tree = removeNode(topic.tree, node.id);
      newData[selectedTopic] = topic;
      return newData;
    });

    // 更新选中状态：如果有父节点则选中父节点，否则清空
    if (parentNode) {
      setSelectedNode(parentNode.id);
      setHighlightedMessageId(parentNode.aiMessageId);
    } else {
      setSelectedNode(null);
      setHighlightedMessageId(null);
    }

    setShowDeleteConfirm(false);
    setDeleteTarget(null);

    // 持久化删除
    fetch(`/api/conversations/${node.id}`, { method: 'DELETE' })
      .catch((err) => console.error('Delete conversation failed:', err));
  };

  // 点击消息气泡
  const handleMessageClick = (msg) => {
    let targetNode = null;

    if (msg.type === 'user') {
      // 用户消息：直接找对应的节点
      targetNode = findNodeByMessageId(currentData.tree, msg.id, 'userMessageId');
    } else if (msg.type === 'ai') {
      // AI消息：找对应的用户节点
      targetNode = findNodeByMessageId(currentData.tree, msg.id, 'aiMessageId');
    }

    if (targetNode) {
      setSelectedNode(targetNode.id);
      setHighlightedMessageId(targetNode.aiMessageId);
    }
  };

  // 清除对话记录
  const handleClearHistory = () => {
    setShowClearConfirm(true);
  };

  const confirmClearHistory = () => {
    fetch(`/api/topics/${encodeURIComponent(selectedTopic)}/data`, { method: 'DELETE' }).catch(() => {});
    setTopicData((prev) => {
      const newData = { ...prev };
      newData[selectedTopic] = {
        messages: [],
        tree: [],
        counter: 0,
        notes: newData[selectedTopic].notes, // 保留笔记
        logs: newData[selectedTopic].logs, // 保留学习日志
      };
      return newData;
    });
    setSelectedNode(null);
    setHighlightedMessageId(null);
    setShowClearConfirm(false);
  };

  // 更新学习日志
  const handleUpdateLogs = async () => {
    setIsUpdatingLog(true);

    try {
      const res = await fetch(`/api/topics/${encodeURIComponent(selectedTopic)}/logs/generate`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('日志生成失败');
      const { results } = await res.json();

      // 更新本地 logs state
      setTopicData((prev) => {
        const newData = { ...prev };
        const t = { ...newData[selectedTopic] };
        const newLogs = [...(t.logs || [])];

        results.forEach(({ day, summary }) => {
          const idx = newLogs.findIndex((l) => l.timeRange === day);
          if (idx >= 0) {
            newLogs[idx] = { ...newLogs[idx], summary };
          } else {
            newLogs.push({ timeRange: day, summary, timestamp: new Date().toISOString() });
          }
        });

        newLogs.sort((a, b) => b.timeRange.localeCompare(a.timeRange));
        t.logs = newLogs;
        newData[selectedTopic] = t;
        return newData;
      });

      // 重新加载话题数据以同步树状态
      await loadTopicData(selectedTopic);
    } catch (err) {
      alert('日志生成失败，请稍后重试');
      console.error(err);
    }

    setIsUpdatingLog(false);
  };

  return (
    <div className="flex h-[calc(100vh-88px)] bg-background">
      {/* 左侧面板 */}
      <div className="w-[65%] border-r border-border flex flex-col">
        {/* 主题选择 */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              {topics.map((topic) => (
                <button
                  key={topic}
                  onClick={() => handleTopicChange(topic)}
                  className={`
                    px-4 py-2 rounded-md font-sans text-sm font-medium
                    transition-all duration-200
                    ${selectedTopic === topic
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-border'
                    }
                  `}
                >
                  {topic}
                </button>
              ))}
            </div>
            <button
              onClick={handleClearHistory}
              className="px-4 py-2 rounded-md font-sans text-sm font-medium bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-all duration-200"
            >
              清除对话记录
            </button>
          </div>
        </div>

        {/* 对话记录 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {currentData.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground font-sans text-lg">
                开始对话...
              </p>
            </div>
          ) : (
            <>
              {currentData.messages.map((msg) => {
                // 格式化时间
                const formatTime = (date) => {
                  const d = new Date(date);
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  return `${year}-${month}-${day} ${hours}:${minutes}`;
                };

                return (
                  <div
                    key={msg.id}
                    ref={(el) => (messageRefs.current[msg.id] = el)}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-center'}`}
                  >
                    <div
                      onClick={() => handleMessageClick(msg)}
                      className={`
                        px-6 py-4 rounded-lg cursor-pointer group
                        transition-all duration-200
                        ${msg.type === 'user'
                          ? 'bg-accent text-accent-foreground max-w-[70%] hover:bg-accent-secondary cursor-pointer'
                          : `bg-card border text-foreground w-[95%] ${
                              highlightedMessageId === msg.id
                                ? 'border-accent border-2 shadow-md cursor-text'
                                : 'border-border hover:bg-muted cursor-pointer'
                            }`
                        }
                      `}
                    >
                      {msg.type === 'ai'
                        ? msg.content === ''
                          ? <p className="font-sans text-sm text-muted-foreground italic">等待回复中...</p>
                          : isLoading && msg.id === currentData.messages.at(-1)?.id
                            ? <p className="font-sans leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                            : <MessageErrorBoundary rawContent={msg.content} key={msg.id}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>
                              </MessageErrorBoundary>
                        : <p className="font-sans leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      }
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-3">
                          {msg.images.map((image, idx) => (
                            <img
                              key={idx}
                              src={image}
                              alt={`Image ${idx + 1}`}
                              className="w-20 h-20 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity border border-border"
                              onClick={() => setViewingImage(image)}
                            />
                          ))}
                        </div>
                      )}
                      {/* AI 回复显示时间 + 操作按钮 */}
                      {msg.type === 'ai' && (
                        <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatTime(msg.timestamp)}
                          </span>
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={(e) => handleRefreshMessage(e, msg.id)}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-150 hover:scale-110"
                              title="重新生成"
                            >
                              <img src={refreshIcon} alt="刷新" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteMessage(e, msg.id)}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-150 hover:scale-110"
                              title="删除对话"
                            >
                              <img src={deleteIcon} alt="删除" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleCopy(e, msg.content, msg.id)}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-150 hover:scale-110"
                              title={copiedMessageId === msg.id ? '已复制' : '复制'}
                            >
                              <img
                                src={copyIcon}
                                alt="复制"
                                className={`w-4 h-4 ${copiedMessageId === msg.id ? 'opacity-50' : ''}`}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 输入框 */}
        <div className="border-t border-border">
          {/* 图片预览区 */}
          <ImagePreview images={pastedImages} onRemove={handleRemoveImage} />

          {/* 输入区 */}
          <div className="p-6">
            <div className="flex gap-3 items-start">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                onPaste={handlePaste}
                placeholder="输入消息，按 Enter 发送，Shift+Enter 换行，Cmd+V 粘贴图片..."
                className="flex-1"
              />
              {/* 设置齿轮 */}
              <div ref={settingsRef} className="relative">
                {showSettings && (
                  <div className="absolute bottom-full right-0 mb-2 w-52 bg-card border border-border rounded-lg shadow-lg p-4 z-20">
                    <div className="mb-3">
                      <label className="block text-xs text-muted-foreground font-sans mb-1.5">Thinking Level</label>
                      <select
                        value={thinkingLevel}
                        onChange={(e) => setThinkingLevel(e.target.value)}
                        className="w-full text-sm font-sans bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-accent"
                      >
                        <option value="low">Low</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground font-sans mb-1.5">Web Search</label>
                      <select
                        value={webSearch ? 'on' : 'off'}
                        onChange={(e) => setWebSearch(e.target.value === 'on')}
                        className="w-full text-sm font-sans bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-accent"
                      >
                        <option value="off">关</option>
                        <option value="on">开</option>
                      </select>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md transition-colors duration-200 ${
                    showSettings ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
              <Button onClick={handleSend} disabled={isLoading}>
                {isLoading ? '等待中...' : '发送'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧面板 */}
      <div className="w-[35%] flex flex-col">
        {/* 日志区域 */}
        <div className="flex-1 p-6 border-b border-border min-h-0">
          {/* Tab 切换 */}
          <div className="flex items-center justify-between mb-4">
            <span className="font-serif text-lg text-foreground">{selectedTopic}</span>
            {/* Tab 切换 */}
            <div className="flex items-center gap-0 -mr-1">
              <button
                onClick={() => setLogViewMode('tree')}
                className={`font-sans text-sm font-medium transition-colors duration-200 px-3 ${
                  logViewMode === 'tree' ? 'text-accent' : 'text-foreground'
                }`}
              >
                对话树
              </button>
              <span className="text-border select-none">|</span>
              <button
                onClick={() => setLogViewMode('log')}
                className={`font-sans text-sm font-medium transition-colors duration-200 px-3 ${
                  logViewMode === 'log' ? 'text-accent' : 'text-foreground'
                }`}
              >
                日志
              </button>
            </div>
          </div>

          <div className="h-[calc(100%-3.5rem)]">
            {logViewMode === 'tree' ? (
              <Breadcrumb
                path={getNodePath(currentData.tree, selectedNode)}
                onNodeClick={handleNodeClick}
                messageCount={currentData.messages.filter(m => m.type === 'user').length}
              />
            ) : (
              <LearningLog
                logs={currentData.logs || []}
                activityDates={currentData.activityDates || []}
                unsummarizedCount={(() => {
                  let count = 0;
                  const count_ = (nodes) => { for (const n of nodes) { if (!n.summarized) count++; if (n.children?.length) count_(n.children); } };
                  count_(currentData.tree || []);
                  return count;
                })()}
                onUpdateLogs={handleUpdateLogs}
                isUpdating={isUpdatingLog}
                topicId={selectedTopic}
                onLogsChange={(newLogs) => {
                  setTopicData((prev) => {
                    const newData = { ...prev };
                    const topic = { ...newData[selectedTopic] };
                    topic.logs = newLogs;
                    newData[selectedTopic] = topic;
                    return newData;
                  });
                }}
              />
            )}
          </div>
        </div>

        {/* 笔记框 */}
        <div className="flex-1 p-6 border-t border-border min-h-0">
          <div className="section-label mb-4">
            <span className="rule-line flex-1" />
            <span className="section-label-text">笔记</span>
            <span className="rule-line flex-1" />
          </div>

          <div className="h-[calc(100%-3rem)]">
            <NotesEditor
              value={currentData.notes}
              onChange={(value) => {
                setTopicData((prev) => {
                  const newData = { ...prev };
                  const topic = { ...newData[selectedTopic] };
                  topic.notes = value;
                  newData[selectedTopic] = topic;
                  return newData;
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* 图片查看模态框 */}
      <ImageModal image={viewingImage} onClose={() => setViewingImage(null)} />

      {/* 清除对话确认对话框 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="清除对话记录"
        message={`确定要清除【${selectedTopic}】主题下的所有对话记录吗？此操作不可恢复。对话树和未总结的节点也将被清空。`}
        onConfirm={confirmClearHistory}
        onCancel={() => setShowClearConfirm(false)}
        confirmText="确认清除"
        confirmDanger={true}
      />

      {/* 删除对话确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除对话"
        message={`确定要删除对话"${deleteTarget?.node?.label}"及其所有子对话吗？此操作不可恢复。`}
        onConfirm={confirmDeleteMessage}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
        }}
        confirmText="确认删除"
        confirmDanger={true}
      />
    </div>
  );
};

export default Chat;
