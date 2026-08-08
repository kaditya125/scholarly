/**
 * AI Workspace
 * 
 * Full conversational interface for AI-powered podcast planning.
 * Integrates with existing podcast generation pipeline without modifying core logic.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Settings, Loader2, Sparkles, Mic, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { ConversationTimeline, ChatInput } from '../components/ai-workspace';
import { useStartPlanning, usePlanningConversation } from '../hooks/api/usePlanning';
import { useGeneratePodcast } from '../hooks/api/usePodcasts';
import type { ConversationMessage } from '../types/workspace.types';

interface AIWorkspaceProps {
  projectType?: 'podcast' | 'video' | 'article';
  onClose?: () => void;
}

export default function AIWorkspace({ projectType = 'podcast', onClose }: AIWorkspaceProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');

  const [sessionId, setSessionId] = useState<string | null>(sessionIdParam);
  const [conversationStarted, setConversationStarted] = useState(!!sessionIdParam);

  // API Hooks
  const { startPlanning, isStarting } = useStartPlanning();
  const {
    messages,
    status,
    isLoading,
    respond,
    isResponding,
    refetch,
  } = usePlanningConversation(sessionId);
  const { generate, isGenerating } = useGeneratePodcast();

  // Load existing session on mount
  useEffect(() => {
    if (sessionIdParam && !sessionId) {
      setSessionId(sessionIdParam);
      setConversationStarted(true);
    }
  }, [sessionIdParam]);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/podcasts');
    }
  };

  const handleStartConversation = async (prompt: string) => {
    try {
      const result = await startPlanning({
        projectType,
        initialPrompt: prompt,
      });
      
      setSessionId(result.sessionId);
      setConversationStarted(true);
      
      // Update URL with session ID for shareable/resumable sessions
      if (!onClose) {
        navigate(`/ai-workspace?sessionId=${result.sessionId}`, { replace: true });
      }
    } catch (error) {
      console.error('Failed to start planning session:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!sessionId) return;
    
    try {
      await respond({
        sessionId,
        responseType: 'text_message',
        data: { message: content },
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleAction = async (action: string, data?: any) => {
    if (!sessionId) return;

    console.log('[AIWorkspace] Action:', action, data);

    try {
      switch (action) {
        case 'clarification_response':
          await respond({
            sessionId,
            responseType: 'clarification_response',
            data: { optionId: data.optionId, questionId: data.message.id },
          });
          break;

        case 'accept_recommendations':
          await respond({
            sessionId,
            responseType: 'accept_recommendations',
            data: {},
          });
          break;

        case 'approve_plan':
          // When plan is approved, trigger podcast generation
          await handleApprovePlan(data.message);
          break;

        case 'modify_plan':
          await respond({
            sessionId,
            responseType: 'modify_plan',
            data: {},
          });
          break;

        case 'regenerate_plan':
          await respond({
            sessionId,
            responseType: 'regenerate_plan',
            data: {},
          });
          break;

        default:
          console.warn('Unknown action:', action);
      }
    } catch (error) {
      console.error('Failed to handle action:', error);
    }
  };

  /**
   * CRITICAL: Integration with existing podcast generation
   * This is where we connect the planning flow to the existing PodcastEngineService
   * WITHOUT modifying the core generation logic
   */
  const handleApprovePlan = async (planMessage: any) => {
    if (!planMessage.plan) return;

    const plan = planMessage.plan;

    try {
      // Map the lesson plan to the existing podcast generation request format
      const podcastRequest = {
        type: 'custom' as const,
        source: {
          kind: 'prompt' as const,
          prompt: `${plan.title}\n\n${plan.subtitle || ''}\n\nLesson Plan:\n${plan.outline
            .map((section: any, idx: number) => `${idx + 1}. ${section.title}${section.description ? ': ' + section.description : ''}`)
            .join('\n')}`,
        },
        durationMinutes: plan.estimatedDuration || 10,
        speakerStyle: (plan.teachingStyle === 'storytelling' ? 'discussion' :
                       plan.teachingStyle === 'teacher_student' ? 'teacher_student' :
                       plan.teachingStyle === 'documentary' ? 'solo_narrator' :
                       'teacher_student') as any,
        voiceStyle: 'warm_teacher' as const,
        language: 'English',
      };

      console.log('[AIWorkspace] Generating podcast with request:', podcastRequest);

      // Call the existing podcast generation pipeline
      await generate(podcastRequest);

      // Close workspace and return to podcasts page
      handleBack();
    } catch (error) {
      console.error('Failed to generate podcast:', error);
      alert('Failed to start podcast generation. Please try again.');
    }
  };

  const isProcessing = isStarting || isResponding || isGenerating;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0b] flex flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f10]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-gray-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mic className="w-5 h-5 text-orange-500" />
                <span>AI Podcast Studio</span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Conversational lesson planning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span>Processing...</span>
              </div>
            )}
            <button
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5 text-slate-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {!conversationStarted ? (
            <WelcomeScreen
              key="welcome"
              projectType={projectType}
              onStart={handleStartConversation}
              isStarting={isStarting}
            />
          ) : (
            <div key="conversation" className="flex-1 flex flex-col">
              {/* Conversation Timeline */}
              <ConversationTimeline
                messages={messages}
                isLoading={isLoading || isProcessing}
                onAction={handleAction}
              />

              {/* Chat Input */}
              <div className="shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f10]">
                <div className="max-w-4xl mx-auto px-6 py-4">
                  <ChatInput
                    onSend={handleSendMessage}
                    disabled={isProcessing}
                    placeholder="Ask a question or provide additional details..."
                  />
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/**
 * Welcome Screen
 * 
 * Initial landing screen with example prompts and quick start
 */
interface WelcomeScreenProps {
  projectType: 'podcast' | 'video' | 'article';
  onStart: (prompt: string) => void;
  isStarting: boolean;
}

function WelcomeScreen({ projectType, onStart, isStarting }: WelcomeScreenProps) {
  const [prompt, setPrompt] = useState('');

  const projectConfig = {
    podcast: {
      icon: Mic,
      title: 'Create Your AI Podcast',
      subtitle: 'Tell me what you want to learn, and I\'ll design the perfect lesson',
      examples: [
        'Explain quantum physics for Class 12',
        'Teach me organic chemistry reactions for JEE',
        'Create a crash course on World War 2',
        'Help me understand calculus derivatives',
      ],
      tips: [
        'Mention your curriculum (CBSE, ICSE, JEE, NEET) for tailored content',
        'Specify your grade level for appropriate difficulty',
        'I\'ll ask clarifying questions to create the perfect lesson plan',
      ],
    },
    video: {
      icon: Play,
      title: 'Create Your AI Video',
      subtitle: 'Describe your video idea, and I\'ll help you plan it',
      examples: [
        'Animated explanation of photosynthesis',
        'Step-by-step tutorial on solving quadratic equations',
      ],
      tips: ['Video generation coming soon!'],
    },
    article: {
      icon: Sparkles,
      title: 'Create Your AI Article',
      subtitle: 'Share your topic, and I\'ll help you outline it',
      examples: [
        'Article about climate change for school magazine',
        'Essay on importance of renewable energy',
      ],
      tips: ['Article generation coming soon!'],
    },
  };

  const config = projectConfig[projectType];
  const Icon = config.icon;

  const handleSubmit = () => {
    if (prompt.trim() && !isStarting) {
      onStart(prompt.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex items-center justify-center p-6"
    >
      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 mb-6">
            <Icon className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            {config.title}
          </h2>
          <p className="text-lg text-slate-600 dark:text-gray-400">
            {config.subtitle}
          </p>
        </div>

        {/* Prompt Input */}
        <div className="mb-8">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What would you like to learn today?"
              rows={3}
              disabled={isStarting}
              className="w-full px-6 py-4 rounded-2xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none focus:border-orange-500 dark:focus:border-orange-500 transition-colors resize-none text-[15px] disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isStarting}
              className={cn(
                'absolute bottom-4 right-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all',
                prompt.trim() && !isStarting
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              )}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Start Planning</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-2 text-center">
            Press Enter to start, or Shift+Enter for new line
          </p>
        </div>

        {/* Example Prompts */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-3">
            Try one of these:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {config.examples.map((example, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(example)}
                disabled={isStarting}
                className="text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-orange-300 dark:hover:border-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <p className="text-sm text-slate-700 dark:text-gray-300">{example}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
            💡 Tips for best results:
          </h3>
          <ul className="space-y-2">
            {config.tips.map((tip, idx) => (
              <li key={idx} className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
