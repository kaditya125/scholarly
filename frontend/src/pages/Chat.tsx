/// <reference types="vite/client" />
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  Sparkles, 
  Paperclip, 
  Mic, 
  ArrowUp,
  Bot,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RefreshCw,
  MessageSquare,
  Plus,
  Loader2,
  Clock,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Settings,
  Wand2,
  X,
  Lightbulb,
  BookOpen,
  Globe,
  Calculator,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { OpenAI, Groq, Nvidia } from '@lobehub/icons';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
});

const Mermaid = ({ chart }: { chart: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (ref.current) {
      mermaid.render(`mermaid-${Math.random().toString(36).substring(7)}`, chart)
        .then(({ svg }) => {
          if (ref.current) ref.current.innerHTML = svg;
        })
        .catch(err => {
          console.error('Mermaid render error', err);
          if (ref.current) ref.current.innerHTML = `<p class="text-red-500 text-sm">Failed to render diagram</p>`;
        });
    }
  }, [chart]);
  
  return <div ref={ref} className="flex justify-center my-6 overflow-x-auto w-full" />;
};

const TYPE_CONFIG: Record<string, { title: string, subtitle: string, firstMsg: string }> = {
  'chat': { title: 'What are you studying?', subtitle: 'Paste data and ask for analysis, or just start chatting.', firstMsg: 'I can help you study from your notes, PDFs, videos, recordings, flashcards, and pages; explain concepts; quiz you; make study guides, summaries, flashcards, worksheets, slides, or diagrams; and help analyze images of assignments or screenshots.\n\nIf you want, send me a file or just tell me the topic and I\'ll jump in.' },
  'study-guide': { title: 'Create a Study Guide', subtitle: 'Paste your syllabus, notes, or topic to generate a comprehensive study guide.', firstMsg: 'I will help you create a structured, detailed study guide. Please provide the topic, notes, or syllabus you want to cover!' },
  'podcast': { title: 'Generate AI Podcast', subtitle: 'Turn any topic or document into an engaging audio discussion.', firstMsg: 'I can convert your study materials into an engaging podcast script with multiple speakers. What topic or document should we focus on?' },
  'slides': { title: 'Generate AI Slides', subtitle: 'Instantly create presentation slides from your notes.', firstMsg: 'I will generate structured presentation slides with bullet points and speaker notes. Just give me the topic or paste your notes!' },
  'worksheet': { title: 'Create a Worksheet', subtitle: 'Generate custom worksheets, fill-in-the-blanks, and exercises.', firstMsg: 'Let\'s create a custom worksheet. What grade level and subject is this for, and what specific topics should I include? I can generate multiple choice, fill in the blanks, or short answer questions.' },
  'infographic': { title: 'Design an Infographic', subtitle: 'Describe a concept and I\'ll structure it as an infographic layout.', firstMsg: 'I can help you structure information into an infographic framework. What concept or process would you like to visualize?' },
  'mindmap': { title: 'Generate Mind Map', subtitle: 'Break down complex topics into an organized mind map structure.', firstMsg: 'I will generate a structured mind map outline (e.g. in Markdown or Mermaid format) to help you visualize any topic. What should be the central node of our mind map?' },
  'image': { title: 'Generate AI Image', subtitle: 'Describe the educational illustration or diagram you need.', firstMsg: 'Describe the educational diagram, illustration, or visual aid you need, and I\'ll provide a detailed prompt or generate the layout for you.' },
  'page': { title: 'Draft a Page', subtitle: 'Write an essay, report, or document collaboratively.', firstMsg: 'I can help you draft a page, essay, or structured report. Let me know the topic, word count, and any specific outlines you want to follow.' },
  'meeting-notes': { title: 'Process Meeting Notes', subtitle: 'Paste your raw notes or transcript for a clean summary.', firstMsg: 'Paste your raw meeting notes, lecture transcript, or bullet points, and I will organize them into a clean summary with key takeaways and action items.' },
};

const GeminiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <defs>
      <linearGradient id="gemini-grad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#F95454" />
        <stop offset="50%" stopColor="#4285F4" />
        <stop offset="100%" stopColor="#34A853" />
      </linearGradient>
    </defs>
    <path d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z" fill="url(#gemini-grad)" />
  </svg>
);

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const typeParam = searchParams.get('type') || 'chat';
  const config = TYPE_CONFIG[typeParam] || TYPE_CONFIG['chat'];
  
  const { user } = useAuth();
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const stream = useWorkflowStream();
  
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selectedModel') || 'gemini');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isAttachmentDropdownOpen, setIsAttachmentDropdownOpen] = useState(false);
  const [attachmentAccept, setAttachmentAccept] = useState(".txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.css,.pdf,.docx,.jpg,.jpeg,.png");
  const [attachments, setAttachments] = useState<{name: string, data: string, mimeType: string}[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTalk = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const windowAny = window as any;
    const SpeechRecognition = windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support Speech Recognition. Try Google Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      if (finalTranscript) {
        setInput(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error("Speech recognition error:", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingFile(true);

    try {
      // Convert file to Base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            // Strip the data:mime/type;base64, prefix
            const b64 = reader.result.split(',')[1];
            resolve(b64);
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setAttachments(prev => [...prev, { name: file.name, mimeType: file.type || 'application/octet-stream', data: base64Data }]);
    } catch (error: any) {
      console.error("File processing error:", error);
      alert(`Error reading file: ${file.name}\nDetails: ${error.message || error}`);
    } finally {
      setIsUploadingFile(false);
    }

    e.target.value = ''; // Reset input
  };

  // Fetch all sessions on load
  const fetchSessions = async () => {
    if (!user?.uid) return;
    try {
      const res = await api.get(`/chat/sessions?userId=${user.uid}`);
      setSessions(res.data);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [user]);

  // If type changes from URL (from New menu), reset chat
  useEffect(() => {
    handleNewChat();
  }, [typeParam]);

  useEffect(() => {
    const handleNewChatEvent = (e: Event) => {
      handleNewChat();
    };
    window.addEventListener('new-chat', handleNewChatEvent);
    return () => window.removeEventListener('new-chat', handleNewChatEvent);
  }, []);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
  };

  // Handle incoming global prompt from Dashboard
  useEffect(() => {
    const initialPrompt = searchParams.get('prompt');
    const initialModel = searchParams.get('model');
    
    if (initialPrompt && user?.uid) {
      if (initialModel) {
        setSelectedModel(initialModel);
        localStorage.setItem('selectedModel', initialModel);
      }
      
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('prompt');
      newParams.delete('model');
      setSearchParams(newParams, { replace: true });
      
      setTimeout(() => {
        handleNewChat();
        setMessages([{ role: 'user', content: initialPrompt }]);
        sendAIRequest(initialPrompt, []);
      }, 100);
    }
  }, [user?.uid, searchParams, setSearchParams]);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSpeak = (content: string, index: number) => {
    if (!window.speechSynthesis) return;
    
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    
    const cleanContent = content.replace(/[#*_\[\]`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanContent);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/chat/sessions/${sessionId}`);
      setMessages(res.data);
      // Clean up URL query if we had a type
      if (searchParams.has('type')) {
        navigate('/chat', { replace: true });
      }
    } catch (error) {
      console.error("Failed to fetch session history", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !user?.uid) return;
    
    let userMessage = input.trim();
    const currentAttachments = [...attachments]; // Capture before clearing

    // Push just the text portion to the UI messages immediately so the user sees it
    setMessages(prev => [...prev, { role: 'user', content: userMessage || '[Sent Attachments]' }]);
    setInput('');
    setAttachments([]);
    
    await sendAIRequest(userMessage, currentAttachments);
  };

  const handleRegenerate = async (index: number) => {
    let lastUserMessage = '';
    for (let j = index - 1; j >= 0; j--) {
      if (messages[j].role === 'user') {
        lastUserMessage = messages[j].content;
        break;
      }
    }
    if (!lastUserMessage || !user?.uid) return;

    setMessages(prev => [...prev, { role: 'user', content: lastUserMessage }]);
    await sendAIRequest(lastUserMessage, []);
  };

  const sendAIRequest = async (userMessage: string, sentAttachments: any[] = []) => {
    // Generate new session ID if it's the first message
    let sessionId = currentSessionId;
    if (!sessionId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        sessionId = crypto.randomUUID();
      } else {
        sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      setCurrentSessionId(sessionId);
    }
    
    try {
      const selectedModel = localStorage.getItem('selectedModel') || 'gemini';

      // 1. Await the workflow stream
      const { content, data } = await stream.startStream({
        userId: user.uid,
        sessionId,
        message: userMessage,
        model: selectedModel,
        topicType: typeParam,
        attachments: sentAttachments
      });

      // 4. Finalize message
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages.push({ 
          role: 'ai', 
          content, 
          isTyping: false,
          citations: data?.citations,
          confidence: data?.confidence
        });
        return newMessages;
      });

      // Refresh the session list so the new chat shows up in the sidebar
      fetchSessions();
    } catch (error) {
      console.error("Chat API error:", error);
      setMessages(prev => [...prev, { role: 'system', content: 'An error occurred while communicating with the AI. Please try again.' }]);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!user?.uid) return;
    
    // Optimistically remove from UI
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    
    if (currentSessionId === sessionId) {
      handleNewChat();
    }

    try {
      await api.delete(`/chat/sessions/${sessionId}?userId=${user.uid}`);
    } catch (error) {
      console.error("Failed to delete session", error);
      // Re-fetch to restore if it failed
      fetchSessions();
    }
  };

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] w-full">
        <Bot className="w-16 h-16 text-indigo-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">You are not signed in</h2>
        <p className="text-slate-600 dark:text-gray-400 mb-6 text-center max-w-md">
          Please sign in to use the AI Chat. Your chat history and preferences are saved securely to your account.
        </p>
        <Link to="/signin" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  const modelOptions = [
    { id: 'gemini-2.5-flash', name: 'Gemini Flash', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', icon: <Groq className="w-4 h-4 text-[#f55036]" /> },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', icon: <Groq className="w-4 h-4 text-[#f55036]" /> },
    { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', icon: <Nvidia.Color className="w-4 h-4" /> },
    { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 340B', icon: <Nvidia.Color className="w-4 h-4" /> },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', icon: <OpenAI className="w-4 h-4 text-slate-800 dark:text-gray-200" /> },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', icon: <OpenAI className="w-4 h-4 text-slate-800 dark:text-gray-200" /> }
  ];
  const activeModel = modelOptions.find(m => m.id === selectedModel) || modelOptions[0];

  return (
    <div className="flex h-[calc(100vh-140px)] w-full max-w-6xl mx-auto relative gap-6">
      
      {/* Sidebar - Chat History */}
      {isSidebarOpen && (
        <div className="w-[280px] hidden lg:flex flex-col bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm shrink-0 transition-all duration-300">
          <div className="p-4 border-b border-slate-100 dark:border-white/5 flex gap-2">
            <button 
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Chat
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 dark:text-slate-400 transition-colors border border-slate-200 dark:border-white/10"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-3 space-y-1">
            {sessions.length === 0 ? (
              <div className="text-center p-4 text-slate-500 dark:text-gray-500 text-sm">
                No recent chats
              </div>
            ) : (
              sessions.map((session, i) => (
                <div 
                  key={session.sessionId}
                  onClick={() => handleSelectSession(session.sessionId)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 p-3 rounded-xl transition-all duration-200 group relative cursor-pointer",
                    currentSessionId === session.sessionId
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-300"
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 overflow-hidden">
                    <MessageSquare className={cn("w-4 h-4 mt-0.5 shrink-0", currentSessionId === session.sessionId ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-500 dark:text-gray-500")} />
                    <div className="flex-1 overflow-hidden">
                      <div className="text-[13px] font-semibold truncate leading-tight mb-1">
                        {session.topicType === 'chat' ? 'Study Assistant' : session.topicType}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteSession(e, session.sessionId)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-white dark:bg-transparent rounded-2xl transition-all duration-300">
        
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 rounded-xl bg-white dark:bg-[#1a1a1b] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 dark:text-slate-400 transition-colors border border-slate-200 dark:border-white/10 shadow-sm hidden lg:flex"
            title="Open sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        )}

        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center pb-32 px-4 relative w-full h-full overflow-y-auto custom-scrollbar">
            {/* Background dynamic orbs */}
            <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-pulse [animation-duration:4s]" />
            <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none translate-x-1/2 translate-y-1/2 animate-pulse [animation-duration:5s]" />

            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center text-center z-10 w-full max-w-3xl mt-8"
            >
              <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl mb-4 shadow-sm shadow-blue-500/5 backdrop-blur-sm">
                <Sparkles className="w-6 h-6 text-indigo-500 animate-pulse [animation-duration:3s]" />
              </div>
              
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-gray-100 font-serif tracking-tight mb-2 leading-tight">{config.title}</h1>
              <p className="text-slate-600 dark:text-gray-400 text-[14px] max-w-lg leading-relaxed mb-6">{config.subtitle}</p>

              {/* Suggested Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {[
                  { icon: BookOpen, title: "Create a Study Plan", prompt: "Create a 7-day study plan for mastering organic chemistry basics." },
                  { icon: Globe, title: "Explain a Concept", prompt: "Explain the theory of relativity like I am 10 years old." },
                  { icon: Calculator, title: "Solve a Problem", prompt: "Help me solve a complex calculus integration problem step-by-step." },
                  { icon: Lightbulb, title: "Quiz Me", prompt: "Give me a 5-question multiple choice quiz on World War II." }
                ].map((item, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 + 0.2, duration: 0.4 }}
                    onClick={() => {
                      setInput(item.prompt);
                      setTimeout(() => {
                        handleSend();
                      }, 50);
                    }}
                    className="flex flex-col text-left p-4 rounded-2xl bg-white dark:bg-[#1a1a1b]/60 border border-slate-200 dark:border-white/5 hover:border-indigo-500/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-all duration-300 group shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="p-1.5 rounded-lg bg-indigo-100/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                        <item.icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-900 dark:text-gray-200 text-[13px]">{item.title}</span>
                    </div>
                    <p className="text-slate-500 dark:text-gray-400 text-[12px] leading-relaxed group-hover:text-slate-600 dark:group-hover:text-gray-300 transition-colors line-clamp-2">
                      {item.prompt}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-32 px-4 md:px-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex justify-center">
            <div className="flex flex-col gap-6 py-6 border-none w-full max-w-3xl">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  {msg.role === 'user' ? (
                    <div className="bg-[#1e1e1e] dark:bg-[#1a1a1b] text-slate-100 dark:text-gray-200 px-5 py-2.5 rounded-3xl rounded-tr-sm text-[15px] max-w-[80%] whitespace-pre-wrap tracking-wide shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="flex gap-4 max-w-[85%]">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex flex-col text-slate-800 dark:text-gray-100">
                        {/* 
                          Added support for "isTyping" state.
                          If it's typing and there's no content yet, show a pulsing thinking indicator.
                          Otherwise, show the content.
                        */}
                        {msg.isTyping && !msg.content ? (
                          <div className="flex items-center gap-1.5 mt-1 mb-3">
                            <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce"></span>
                          </div>
                        ) : (
                          <div className="text-[15px] leading-relaxed mb-3 tracking-wide prose prose-slate dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-[#1e1e1e] prose-pre:p-0 prose-img:rounded-2xl prose-img:shadow-md prose-img:max-w-[350px] prose-img:object-cover prose-img:mt-4 prose-img:mb-4">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm, remarkMath]} 
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code(props) {
                                  const {children, className, node, ...rest} = props
                                  const match = /language-(\w+)/.exec(className || '')
                                  if (match && match[1] === 'mermaid') {
                                    return <Mermaid chart={String(children).replace(/\n$/, '')} />
                                  }
                                  return <code {...rest} className={className}>{children}</code>
                                }
                              }}
                            >
                              {msg.content.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/(?<!\\)\[ /g, '$$$$ ').replace(/ \](?!\\)/g, ' $$$$')}
                            </ReactMarkdown>
                            {msg.isTyping && <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle"></span>}
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-slate-400 dark:text-gray-500">
                          <button 
                            onClick={() => handleCopy(msg.content, i)}
                            className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                            title="Copy message"
                          >
                            {copiedIndex === i ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleSpeak(msg.content, i)}
                            className={cn(
                              "hover:text-slate-600 dark:hover:text-gray-300 transition-colors",
                              speakingIndex === i && "text-indigo-500"
                            )}
                            title={speakingIndex === i ? "Stop speaking" : "Read aloud"}
                          >
                            {speakingIndex === i ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleRegenerate(i)}
                            disabled={msg.isTyping}
                            className="hover:text-slate-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                            title="Regenerate response"
                          >
                            <RefreshCw className={cn("w-4 h-4", msg.isTyping && "animate-spin")} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* LIVE STREAMING BLOCK */}
              {stream.isStreaming && (
                <div className="flex w-full justify-start">
                  <div className="flex gap-4 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex flex-col text-slate-800 dark:text-gray-100 w-full">
                      {stream.progressEvents.length > 0 && !stream.content && (
                        <div className="mb-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-sm text-slate-600 dark:text-gray-300">
                          {stream.progressEvents.map((evt, idx) => (
                            <div key={idx} className="flex items-center gap-2 mb-1 last:mb-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                              <span className="font-semibold uppercase text-[10px] tracking-wider text-slate-400">{evt.stage}</span>
                              <span>{evt.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {!stream.content && stream.progressEvents.length === 0 ? (
                        <div className="flex items-center gap-1.5 mt-1 mb-3">
                          <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 bg-slate-500 dark:bg-gray-400 rounded-full animate-bounce"></span>
                        </div>
                      ) : (
                        <div className="text-[15px] leading-relaxed mb-3 tracking-wide prose prose-slate dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-pre:bg-[#1e1e1e] prose-pre:p-0 prose-img:rounded-2xl prose-img:shadow-md prose-img:max-w-[350px] prose-img:object-cover prose-img:mt-4 prose-img:mb-4">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkMath]} 
                            rehypePlugins={[rehypeKatex]}
                          >
                            {stream.content.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/(?<!\\)\[ /g, '$$$$ ').replace(/ \](?!\\)/g, ' $$$$')}
                          </ReactMarkdown>
                          <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse align-middle"></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={endOfMessagesRef} className="h-40 shrink-0 w-full" />
            </div>
          </div>
        )}

        {/* Input Box - absolute positioned at bottom */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4 md:px-8">
          <div className="w-full max-w-3xl bg-[#f4f4f5] dark:bg-[#1e1e20] border border-transparent dark:border-white/5 rounded-2xl flex flex-col shadow-sm focus-within:shadow-md focus-within:ring-1 focus-within:ring-slate-300 dark:focus-within:ring-white/10 transition-all">
              
              {(attachments.length > 0 || isUploadingFile) && (
                <div className="flex flex-wrap gap-2 p-3 pb-0">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-slate-300 dark:border-white/10 shadow-sm animate-in fade-in zoom-in duration-200">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="max-w-[150px] truncate">{att.name}</span>
                      <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500 ml-1 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {isUploadingFile && (
                    <div className="flex items-center gap-2 bg-slate-200/50 dark:bg-white/5 text-slate-500 dark:text-gray-400 px-3 py-1.5 rounded-lg text-[13px] font-medium animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Reading file...</span>
                    </div>
                  )}
                </div>
              )}

              <div className="relative w-full">
                <textarea 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything..." 
                  className="w-full bg-transparent text-slate-800 dark:text-gray-200 placeholder:text-slate-500 dark:placeholder:text-gray-500 p-4 min-h-[60px] max-h-[200px] outline-none resize-none text-[15px]"
                  rows={1}
                  disabled={loadingHistory}
                />
              </div>

              <div className="flex items-center justify-between p-3 pt-0">
                <div className="flex items-center gap-1">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept={attachmentAccept}
                      onChange={handleFileUpload} 
                    />
                    
                    <div className="relative">
                      <button 
                        onClick={() => setIsAttachmentDropdownOpen(!isAttachmentDropdownOpen)}
                        className="text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
                        title="Attach file"
                      >
                        <Paperclip className="w-4 h-4" strokeWidth={2} />
                      </button>

                      {isAttachmentDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsAttachmentDropdownOpen(false)}></div>
                          <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-[#1a1a1b] rounded-xl shadow-lg border border-slate-200 dark:border-white/10 overflow-hidden z-50">
                            <button 
                              onClick={() => { setAttachmentAccept(".pdf"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200 transition-colors"
                            >
                              Upload PDF
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".docx"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200 transition-colors"
                            >
                              Upload Document (.docx)
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".jpg,.jpeg,.png"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200 transition-colors"
                            >
                              Upload Image (OCR)
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.css"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200 transition-colors"
                            >
                              Upload Text / Code
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <button 
                      onClick={handleTalk}
                      className={cn(
                        "flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors",
                        isListening 
                          ? "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 animate-pulse" 
                          : "text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                      )}
                    >
                      <Mic className="w-4 h-4" strokeWidth={2} /> {isListening ? "Listening..." : "Talk"}
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <Link 
                      to="/research"
                      className="hidden sm:flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
                    >
                      Deep Research
                    </Link>
                    <div className="relative">
                      <button 
                        onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
                      >
                        {activeModel.icon} 
                        {activeModel.name} 
                        <ChevronDown className="w-3 h-3" strokeWidth={2.5}/>
                      </button>

                      {isModelDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)}></div>
                          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-[#1a1a1b] rounded-xl shadow-lg border border-slate-200 dark:border-white/10 overflow-hidden z-50">
                            {modelOptions.map((model) => (
                              <button 
                                key={model.id}
                                onClick={() => { setSelectedModel(model.id); setIsModelDropdownOpen(false); }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors text-left",
                                  selectedModel === model.id 
                                    ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" 
                                    : "text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                )}
                              >
                                {model.icon} {model.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim() || loadingHistory}
                      className="w-8 h-8 rounded-full bg-[#1e1e1e] dark:bg-white/10 hover:bg-[#333] dark:hover:bg-white/20 disabled:opacity-50 flex items-center justify-center text-white dark:text-gray-300 transition-colors cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2.5}/>
                    </button>
                </div>
              </div>

          </div>
        </div>
      </div>
    </div>
  );
}
