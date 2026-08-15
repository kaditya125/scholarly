import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  User, BookOpen, Brain, MessageSquare, Compass,
  CheckCircle2, ChevronRight, Sparkles, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useProfile } from '../../hooks/api/useProfile';
import { useUserStats } from '../../hooks/api/useUserStats';
import { profileCompletion, goalHeadline } from '../../lib/onboardingOptions';
import { cn } from '../../lib/utils';

// ─── Checklist step definitions ────────────────────────────────────────────────

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  time: string;
  icon: React.ElementType;
  path: string;
}

const STEPS: ChecklistStep[] = [
  {
    id: 'profile',
    label: 'Set up your profile',
    description: 'Build your AI learning profile so the tutor is personalized to your goal',
    time: '2 MIN',
    icon: User,
    path: '/onboarding',
  },
  {
    id: 'notebook',
    label: 'Create first notebook',
    description: 'Upload a PDF and turn it into an AI study workspace',
    time: '5 MIN',
    icon: BookOpen,
    path: '/notebooks',
  },
  {
    id: 'assessment',
    label: 'Baseline Assessment',
    description: 'Discover your current academic level for a calibrated study plan',
    time: '20 MIN',
    icon: Brain,
    path: '/baseline-assessment',
  },
  {
    id: 'chat',
    label: 'Chat with AI Tutor',
    description: 'Ask any question and get step-by-step concept explanations',
    time: '3 MIN',
    icon: MessageSquare,
    path: '/chat',
  },
  {
    id: 'explore',
    label: 'Explore study tools',
    description: 'Discover flashcards, mind maps, podcasts, and mock tests',
    time: '2 MIN',
    icon: Compass,
    path: '/explore',
  },
];

// ─── Completion signals ─────────────────────────────────────────────────────────

function useChecklistCompletion() {
  const { profile, isLoading: profileLoading } = useProfile();
  const { stats, isLoading: statsLoading } = useUserStats();

  const completedSteps = useMemo<Record<string, boolean>>(() => {
    const profileDone = !!profile?.isComplete;
    const notebookDone = (stats?.completionPercentage ?? 0) > 0;
    const assessmentDone = (stats?.examReadiness ?? 0) > 0 || (profile?.weakAreas?.length ?? 0) > 0;
    const chatDone = (stats?.gamification?.studyStreakDays ?? 0) > 0 ||
                     (stats?.performanceHistory?.length ?? 0) > 0;
    const exploreDone = (stats?.gamification?.xp ?? 0) > 100;

    return {
      profile: profileDone,
      notebook: notebookDone,
      assessment: assessmentDone,
      chat: chatDone,
      explore: exploreDone,
    };
  }, [profile, stats]);

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const allDone = completedCount === STEPS.length;

  return {
    completedSteps,
    completedCount,
    allDone,
    isLoading: profileLoading || statsLoading,
  };
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function OnboardingChecklist() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { completedSteps, completedCount, allDone, isLoading } = useChecklistCompletion();

  if (isLoading || allDone) return null;

  const profilePct = profileCompletion(profile);
  const isProfileIncomplete = !profile?.isComplete;

  return (
    <div className="space-y-3.5 font-sans">
      {/* ── Profile Setup Banner ───────────────────────────────────── */}
      {isProfileIncomplete && (
        <div className="pt-0">
          <div 
            onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-3 bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl px-3.5 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-white/20 shadow-2xs transition-all group"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white/10 flex items-center justify-center shrink-0 text-[#c8e558]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[12.5px] font-semibold text-slate-900 dark:text-white">Complete your AI profile</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Personalize your tutor &amp; unlock adaptive planning</div>
            </div>
            <div className="ml-3 flex items-center gap-2">
              <div className="w-16 h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#8ba32b] dark:bg-[#c8e558] rounded-full transition-all duration-700"
                  style={{ width: `${profilePct}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-400">{profilePct}%</span>
            </div>
            <span className="ml-1 text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] group-hover:underline transition-colors flex items-center gap-0.5 shrink-0">
              Customize <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      )}

      {/* ── Step Cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">
            Complete these steps to get the most out of Scholarly
          </span>
          <span className="text-[10.5px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200/60 dark:border-white/5">
            {completedCount}/{STEPS.length} done
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {STEPS.map((step, i) => {
            const done = completedSteps[step.id];
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <Link
                  to={step.path}
                  className={cn(
                    'flex flex-col w-full h-full rounded-2xl p-3.5 border transition-all duration-200 group cursor-pointer relative shadow-2xs',
                    done
                      ? 'bg-slate-50/60 dark:bg-white/[0.02] border-slate-200/60 dark:border-white/5 opacity-60'
                      : 'bg-white dark:bg-[#1a1a1e] border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-[#202025] hover:shadow-xs'
                  )}
                >
                  {/* Time / Status badge */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={cn(
                      'text-[9.5px] font-semibold px-2 py-0.5 rounded-full border',
                      done 
                        ? 'bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border-[#8ba32b]/30 dark:border-[#c8e558]/30' 
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-white/10'
                    )}>
                      {done ? 'DONE ✓' : step.time}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center mb-2.5 border transition-all duration-200',
                    done 
                      ? 'bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 border-[#8ba32b]/30 dark:border-[#c8e558]/30 text-[#8ba32b] dark:text-[#c8e558]' 
                      : 'bg-slate-50 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 group-hover:border-slate-300 dark:group-hover:border-[#c8e558]/40 group-hover:text-slate-900 dark:group-hover:text-[#c8e558]'
                  )}>
                    {done
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <Icon className="w-4 h-4" />}
                  </div>

                  {/* Text */}
                  <div className="font-semibold text-[12.5px] text-slate-900 dark:text-white mb-1 leading-snug">
                    {step.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                    {step.description}
                  </div>

                  {/* CTA link */}
                  {!done && (
                    <div className="mt-2.5 flex items-center gap-0.5 text-[10.5px] font-semibold text-slate-700 dark:text-[#c8e558] opacity-0 group-hover:opacity-100 transition-opacity">
                      Start <ChevronRight className="w-3 h-3" />
                    </div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
