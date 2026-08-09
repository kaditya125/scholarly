import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, BookOpen, Brain, MessageSquare, Compass,
  CheckCircle2, ChevronRight, Sparkles, Clock, ArrowRight,
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
  timeColor: string;
  icon: React.ElementType;
  iconBg: string;
  path: string;
}

const STEPS: ChecklistStep[] = [
  {
    id: 'profile',
    label: 'Set up your profile',
    description: 'Build your AI learning profile so the tutor is personalized to your goal',
    time: '2 MINUTES',
    timeColor: 'bg-emerald-500',
    icon: User,
    iconBg: 'bg-indigo-600',
    path: '/onboarding',
  },
  {
    id: 'notebook',
    label: 'Create your first notebook',
    description: 'Upload a PDF and turn it into a study workspace',
    time: '5 MINUTES',
    timeColor: 'bg-orange-500',
    icon: BookOpen,
    iconBg: 'bg-orange-500',
    path: '/notebooks',
  },
  {
    id: 'assessment',
    label: 'AI Baseline Assessment',
    description: 'Discover your current academic level. Scholarly will create your personalized study plan',
    time: '20-25 MINUTES',
    timeColor: 'bg-purple-600',
    icon: Brain,
    iconBg: 'bg-purple-600',
    path: '/baseline-assessment',
  },
  {
    id: 'chat',
    label: 'Chat with AI Tutor',
    description: 'Ask any question and get step-by-step explanations',
    time: '3 MINUTES',
    timeColor: 'bg-fuchsia-600',
    icon: MessageSquare,
    iconBg: 'bg-fuchsia-600',
    path: '/chat',
  },
  {
    id: 'explore',
    label: 'Explore study tools',
    description: 'Discover flashcards, mind maps, podcasts and more',
    time: '2 MINUTES',
    timeColor: 'bg-teal-500',
    icon: Compass,
    iconBg: 'bg-teal-500',
    path: '/explore',
  },
];

// ─── Completion signals ─────────────────────────────────────────────────────────
// Uses real data from existing hooks — no fake values.

function useChecklistCompletion() {
  const { profile, isLoading: profileLoading } = useProfile();
  const { stats, isLoading: statsLoading } = useUserStats();

  const completedSteps = useMemo<Record<string, boolean>>(() => {
    // Step 1 — Profile: the backend sets isComplete when the wizard is finished.
    const profileDone = !!profile?.isComplete;

    // Step 2 — Notebook: proxy via totalTestsAttempted or any activity; notebooks 
    // don't have a direct count hook yet, so we use a completionPercentage > 0 
    // signal from stats (the backend sets this when a notebook source is processed).
    const notebookDone = (stats?.completionPercentage ?? 0) > 0;

    // Step 3 — Assessment: the digital twin is generated after baseline assessment.
    // If the profile has any weakAreas populated it was derived from assessment data.
    // Alternatively the backend sets examReadiness once the CAT result is processed.
    const assessmentDone = (stats?.examReadiness ?? 0) > 0 || (profile?.weakAreas?.length ?? 0) > 0;

    // Step 4 — Chat: if the user has ever chatted, the study streak will be > 0
    // or there'll be at least one performanceHistory entry from AI interaction.
    const chatDone = (stats?.gamification?.studyStreakDays ?? 0) > 0 ||
                     (stats?.performanceHistory?.length ?? 0) > 0;

    // Step 5 — Explore: once user has visited Explore the backend awards XP;
    // we check if total XP > 0 as a proxy for any meaningful platform activity.
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

/**
 * OnboardingChecklist — the "Complete these steps to get the most out of Scholarly"
 * section shown at the top of the student dashboard for new / partially-onboarded users.
 *
 * Hides automatically once all 5 steps are completed.
 * Uses only data from existing hooks — no new API calls.
 */
export function OnboardingChecklist() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { completedSteps, completedCount, allDone, isLoading } = useChecklistCompletion();

  // Don't render anything while loading or if all steps are done
  if (isLoading || allDone) return null;

  const firstName = (user?.displayName || '').trim().split(' ')[0] || 'there';
  const profilePct = profileCompletion(profile);
  const headline = goalHeadline(profile);
  const isProfileIncomplete = !profile?.isComplete;

  return (
    <div className="space-y-4">
      {/* ── Profile Setup Banner ───────────────────────────────────── */}
      <div className="relative px-2 pt-0 pb-2">
        <div className="relative z-10">

          {/* AI Profile Banner */}
          {isProfileIncomplete && (
            <div className="mt-0 inline-flex items-center gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 shadow-sm transition-colors"
              onClick={() => navigate('/onboarding')}>
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 dark:text-white">Complete your AI profile</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Personalize your tutor &amp; unlock adaptive planning</div>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700"
                    style={{ width: `${profilePct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{profilePct}%</span>
              </div>
              <button className="ml-2 text-xs font-semibold text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 transition-colors flex items-center gap-1 shrink-0">
                Customize <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Step Cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Complete these steps to get the most out of Scholarly
          </span>
          <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 rounded-full">
            {completedCount}/{STEPS.length} done
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {STEPS.map((step, i) => {
            const done = completedSteps[step.id];
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
              >
                <Link
                  to={step.path}
                  className={cn(
                    'flex flex-col w-full h-full rounded-[20px] p-4 border transition-all duration-200 group cursor-pointer',
                    done
                      ? 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 opacity-60'
                      : 'bg-white dark:bg-[#1f1f1f] border-slate-200 dark:border-white/10 hover:border-indigo-400/50 dark:hover:border-indigo-500/40 hover:shadow-md'
                  )}
                >
                  {/* Time badge */}
                  <div className={cn(
                    'self-start text-[9px] font-bold text-white px-2 py-0.5 rounded-full mb-3',
                    done ? 'bg-emerald-500' : step.timeColor
                  )}>
                    {done ? 'DONE ✓' : step.time}
                  </div>

                  {/* Icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform duration-200',
                    done ? 'bg-emerald-100 dark:bg-emerald-500/20' : step.iconBg,
                    !done && 'group-hover:scale-105'
                  )}>
                    {done
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      : <Icon className="w-5 h-5 text-white" />}
                  </div>

                  {/* Text */}
                  <div className="font-bold text-[13px] text-slate-900 dark:text-white mb-1 leading-snug">
                    {step.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                    {step.description}
                  </div>

                  {/* CTA arrow */}
                  {!done && (
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
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

// ─── Helper ─────────────────────────────────────────────────────────────────────

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
