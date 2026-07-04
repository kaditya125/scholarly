import React, { useState } from 'react';
import { BarChart2, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface LivePollProps {
  question: string;
  options: PollOption[];
  totalVotes: number;
  creator: string;
  time: string;
  avatar: string;
}

export function LivePoll({ question, options, totalVotes, creator, time, avatar }: LivePollProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [localOptions, setLocalOptions] = useState(options);
  const [localTotal, setLocalTotal] = useState(totalVotes);

  const handleVote = (id: string) => {
    if (hasVoted) return;
    
    setSelectedOption(id);
    setHasVoted(true);
    setLocalTotal(prev => prev + 1);
    setLocalOptions(prev => 
      prev.map(opt => opt.id === id ? { ...opt, votes: opt.votes + 1 } : opt)
    );
  };

  return (
    <div className="flex gap-4 w-full max-w-[80%]">
      <img src={avatar} alt={creator} className="w-8 h-8 rounded-full shrink-0 mt-1 dark:border dark:border-white/10" />
      <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-900 dark:text-slate-100 font-bold">{creator}</span>
          <span className="text-xs text-slate-500 font-medium">{time}</span>
          <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
            <BarChart2 className="w-3 h-3" /> LIVE POLL
          </span>
        </div>
        
        <div className="bg-white dark:bg-[#212121] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-[14px] font-bold text-slate-900 dark:text-white leading-snug pr-4">
              {question}
            </h4>
            <button className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {localOptions.map((option) => {
              const percentage = localTotal > 0 ? Math.round((option.votes / localTotal) * 100) : 0;
              const isSelected = selectedOption === option.id;

              return (
                <div 
                  key={option.id}
                  onClick={() => handleVote(option.id)}
                  className={cn(
                    "relative overflow-hidden rounded-xl border p-3 flex items-center justify-between cursor-pointer transition-all",
                    hasVoted 
                      ? isSelected 
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-400" 
                        : "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10"
                      : "border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:bg-slate-50 dark:hover:bg-white/5"
                  )}
                >
                  {hasVoted && (
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cn(
                        "absolute left-0 top-0 bottom-0 opacity-20",
                        isSelected ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"
                      )}
                    />
                  )}
                  
                  <div className="relative z-10 flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                      isSelected 
                        ? "border-indigo-500 bg-indigo-500 text-white" 
                        : "border-slate-300 dark:border-slate-600"
                    )}>
                      {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className={cn(
                      "text-[13px] font-medium",
                      isSelected ? "text-indigo-900 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"
                    )}>
                      {option.text}
                    </span>
                  </div>
                  
                  {hasVoted && (
                    <span className={cn(
                      "relative z-10 text-[13px] font-bold",
                      isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"
                    )}>
                      {percentage}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 text-[12px] text-slate-500 dark:text-slate-400 font-medium">
            <span>{localTotal} votes</span>
            {hasVoted && <span className="text-indigo-600 dark:text-indigo-400">Vote recorded</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
