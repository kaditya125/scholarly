import React, { useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { Brain, User } from 'lucide-react';

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
          if (ref.current) ref.current.innerHTML = `<pre class="text-red-500 text-xs">${err.message}</pre>`;
        });
    }
  }, [chart]);
  
  return <div ref={ref} className="mermaid-diagram my-4 overflow-x-auto flex justify-center bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10" />;
};

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
        <div key={msg.id || idx} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
            msg.role === 'user' ? "bg-slate-800 text-white dark:bg-gray-200 dark:text-slate-900" : "bg-indigo-600 text-white"
          )}>
            {msg.role === 'user' ? <User className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
          </div>
          
          <div className={cn(
            "max-w-[85%] rounded-2xl px-5 py-4",
            msg.role === 'user' 
              ? "bg-slate-800 text-white dark:bg-gray-200 dark:text-slate-900 rounded-tr-sm" 
              : "bg-white dark:bg-[#1a1a1b] text-slate-800 dark:text-gray-200 border border-slate-200 dark:border-white/10 shadow-sm rounded-tl-sm"
          )}>
            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:text-slate-50">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isMermaid = match && match[1] === 'mermaid';
                    if (!inline && isMermaid) {
                      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                    }
                    return !inline ? (
                      <pre className="bg-[#1e1e1e] p-4 rounded-xl overflow-x-auto my-4 text-sm font-mono border border-white/10 shadow-lg">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono text-[0.9em]" {...props}>
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
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                <p className="text-xs font-semibold text-slate-500 mb-2">Sources:</p>
                <div className="flex flex-wrap gap-2">
                  {msg.citations.map((cit, i) => (
                    <button 
                      key={i} 
                      onClick={() => onCitationClick && onCitationClick(cit)}
                      className="text-[11px] px-2 py-1 bg-slate-100 dark:bg-white/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors border border-slate-200 dark:border-white/10 flex items-center gap-1"
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
        <div className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-1">
            <Brain className="w-4 h-4" />
          </div>
          <div className="bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-2xl rounded-tl-sm px-5 py-4 flex gap-1">
             <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
             <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce delay-100" />
             <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce delay-200" />
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
