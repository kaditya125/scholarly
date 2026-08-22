import React, { useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Brain, User } from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  citations?: any[];
  warnings?: string[];
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onCitationClick?: (citation: any) => void;
}

export function ChatMessageList({ messages, isStreaming, onCitationClick }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="space-y-6">
      {messages.map((msg, idx) => (
        <div key={msg.id || idx} className={cn("flex flex-col sm:flex-row gap-2 sm:gap-3.5", msg.role === 'user' ? "items-end sm:flex-row-reverse" : "items-start sm:flex-row")}>
          <div className={cn(
            "hidden sm:flex w-8 h-8 rounded-xl items-center justify-center shrink-0 mt-1 shadow-2xs",
            msg.role === 'user' 
              ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900" 
              : "bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900"
          )}>
            {msg.role === 'user' ? <User className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
          </div>
          
          <div className={cn(
            "w-full sm:max-w-[85%] rounded-2xl px-4 sm:px-5 py-3.5 shadow-xs min-w-0 break-words",
            msg.role === 'user' 
              ? "bg-slate-900 text-white dark:bg-[#18181b] dark:text-slate-100 rounded-tr-xs border border-transparent dark:border-white/10 self-end sm:self-auto max-w-[88%]" 
              : "bg-white dark:bg-[#141416] text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-white/10 rounded-tl-xs"
          )}>
            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-50">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <pre className="bg-[#141416] p-4 rounded-xl overflow-x-auto my-4 text-sm font-mono border border-white/10 shadow-sm">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-[#8ba32b] dark:text-[#c8e558] font-mono text-[0.9em]" {...props}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
            
            {/* Render Citations & Warnings */}
            {msg.warnings && msg.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">Hallucination Warning</p>
                <ul className="list-disc list-inside text-xs text-red-500">
                  {msg.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-white/10">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Sources:</p>
                <div className="flex flex-wrap gap-1.5">
                  {msg.citations.map((cit, i) => (
                    <button 
                      key={i} 
                      onClick={() => onCitationClick && onCitationClick(cit)}
                      className="text-[11px] px-2.5 py-1 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors border border-slate-200/80 dark:border-white/10 flex items-center gap-1 shadow-2xs"
                    >
                      {cit.source} {cit.pageNumber ? `(p. ${cit.pageNumber})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      {isStreaming && (
        <div className="flex gap-3.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
            <Brain className="w-4 h-4" />
          </div>
          <div className="bg-white dark:bg-[#141416] border border-slate-200/80 dark:border-white/10 rounded-2xl rounded-tl-xs px-4 py-3 flex gap-1 items-center shadow-xs">
             <span className="w-2 h-2 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] animate-bounce" />
             <span className="w-2 h-2 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] animate-bounce delay-100" />
             <span className="w-2 h-2 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] animate-bounce delay-200" />
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
