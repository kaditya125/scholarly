import React from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useNotebooks } from '../../hooks/ai/useNotebook';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function UpgradeBanner() {
  const { user } = useAuth();
  const { notebooks } = useNotebooks();
  const navigate = useNavigate();
  
  // Calculate trial days (assuming 14-day trial from account creation)
  const creationTime = user?.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : Date.now();
  const daysPassed = Math.floor((Date.now() - creationTime) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, 14 - daysPassed);
  
  // Functional usage metric: notebooks out of 10 limit for basic plan
  const usageCount = notebooks?.length || 0;
  const usageLimit = 10;

  return (
    <div 
      onClick={() => navigate('/pricing')}
      className="w-full flex flex-col items-center cursor-pointer group hover:scale-[1.02] transition-transform duration-200"
    >
      {/* Top gradient area */}
      <div className="w-full bg-gradient-to-br from-indigo-100 via-pink-100 to-amber-100 dark:from-indigo-900/40 dark:via-pink-900/40 dark:to-amber-900/40 rounded-t-2xl p-3 pb-0 relative overflow-hidden">
        {/* Inner card rising up */}
        <div className="w-full bg-white dark:bg-[#1f1f1f] rounded-t-xl p-4 shadow-sm relative z-10 border-x border-t border-slate-100 dark:border-white/5 translate-y-2 group-hover:translate-y-1 transition-transform">
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-slate-800 dark:text-gray-200">Basic Plan</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-full text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              {usageCount}/{usageLimit}
            </div>
          </div>
          {/* Skeleton lines */}
          <div className="space-y-2">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full"></div>
            <div className="h-1.5 w-5/6 bg-slate-100 dark:bg-white/5 rounded-full"></div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full"></div>
          </div>
        </div>
      </div>
      
      {/* Bottom info area */}
      <div className="w-full bg-white dark:bg-[#1a1a1a] border border-slate-100 dark:border-white/5 rounded-b-2xl p-4 shadow-sm z-20">
        <h4 className="font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2 mb-2 text-sm">
          <span>🚀</span> Trial ends in {daysRemaining} days
        </h4>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 leading-relaxed">
          You are on a free trial of the <span className="font-semibold text-slate-700 dark:text-gray-300 border-b border-slate-300 dark:border-gray-600 pb-0.5">Basic</span> plan on <span className="font-semibold text-slate-700 dark:text-gray-300">monthly</span> billing.
        </p>
      </div>
    </div>
  );
}
