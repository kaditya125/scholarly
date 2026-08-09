# 🎙️ AI Podcast Studio - Implementation Plan

**Version:** 1.0  
**Branch:** `feature/podcast-ai-studio`  
**Status:** Ready for Implementation  
**Breaking Changes:** ❌ None  
**Backend Changes:** Minimal (Streaming only)  

---

## Executive Summary

Transform the current modal-based podcast creation into a modern conversational AI Studio interface (similar to Proma/NotebookLM) while preserving 100% of the existing backend generation pipeline.

### Core Principles

1. **Zero Regression** - Existing podcast generation must work exactly as today
2. **Additive Changes** - Extend, never replace core business logic
3. **Feature Flagged** - New UI behind `USE_PODCAST_AI_STUDIO` flag
4. **Parallel Systems** - Old modal + new chat coexist during migration
5. **Incremental Rollout** - Test → Internal → Beta → Production

---

## Phase 0: Safety Analysis ✅ COMPLETE

### Untouchable Components (Backend)

```typescript
✅ MUST NOT MODIFY:
   ├─ PodcastEngineService.runJob()           // Core orchestration
   ├─ PodcastEngineService.runStitchJob()     // Audio stitching
   ├─ SourceResolver.resolve()                // Source parsing
   ├─ PodcastPlanner.buildPlan()              // Gemini planning
   ├─ ConversationGenerator.generate()        // Script generation
   ├─ AudioComposer.composeChunks()           // TTS synthesis
   ├─ AudioComposer.stitchChunks()            // FFmpeg concat
   ├─ BackgroundWorker                        // BullMQ processor
   ├─ MediaWorker                             // Stitch processor
   ├─ PodcastRepository                       // Firestore CRUD
   ├─ Firestore Collections (podcasts, podcast_jobs)
   └─ BullMQ Queues (podcast.generate, podcast.stitch)
```

### Safe Extension Points (Backend)

```typescript
✅ SAFE TO EXTEND:
   ├─ PodcastEngineService.setStage()         // Add event emission
   ├─ AudioComposer.composeChunks()           // Use existing onProgress callback
   ├─ podcastController                       // Add GET /stream endpoint
   └─ EventBus                                // Add progress event types
```

### Components to Replace (Frontend)

```typescript
❌ WILL BE REPLACED (Feature Flagged):
   ├─ PodcastStudio.tsx                       // Modal form
   ├─ Podcasts.tsx entry flow                 // "New podcast" button
   └─ usePodcasts() polling                   // Replace with SSE

✅ WILL BE PRESERVED:
   ├─ PodcastEpisode.tsx                      // Player component
   ├─ podcastsApi                             // HTTP client
   ├─ PodcastLanding.tsx                      // Empty state
   └─ TanStack Query cache                    // State management
```

---

## Phase 1: Backend Streaming Layer (2-3 days)

### Goal: Enable real-time progress streaming WITHOUT changing generation logic



### Step 1.1: Create Event Emitter (NEW FILE)

```typescript
// backend-firestore/src/core/events/PodcastProgressEmitter.ts

import { EventEmitter } from 'events';

interface ProgressEvent {
  type: 'stage' | 'tts_progress' | 'plan_complete' | 'script_complete' | 
        'complete' | 'failed' | 'cancelled';
  podcastId: string;
  timestamp: number;
  
  // Stage events
  stage?: string;
  status?: string;
  progressPct?: number;
  message?: string;
  
  // TTS progress
  done?: number;
  total?: number;
  
  // Plan/Script
  plan?: any;
  scriptLineCount?: number;
  totalWords?: number;
  
  // Completion
  audioPath?: string;
  transcriptPath?: string;
  durationMs?: number;
  
  // Failure
  error?: string;
}

class PodcastProgressEmitter extends EventEmitter {
  private static instance: PodcastProgressEmitter;
  
  private constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent generations
  }
  
  static getInstance(): PodcastProgressEmitter {
    if (!PodcastProgressEmitter.instance) {
      PodcastProgressEmitter.instance = new PodcastProgressEmitter();
    }
    return PodcastProgressEmitter.instance;
  }
  
  emitProgress(event: ProgressEvent) {
    this.emit('progress', event);
    this.emit(`progress:${event.podcastId}`, event);
  }
}

export const progressEmitter = PodcastProgressEmitter.getInstance();
export type { ProgressEvent };
```

### Step 1.2: Add SSE Controller Endpoint (MODIFY EXISTING)

```typescript
// backend-firestore/src/controllers/podcast.controller.ts

// ADD THIS METHOD:
async streamProgress(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user!.uid;
  
  // Verify ownership
  const podcast = await podcastRepository.getPodcast(id);
  if (!podcast || podcast.userId !== userId) {
    return res.status(404).json({ error: 'Podcast not found' });
  }
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
  
  // Send initial state
  const initEvent = {
    type: 'init',
    podcast,
    timestamp: Date.now(),
  };
  res.write(`data: ${JSON.stringify(initEvent)}\n\n`);
  
  // Create listener for this podcast
  const listener = (event: ProgressEvent) => {
    if (event.podcastId === id) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };
  
  progressEmitter.on('progress', listener);
  
  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);
  
  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    progressEmitter.off('progress', listener);
  });
}

// ADD ROUTE:
router.get('/podcasts/:id/stream', authMiddleware, podcastController.streamProgress);
```

### Step 1.3: Emit Events from Generation Pipeline (MODIFY EXISTING)

```typescript
// backend-firestore/src/services/podcast/podcastEngine.service.ts

import { progressEmitter } from '../../core/events/PodcastProgressEmitter';

// MODIFY setStage method (line ~370):
private async setStage(jobId: string, podcastId: string, stage: PodcastJobStage, message: string): Promise<void> {
  const pct = STAGE_PROGRESS[stage];
  
  // Existing Firestore updates (KEEP AS-IS)
  await podcastRepository.updateJob(jobId, { stage, progressPct: pct, stageMessage: message });
  await podcastRepository.updatePodcast(podcastId, { status: STAGE_STATUS[stage], progressPct: pct });
  
  // NEW: Emit SSE event
  progressEmitter.emitProgress({
    type: 'stage',
    podcastId,
    stage,
    status: STAGE_STATUS[stage],
    progressPct: pct,
    message,
    timestamp: Date.now(),
  });
}

// MODIFY plan completion (after line ~227):
await podcastRepository.updatePodcast(podcastId, {
  title: plan.title,
  description: plan.description,
  // ... existing fields
});

// NEW: Emit plan complete event
progressEmitter.emitProgress({
  type: 'plan_complete',
  podcastId,
  plan,
  progressPct: STAGE_PROGRESS.PLANNING,
  timestamp: Date.now(),
});

// MODIFY script completion (after line ~254):
await podcastRepository.updateJob(jobId, { 'checkpoint.scriptComplete': true } as any);

// NEW: Emit script complete event
progressEmitter.emitProgress({
  type: 'script_complete',
  podcastId,
  scriptLineCount: script.lines.length,
  totalWords: script.totalWords,
  progressPct: STAGE_PROGRESS.SCRIPTING,
  timestamp: Date.now(),
});

// MODIFY TTS progress callback (line ~267):
audioComposer.composeChunks({
  onProgress: (done, total) => {
    const span = STAGE_PROGRESS.STITCHING - STAGE_PROGRESS.SYNTHESIZING;
    const pct = STAGE_PROGRESS.SYNTHESIZING + Math.round((done / total) * span);
    
    // Existing Firestore updates (KEEP AS-IS)
    podcastRepository.updateJob(jobId, { progressPct: pct, stageMessage: `Generating voices ${done}/${total}` }).catch(() => {});
    podcastRepository.updatePodcast(podcastId, { progressPct: pct }).catch(() => {});
    
    // NEW: Emit TTS progress event
    progressEmitter.emitProgress({
      type: 'tts_progress',
      podcastId,
      done,
      total,
      progressPct: pct,
      message: `Generating voices ${done}/${total}`,
      timestamp: Date.now(),
    });
  },
});

// MODIFY completion (after line ~363 in runStitchJob):
eventBus.publish('podcast.completed', { podcastId, userId, durationMs: composed.durationMs });

// NEW: Emit completion event
progressEmitter.emitProgress({
  type: 'complete',
  podcastId,
  status: 'READY',
  progressPct: 100,
  audioPath,
  transcriptPath,
  durationMs: composed.durationMs,
  timestamp: Date.now(),
});

// MODIFY failure (after line ~139 in runJob):
await podcastRepository.updatePodcast(podcastId, { status: 'FAILED', description: String(err?.message || err) });

// NEW: Emit failure event
progressEmitter.emitProgress({
  type: 'failed',
  podcastId,
  status: 'FAILED',
  error: String(err?.message || err),
  timestamp: Date.now(),
});
```

### Step 1.4: Testing Checklist

```bash
# Test SSE endpoint
curl -N -H "Authorization: Bearer <token>" \
  http://localhost:5001/podcasts/pod_test123/stream

# Expected output:
# data: {"type":"init","podcast":{...},"timestamp":...}
# data: {"type":"stage","stage":"PLANNING","progressPct":12,...}
# data: {"type":"plan_complete","plan":{...},...}
# ... more events ...
```

**Verification:**
- [ ] SSE endpoint returns `text/event-stream` content type
- [ ] Initial state sent immediately
- [ ] Stage events emitted at correct times
- [ ] TTS progress updates stream in real-time
- [ ] Completion event sent
- [ ] Connection closes cleanly
- [ ] Multiple simultaneous streams work
- [ ] Existing generation continues to work WITHOUT streaming

---

## Phase 2: Frontend Chat UI Foundation (3-4 days)

### Goal: Create conversational interface with message timeline



### Step 2.1: Feature Flag Configuration

```typescript
// frontend/src/config/features.ts (NEW FILE)

export const FEATURES = {
  USE_PODCAST_AI_STUDIO: process.env.REACT_APP_PODCAST_AI_STUDIO === 'true',
} as const;

// .env.local (for development)
REACT_APP_PODCAST_AI_STUDIO=true
```

### Step 2.2: Chat Message Types

```typescript
// frontend/src/types/podcast-chat.ts (NEW FILE)

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageContentType = 
  | 'text'
  | 'thinking'
  | 'plan_preview'
  | 'script_preview'
  | 'progress'
  | 'audio_player'
  | 'error'
  | 'completed';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  contentType: MessageContentType;
  content: string | PlanPreview | ScriptPreview | ProgressData | CompletedPodcast;
  timestamp: number;
  streaming?: boolean;
}

export interface PlanPreview {
  title: string;
  description: string;
  speakers: string[];
  segments: { title: string; objective: string }[];
  estimatedMinutes: number;
  learningObjectives: string[];
}

export interface ScriptPreview {
  lineCount: number;
  totalWords: number;
  preview: { speaker: string; text: string }[];
}

export interface ProgressData {
  stage: string;
  message: string;
  progressPct: number;
  done?: number;
  total?: number;
}

export interface CompletedPodcast {
  podcastId: string;
  title: string;
  durationMs: number;
  audioPath: string;
  transcriptPath: string;
}
```

### Step 2.3: Main Chat Container

```typescript
// frontend/src/pages/PodcastAIStudio.tsx (NEW FILE)

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types/podcast-chat';
import ChatTimeline from '../components/podcast-chat/ChatTimeline';
import ChatInput from '../components/podcast-chat/ChatInput';
import { usePodcastStream } from '../hooks/api/usePodcastStream';
import { useGeneratePodcast } from '../hooks/api/usePodcasts';

interface PodcastAIStudioProps {
  onClose: () => void;
  podcastId?: string; // Resume existing generation
}

export default function PodcastAIStudio({ onClose, podcastId: existingPodcastId }: PodcastAIStudioProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [podcastId, setPodcastId] = useState<string | null>(existingPodcastId || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const { generate } = useGeneratePodcast();
  const { progress, error: streamError } = usePodcastStream(podcastId);
  
  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          contentType: 'text',
          content: 'Hello! What would you like to learn today? I can create a podcast on any topic from your notebooks or a subject you specify.',
          timestamp: Date.now(),
        },
      ]);
    }
  }, []);
  
  // Handle SSE progress events
  useEffect(() => {
    if (!progress) return;
    
    const newMessage: ChatMessage = {
      id: `progress-${progress.timestamp}`,
      role: 'assistant',
      contentType: progress.type === 'stage' ? 'thinking' : 
                   progress.type === 'plan_complete' ? 'plan_preview' :
                   progress.type === 'script_complete' ? 'script_preview' :
                   progress.type === 'tts_progress' ? 'progress' :
                   progress.type === 'complete' ? 'completed' :
                   progress.type === 'failed' ? 'error' : 'text',
      content: progress.type === 'stage' ? progress.message! :
               progress.type === 'plan_complete' ? progress.plan! :
               progress.type === 'script_complete' ? { lineCount: progress.scriptLineCount, totalWords: progress.totalWords } :
               progress.type === 'tts_progress' ? { stage: 'Generating voices', message: progress.message!, progressPct: progress.progressPct!, done: progress.done, total: progress.total } :
               progress.type === 'complete' ? { podcastId, title: '', durationMs: progress.durationMs!, audioPath: progress.audioPath!, transcriptPath: progress.transcriptPath! } :
               progress.type === 'failed' ? progress.error! : '',
      timestamp: progress.timestamp,
    };
    
    setMessages(prev => {
      // Replace existing progress messages of same type, or append
      const filtered = prev.filter(m => 
        !(m.contentType === newMessage.contentType && 
          m.timestamp < newMessage.timestamp)
      );
      return [...filtered, newMessage];
    });
    
    // Auto-scroll to bottom
    setTimeout(() => {
      timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [progress]);
  
  const handleSendMessage = async (text: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      contentType: 'text',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Add thinking message
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      role: 'assistant',
      contentType: 'thinking',
      content: 'Understanding your request...',
      timestamp: Date.now(),
      streaming: true,
    };
    setMessages(prev => [...prev, thinkingMessage]);
    
    // Start generation
    setIsGenerating(true);
    try {
      const result = await generate({
        type: 'custom',
        source: { kind: 'prompt', prompt: text },
        durationMinutes: 10,
        speakerStyle: 'teacher_student',
      });
      setPodcastId(result.podcastId);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        contentType: 'error',
        content: err.message || 'Failed to start generation',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#131314] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              AI Podcast Studio
            </h1>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Conversational podcast creation
            </p>
          </div>
        </div>
      </div>
      
      {/* Timeline */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto">
        <ChatTimeline messages={messages} />
      </div>
      
      {/* Input */}
      <div className="border-t border-slate-200 dark:border-gray-800">
        <ChatInput 
          onSend={handleSendMessage} 
          disabled={isGenerating}
          placeholder="What would you like to learn about?"
        />
      </div>
    </div>
  );
}
```

### Step 2.4: Chat Timeline Component

```typescript
// frontend/src/components/podcast-chat/ChatTimeline.tsx (NEW FILE)

import { AnimatePresence, motion } from 'motion/react';
import { ChatMessage } from '../../types/podcast-chat';
import ChatBubble from './ChatBubble';
import ThinkingBubble from './ThinkingBubble';
import PlanPreviewCard from './PlanPreviewCard';
import ScriptPreviewCard from './ScriptPreviewCard';
import ProgressCard from './ProgressCard';
import CompletedPodcastCard from './CompletedPodcastCard';
import ErrorCard from './ErrorCard';

interface ChatTimelineProps {
  messages: ChatMessage[];
}

export default function ChatTimeline({ messages }: ChatTimelineProps) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <AnimatePresence mode="popLayout">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            {message.contentType === 'text' && (
              <ChatBubble message={message} />
            )}
            {message.contentType === 'thinking' && (
              <ThinkingBubble message={message} />
            )}
            {message.contentType === 'plan_preview' && (
              <PlanPreviewCard plan={message.content as any} />
            )}
            {message.contentType === 'script_preview' && (
              <ScriptPreviewCard script={message.content as any} />
            )}
            {message.contentType === 'progress' && (
              <ProgressCard progress={message.content as any} />
            )}
            {message.contentType === 'completed' && (
              <CompletedPodcastCard podcast={message.content as any} />
            )}
            {message.contentType === 'error' && (
              <ErrorCard error={message.content as string} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

### Step 2.5: Chat Input Component

```typescript
// frontend/src/components/podcast-chat/ChatInput.tsx (NEW FILE)

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const suggestions = [
    'Create a crash course on Quantum Physics',
    'Explain Machine Learning fundamentals',
    'Summarize Chapter 5 of my Biology notes',
  ];
  
  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);
  
  return (
    <div className="p-6">
      {/* Suggestion chips (show when empty) */}
      {text.length === 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => setText(suggestion)}
              disabled={disabled}
              className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-gray-300 whitespace-nowrap transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 inline mr-1.5" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
      
      {/* Input area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Type your message...'}
          disabled={disabled}
          rows={1}
          className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ maxHeight: '200px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className="absolute right-2 bottom-2 p-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```



### Step 2.6: SSE Hook

```typescript
// frontend/src/hooks/api/usePodcastStream.ts (NEW FILE)

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { api } from '../../lib/api/client';

interface ProgressEvent {
  type: string;
  podcastId: string;
  timestamp: number;
  [key: string]: any;
}

export function usePodcastStream(podcastId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { user } = useAuth();
  
  useEffect(() => {
    if (!podcastId || !user) {
      return;
    }
    
    let isMounted = true;
    
    const connect = async () => {
      try {
        const token = await user.getIdToken();
        const url = `${api.defaults.baseURL}/podcasts/${podcastId}/stream`;
        
        // EventSource doesn't support custom headers, so append token as query param
        const eventSource = new EventSource(`${url}?token=${token}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
            setError(null);
          }
        };
        
        eventSource.onmessage = (event) => {
          if (!isMounted) return;
          
          try {
            const data = JSON.parse(event.data);
            setProgress(data);
          } catch (err) {
            console.error('[usePodcastStream] Failed to parse event:', err);
          }
        };
        
        eventSource.onerror = (err) => {
          if (!isMounted) return;
          
          setIsConnected(false);
          setError(new Error('Stream connection failed'));
          eventSource.close();
          
          // Auto-reconnect after 2 seconds
          setTimeout(() => {
            if (isMounted) {
              connect();
            }
          }, 2000);
        };
      } catch (err: any) {
        if (isMounted) {
          setError(err);
        }
      }
    };
    
    connect();
    
    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [podcastId, user]);
  
  return { progress, error, isConnected };
}
```

**Note:** EventSource doesn't support custom headers, so we need to modify the backend endpoint to accept token as query parameter.

### Step 2.7: Modify Backend SSE for Token Query Param

```typescript
// backend-firestore/src/controllers/podcast.controller.ts

async streamProgress(req: Request, res: Response) {
  const { id } = req.params;
  
  // Extract token from query param or Authorization header
  const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Verify token
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Verify ownership
    const podcast = await podcastRepository.getPodcast(id);
    if (!podcast || podcast.userId !== userId) {
      return res.status(404).json({ error: 'Podcast not found' });
    }
    
    // ... rest of SSE implementation ...
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

## Phase 3: Message Bubble Components (2-3 days)

### Step 3.1: ChatBubble Component

```typescript
// frontend/src/components/podcast-chat/ChatBubble.tsx (NEW FILE)

import { motion } from 'motion/react';
import { User, Sparkles } from 'lucide-react';
import { ChatMessage } from '../../types/podcast-chat';
import ReactMarkdown from 'react-markdown';

interface ChatBubbleProps {
  message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser 
          ? 'bg-slate-700 dark:bg-slate-300' 
          : 'bg-gradient-to-br from-orange-500 to-rose-500'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white dark:text-slate-900" />
        ) : (
          <Sparkles className="w-4 h-4 text-white" />
        )}
      </div>
      
      {/* Message bubble */}
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className={`max-w-2xl px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
        }`}
      >
        {typeof message.content === 'string' ? (
          <ReactMarkdown className="text-sm prose prose-sm dark:prose-invert max-w-none">
            {message.content}
          </ReactMarkdown>
        ) : (
          <div className="text-sm">{JSON.stringify(message.content)}</div>
        )}
      </motion.div>
    </div>
  );
}
```

### Step 3.2: ThinkingBubble Component

```typescript
// frontend/src/components/podcast-chat/ThinkingBubble.tsx (NEW FILE)

import { motion } from 'motion/react';
import { Loader2, Sparkles } from 'lucide-react';

interface ThinkingBubbleProps {
  message: { content: string; streaming?: boolean };
}

export default function ThinkingBubble({ message }: ThinkingBubbleProps) {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      
      {/* Thinking card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
      >
        <Loader2 className="w-4 h-4 text-orange-600 dark:text-orange-400 animate-spin" />
        <span className="text-sm font-medium text-orange-900 dark:text-orange-300">
          {message.content}
        </span>
      </motion.div>
    </div>
  );
}
```

### Step 3.3: PlanPreviewCard Component

```typescript
// frontend/src/components/podcast-chat/PlanPreviewCard.tsx (NEW FILE)

import { motion } from 'motion/react';
import { Check, Edit, RefreshCw, Clock, Users, BookOpen } from 'lucide-react';
import { PlanPreview } from '../../types/podcast-chat';

interface PlanPreviewCardProps {
  plan: PlanPreview;
  onApprove?: () => void;
  onModify?: () => void;
  onRegenerate?: () => void;
}

export default function PlanPreviewCard({ plan, onApprove, onModify, onRegenerate }: PlanPreviewCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-slate-900 overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-gray-800">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {plan.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-gray-400">
              {plan.description}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {plan.estimatedMinutes} min
          </div>
        </div>
        
        {/* Metadata */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-400">
            <Users className="w-3.5 h-3.5" />
            <span>{plan.speakers.join(', ')}</span>
          </div>
        </div>
      </div>
      
      {/* Segments */}
      <div className="p-6">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
          Episode Outline
        </h4>
        <div className="space-y-3">
          {plan.segments.map((segment, idx) => (
            <div
              key={idx}
              className="flex gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-xs font-bold flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                  {segment.title}
                </h5>
                <p className="text-xs text-slate-600 dark:text-gray-400 line-clamp-2">
                  {segment.objective}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        {/* Learning Objectives */}
        {plan.learningObjectives.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Learning Objectives
            </h4>
            <ul className="space-y-2">
              {plan.learningObjectives.map((objective, idx) => (
                <li key={idx} className="flex gap-2 text-xs text-slate-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
        >
          <Check className="w-4 h-4" />
          Looks Good, Continue →
        </button>
        <button
          onClick={onModify}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-300 text-sm font-medium transition-colors"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={onRegenerate}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-300 text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
```

