/**
 * Thinking Indicator
 * 
 * Animated indicator showing AI is processing/thinking.
 * Multiple variants: bubble, inline, minimal.
 */

import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type { ThinkingMessage } from '../../types/workspace.types';

interface ThinkingIndicatorProps {
  message?: ThinkingMessage;
  variant?: 'bubble' | 'inline' | 'minimal';
  delay?: number;
  className?: string;
}

export default function ThinkingIndicator({
  message,
  variant = 'bubble',
  delay = 0,
  className,
}: ThinkingIndicatorProps) {
  const content = message?.content || 'Thinking...';

  // Minimal variant - just animated dots
  if (variant === 'minimal') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn('flex gap-1.5', className)}
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0 }}
          className="w-2 h-2 rounded-full bg-orange-500"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
          className="w-2 h-2 rounded-full bg-orange-500"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
          className="w-2 h-2 rounded-full bg-orange-500"
        />
      </motion.div>
    );
  }

  // Inline variant - dots with text, no bubble
  if (variant === 'inline') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn('flex items-center gap-3', className)}
      >
        <div className="flex gap-1.5">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1, delay: 0 }}
            className="w-2 h-2 rounded-full bg-orange-500"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
            className="w-2 h-2 rounded-full bg-orange-500"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
            className="w-2 h-2 rounded-full bg-orange-500"
          />
        </div>
        <span className="text-sm text-slate-500 dark:text-gray-400">
          {content}
        </span>
      </motion.div>
    );
  }

  // Bubble variant - full message bubble with AI avatar
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay }}
      className={cn('flex items-start gap-3 mb-6', className)}
    >
      {/* AI Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
        <span className="text-white text-sm font-bold">AI</span>
      </div>

      {/* Thinking Bubble */}
      <div className="px-5 py-3 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Animated Dots */}
          <div className="flex gap-1.5">
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
              className="w-2 h-2 rounded-full bg-slate-400 dark:bg-gray-500"
            />
          </div>

          {/* Text */}
          <span className="text-[14px] text-slate-600 dark:text-gray-400">
            {content}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Loading Dots Component
 * 
 * Standalone animated dots for use in buttons, cards, etc.
 */
export function LoadingDots({ size = 'sm', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const gap = size === 'sm' ? 'gap-1' : size === 'md' ? 'gap-1.5' : 'gap-2';

  return (
    <div className={cn('flex', gap, className)}>
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
        className={cn(dotSize, 'rounded-full bg-current')}
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
        className={cn(dotSize, 'rounded-full bg-current')}
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
        className={cn(dotSize, 'rounded-full bg-current')}
      />
    </div>
  );
}

