import React, { useState } from 'react';
import { 
  Link as LinkIcon, 
  ChevronDown, 
  ArrowUp,
  Bot,
  ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';
import { useGraph } from '../hooks/ai/useGraph';

export default function Research() {
  const [input, setInput] = useState('');
  const navigate = useNavigate();
  const { graph, isLoading } = useGraph();

  const handleSend = () => {
    if (!input.trim()) return;
    setInput('');
    // Optionally navigate to a results page or show loading state
    navigate('/chat');
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto px-4 pt-16 mt-10">
      
      <div className="flex flex-col items-start mb-8 ml-8">
        <Link 
          to="/chat" 
          className="flex items-center gap-2 text-slate-500 hover:text-slate-200 text-sm font-medium transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Chat
        </Link>
        <h1 className="text-[40px] font-bold text-[#e8e8e8] font-serif tracking-tight mb-2">Deep Research</h1>
        <p className="text-[#a1a1aa] text-[15px] flex items-center gap-1.5 flex-wrap">
          Ask a question <span className="text-[#52525b]">&middot;</span> AI researches dozens of sources <span className="text-[#52525b]">&middot;</span> Get a cited report
        </p>
      </div>

      <div className="w-full max-w-3xl ml-8">
        <div className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-2xl flex flex-col shadow-sm focus-within:shadow-md focus-within:border-[#3f3f46] transition-all overflow-hidden mb-8 relative">
          
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
              placeholder="What do you want to research?" 
              className="w-full bg-transparent text-[#e8e8e8] placeholder:text-[#71717a] p-4 min-h-[60px] max-h-[200px] outline-none resize-none text-[15px]"
              rows={1}
            />
            <div className="absolute top-4 right-4">
              <div className="w-6 h-6 rounded-md bg-[#4ade80] flex items-center justify-center text-[#1e1e1e] cursor-default shadow-sm">
                <Bot className="w-4 h-4" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 pt-0">
            <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-[#a1a1aa] hover:text-[#d4d4d8] text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#27272a] transition-colors">
                  <LinkIcon className="w-3.5 h-3.5" strokeWidth={2.5} /> Sources <ChevronDown className="w-3 h-3" strokeWidth={2.5}/>
                </button>
                <button className="flex items-center gap-1.5 text-[#a1a1aa] hover:text-[#d4d4d8] text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#27272a] transition-colors">
                  <Bot className="w-3.5 h-3.5" /> GPT 5.4 Mini <ChevronDown className="w-3 h-3" strokeWidth={2.5}/>
                </button>
            </div>

            <div className="flex items-center gap-2">
                <button 
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-full bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 flex items-center justify-center text-[#d4d4d8] transition-colors cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5}/>
                </button>
            </div>
          </div>
        </div>

        <div className="mb-4 text-[15px] font-semibold text-[#e8e8e8]">
          Try a question
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setInput("What were the economic causes of the French Revolution and how did they compare to the American Revolution?")}
            className="text-left bg-transparent border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1e1e1e]/50 text-[#d4d4d8] rounded-xl p-4 text-[14px] transition-colors"
          >
            What were the economic causes of the French Revolution and how did they compare to the American Revolution?
          </button>
          
          <button 
            onClick={() => setInput("Analyze the current evidence on whether microplastics cross the blood-brain barrier and what the health implications are")}
            className="text-left bg-transparent border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1e1e1e]/50 text-[#d4d4d8] rounded-xl p-4 text-[14px] transition-colors"
          >
            Analyze the current evidence on whether microplastics cross the blood-brain barrier and what the health implications are
          </button>
          
          <button 
            onClick={() => setInput("Compare CRISPR-Cas9, base editing, and prime editing — effectiveness, off-target rates, and clinical trial progress")}
            className="text-left bg-transparent border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1e1e1e]/50 text-[#d4d4d8] rounded-xl p-4 text-[14px] transition-colors"
          >
            Compare CRISPR-Cas9, base editing, and prime editing — effectiveness, off-target rates, and clinical trial progress
          </button>
        </div>

      </div>
    </div>
  );
}
