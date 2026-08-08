/**
 * Chat Input
 * 
 * Text input component for user messages in AI Workspace.
 * Supports multiline input, keyboard shortcuts, and loading states.
 */

import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  maxLength?: number;
}

export default function ChatInput({
  onSend,
  placeholder = 'Type your message...',
  disabled = false,
  isLoading = false,
  maxLength = 2000,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled && !isLoading) {
      onSend(trimmed);
      setMessage('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const canSend = message.trim().length > 0 && !disabled && !isLoading;
  const charCount = message.length;
  const isNearLimit = charCount > maxLength * 0.8;

  return (
    <div className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f10]">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="relative">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            maxLength={maxLength}
            rows={1}
            className={cn(
              'w-full px-4 py-3 pr-24 rounded-xl border resize-none outline-none transition-all',
              'bg-white dark:bg-[#141415] text-slate-900 dark:text-white',
              'placeholder:text-slate-400 dark:placeholder:text-gray-500',
              disabled || isLoading
                ? 'border-slate-200 dark:border-white/10 opacity-50 cursor-not-allowed'
                : 'border-slate-200 dark:border-white/10 focus:border-orange-500 dark:focus:border-orange-500'
            )}
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'absolute right-2 bottom-2 p-2.5 rounded-lg transition-all',
              canSend
                ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>

          {/* Character Count */}
          {isNearLimit && (
            <div className={cn(
              'absolute -top-6 right-0 text-xs',
              charCount >= maxLength ? 'text-rose-600 font-medium' : 'text-slate-400 dark:text-gray-500'
            )}>
              {charCount} / {maxLength}
            </div>
          )}
        </div>

        {/* Hint */}
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400 dark:text-gray-500">
          <span>
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">Enter</kbd> to send, 
            <kbd className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">Shift+Enter</kbd> for new line
          </span>
        </div>
      </div>
    </div>
  );
}

