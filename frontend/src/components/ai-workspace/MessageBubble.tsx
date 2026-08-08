/**
 * Message Bubble
 * 
 * Reusable message bubble component for text messages.
 * Supports user and assistant roles with different styling.
 */

import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type { TextMessage } from '../../types/workspace.types';

interface MessageBubbleProps {
  message: TextMessage;
  delay?: number;
  className?: string;
}

export default function MessageBubble({ message, delay = 0, className }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages (center-aligned, subtle)
  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ delay }}
        className={cn('flex justify-center mb-4', className)}
      >
        <div className="max-w-md px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10">
          <p className="text-xs text-center text-slate-600 dark:text-gray-400">
            {message.content}
          </p>
        </div>
      </motion.div>
    );
  }

  // User or Assistant messages
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay }}
      className={cn(
        'flex mb-6',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div className="flex items-start gap-3 max-w-[85%]">
        {/* Avatar (AI only) */}
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
        )}

        {/* Message Content */}
        <div
          className={cn(
            'px-5 py-3 rounded-2xl',
            isUser
              ? 'bg-orange-500 text-white rounded-br-sm shadow-lg shadow-orange-500/20'
              : 'bg-white dark:bg-[#141415] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-bl-sm shadow-sm'
          )}
        >
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
          
          {/* Timestamp */}
          <div
            className={cn(
              'text-[11px] mt-1.5',
              isUser
                ? 'text-orange-100'
                : 'text-slate-400 dark:text-gray-500'
            )}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>

        {/* Avatar (User only) */}
        {isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shrink-0 shadow-lg">
            <span className="text-white text-sm font-bold">You</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

