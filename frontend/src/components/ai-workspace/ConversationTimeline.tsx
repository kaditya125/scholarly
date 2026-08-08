/**
 * Conversation Timeline
 * 
 * Scrollable timeline that renders conversation messages.
 * Handles all message types: text, thinking, clarification, recommendation, plan, etc.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ConversationMessage } from '../../types/workspace.types';
import MessageBubble from './MessageBubble';
import ThinkingIndicator, { LoadingDots } from './ThinkingIndicator';
import ClarificationCard from './ClarificationCard';
import RecommendationCard from './RecommendationCard';
import PlanningCard from './PlanningCard';

interface ConversationTimelineProps {
  messages: ConversationMessage[];
  isLoading?: boolean;
  onAction?: (action: string, data?: any) => void;
}

export default function ConversationTimeline({
  messages,
  isLoading = false,
  onAction,
}: ConversationTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  return (
    <div
      ref={timelineRef}
      className="flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-white via-slate-50/50 to-white dark:from-[#0a0a0b] dark:via-[#0f0f10]/50 dark:to-[#0a0a0b]"
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {messages.map((message, index) => (
            <MessageRenderer
              key={message.id}
              message={message}
              index={index}
              onAction={onAction}
            />
          ))}
        </AnimatePresence>

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 mb-6"
          >
            <LoadingDots size="md" className="text-orange-500" />
            <span className="text-sm text-slate-500 dark:text-gray-400">AI is thinking...</span>
          </motion.div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * Message Renderer
 * 
 * Routes messages to appropriate component based on type
 */
interface MessageRendererProps {
  message: ConversationMessage;
  index: number;
  onAction?: (action: string, data?: any) => void;
}

function MessageRenderer({ message, index, onAction }: MessageRendererProps) {
  // Stagger animation delay
  const delay = index * 0.05;

  // Route to appropriate component based on message type
  switch (message.type) {
    case 'text':
      return (
        <MessageBubble
          message={message}
          delay={delay}
        />
      );

    case 'thinking':
      return (
        <ThinkingIndicator
          message={message}
          variant="bubble"
          delay={delay}
        />
      );

    case 'clarification':
      return (
        <ClarificationCard
          message={message}
          delay={delay}
          onSelect={(optionId) => onAction?.('clarification_response', { message, optionId })}
        />
      );

    case 'recommendation':
      return (
        <RecommendationCard
          message={message}
          delay={delay}
          onAccept={() => onAction?.('accept_recommendations', { message })}
        />
      );

    case 'research':
      return (
        <ResearchCard
          message={message}
          delay={delay}
        />
      );

    case 'plan':
      return (
        <PlanningCard
          message={message}
          delay={delay}
          onApprove={() => onAction?.('approve_plan', { message })}
          onModify={() => onAction?.('modify_plan', { message })}
          onRegenerate={() => onAction?.('regenerate_plan', { message })}
        />
      );

    default:
      return null;
  }
}


/**
 * Text Message Bubble
 * 
 * Simple text message from user or AI
 */
interface TextMessageBubbleProps {
  message: ConversationMessage & { type: 'text' };
  delay: number;
}

function TextMessageBubble({ message, delay }: TextMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
    >
      <div
        className={`max-w-[80%] px-5 py-3 rounded-2xl ${
          isUser
            ? 'bg-orange-500 text-white rounded-br-sm'
            : 'bg-white dark:bg-[#141415] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-bl-sm'
        }`}
      >
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <div
          className={`text-[11px] mt-1.5 ${
            isUser ? 'text-orange-100' : 'text-slate-400 dark:text-gray-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Thinking Bubble
 * 
 * Animated indicator showing AI is processing
 */
interface ThinkingBubbleProps {
  message: ConversationMessage & { type: 'thinking' };
  delay: number;
}

function ThinkingBubble({ message, delay }: ThinkingBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay }}
      className="flex items-center gap-3 mb-6"
    >
      <div className="px-5 py-3 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
          </div>
          <span className="text-[14px] text-slate-600 dark:text-gray-400">
            {message.content}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Placeholder components for cards (will be implemented in next tasks)
 */

function ResearchCard({ message, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="mb-6"
    >
      <div className="bg-white dark:bg-[#141415] border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <p className="text-sm text-slate-500 dark:text-gray-400">
          ResearchCard: {message.id}
        </p>
      </div>
    </motion.div>
  );
}
