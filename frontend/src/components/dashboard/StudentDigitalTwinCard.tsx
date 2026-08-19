import React from 'react';
import { Brain, Sparkles, TrendingUp, Target, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAdaptiveAssessment } from '../../hooks/api/useAdaptiveAssessment';

export function StudentDigitalTwinCard() {
  const navigate = useNavigate();
  const { digitalTwin } = useAdaptiveAssessment();

  if (!digitalTwin || !digitalTwin.version) return null;

  // Readiness is shown only when it has actually been established. `|| 78` previously did two
  // wrong things at once: it invented a score for a student who had none, and (because 0 is
  // falsy) it would also have displayed a genuine 0% readiness as 78%.
  const score = digitalTwin.overallReadinessScore;
  const hasScore = typeof score === 'number';
  const persona = digitalTwin.learnerPersona?.learningStyle ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="group relative z-10 mb-6 overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-slate-950/90 p-5 md:p-6 backdrop-blur-xl shadow-xl"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-amber-500/10 border border-indigo-500/30 text-indigo-400 shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <Brain className="w-6 h-6 text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                <Sparkles className="w-3 h-3 text-amber-400" /> Digital Twin v{digitalTwin.version}
              </span>
              {persona && <span className="text-xs text-slate-400">· {persona}</span>}
            </div>
            <h3 className="text-base md:text-lg font-bold text-white mt-1">
              {hasScore
                ? `Active Cognitive Model · ${score}% Exam Readiness`
                : 'Active Cognitive Model · readiness not yet measured'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Powering AI Tutor, Notebooks, Flashcards & Revision with universal student memory.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/baseline-assessment/report')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-xs font-bold text-indigo-300 hover:bg-indigo-500/25 hover:text-white transition-all shrink-0"
        >
          View Full Intelligence Report <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
