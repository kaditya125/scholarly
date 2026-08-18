import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Sparkles, Target, Zap, ShieldCheck, TrendingUp, Calendar, ArrowRight, BookOpen, Layers, Award, CheckCircle2, Clock, Activity, BarChart2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';

export default function AssessmentReportDashboard() {
  const navigate = useNavigate();
  const { digitalTwin, isLoadingDigitalTwin } = useAdaptiveAssessment();

  if (isLoadingDigitalTwin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="text-center">
          <span className="w-10 h-10 rounded-full border-2 border-white/20 border-t-indigo-500 animate-spin inline-block mb-4" />
          <p className="text-slate-400 text-sm">Fetching your Student Digital Twin...</p>
        </div>
      </div>
    );
  }

  const twin = digitalTwin || {
    overallReadinessScore: 78,
    subjectMastery: { Physics: 75, Chemistry: 82, Mathematics: 72 },
    topicMastery: { Mechanics: 70, Thermodynamics: 85, Calculus: 68 },
    learnerPersona: {
      learningStyle: 'Visual-Analytical',
      problemSolvingStyle: 'Methodical',
      motivationType: 'Goal-Driven',
      attentionPattern: 'Sustained',
      revisionPattern: 'Spaced-Repetition',
      conceptualStrength: 'Moderate',
      preferredExplanationStyle: 'First-Principles',
      preferredDifficulty: 'Adaptive',
    },
    predictions: {
      expectedBoardScore: 92,
      expectedExamRank: 'Top 5%',
      targetProbabilityPercentage: 84,
      estimatedCompletionWeeks: 12,
      recommendedDailyHours: 3,
      riskOfMissingTarget: 'Low',
      potentialBoostIfHoursIncrease: 8,
    },
    confidenceProfile: {
      confidenceAccuracyGap: 4,
      overconfidenceScore: 12,
      underconfidenceScore: 8,
      guessAccuracy: 50,
      confidenceConsistency: 88,
    },
    firstWeekRoadmap: [
      {
        day: 1,
        title: 'Core Concept Mastery & Foundations',
        focusSubject: 'Physics',
        activities: [
          { type: 'notebook', title: 'Calculus & Mechanics Interactive Chapter', durationMins: 25, targetConcept: 'Derivatives & Motion' },
          { type: 'tutor', title: 'Step-by-Step AI Problem Solving', durationMins: 15, targetConcept: 'Kinematics' },
          { type: 'quiz', title: 'Targeted Concept Check', durationMins: 15, targetConcept: 'Newtonian Laws' },
        ],
      },
      {
        day: 2,
        title: 'Chemical Reactions & Thermodynamics',
        focusSubject: 'Chemistry',
        activities: [
          { type: 'notebook', title: 'Thermodynamics & Energy Laws', durationMins: 25, targetConcept: 'Enthalpy & Entropy' },
          { type: 'flashcard', title: 'High-Yield Formula Flashcards', durationMins: 15, targetConcept: 'Equations & Constants' },
        ],
      },
    ],
  };

  const score = twin.overallReadinessScore || 78;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Student Digital Twin v1
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">
              Your Personalized Diagnostic Profile
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Sadhya AI has processed your assessment signals to build your single source of truth context.
            </p>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 font-bold text-sm text-white shadow-[0_0_25px_rgba(99,102,241,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Launch AI Study Hub <ArrowRight className="w-4 h-4" />
          </button>
        </header>

        {/* Top Metric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Readiness Gauge */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl flex flex-col items-center justify-center text-center">
            <div className="relative flex items-center justify-center w-36 h-36 mb-4">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-slate-800" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round"
                  className="stroke-emerald-400" strokeDasharray={264}
                  initial={{ strokeDashoffset: 264 }}
                  animate={{ strokeDashoffset: 264 - (264 * score) / 100 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-white">{score}%</span>
                <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Readiness</span>
              </div>
            </div>
            <h3 className="text-base font-bold text-white">Overall Readiness Score</h3>
            <p className="text-xs text-slate-400 mt-1">Calculated across subject accuracy, confidence, & speed.</p>
          </div>

          {/* Predictions Card */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Future Performance Forecast</h3>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                <span className="text-slate-400">Expected Board / Exam Score</span>
                <span className="font-extrabold text-amber-300 text-sm">{twin.predictions.expectedBoardScore}%</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                <span className="text-slate-400">Target Achievement Probability</span>
                <span className="font-extrabold text-emerald-400 text-sm">{twin.predictions.targetProbabilityPercentage}%</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                <span className="text-slate-400">Risk of Missing Target</span>
                <span className="font-bold text-emerald-300 text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {twin.predictions.riskOfMissingTarget}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-400">Recommended Daily Study</span>
                <span className="font-bold text-indigo-300 text-xs">{twin.predictions.recommendedDailyHours} Hours / Day</span>
              </div>
            </div>
          </div>

          {/* Learner Persona */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">AI Learner Persona</h3>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] uppercase font-bold text-indigo-300">Learning Style</div>
                <div className="text-xs font-bold text-white mt-0.5">{twin.learnerPersona.learningStyle}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] uppercase font-bold text-purple-300">Problem Solving Style</div>
                <div className="text-xs font-bold text-white mt-0.5">{twin.learnerPersona.problemSolvingStyle}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[10px] uppercase font-bold text-amber-300">Explanation Style</div>
                <div className="text-xs font-bold text-white mt-0.5">{twin.learnerPersona.preferredExplanationStyle}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Subject Mastery Breakdown */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-400" /> Subject & Topic Mastery Map
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(twin.subjectMastery || { Physics: 75, Chemistry: 82, Mathematics: 72 }).map(([sub, score]) => (
              <div key={sub} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-sm font-bold text-white">
                  <span>{sub}</span>
                  <span className="text-indigo-300">{score}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* First-Week Personalized Roadmap */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Your First-Week Personalized Study Roadmap</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(twin.firstWeekRoadmap || []).map((plan) => (
              <div key={plan.day} className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold uppercase text-emerald-400 tracking-wider">Day {plan.day}</span>
                  <span className="text-xs font-semibold text-slate-300">{plan.focusSubject}</span>
                </div>
                <h4 className="text-sm font-bold text-white">{plan.title}</h4>
                <div className="space-y-2">
                  {plan.activities.map((act, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-300 p-2 rounded-xl bg-slate-800/60">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                        {act.title}
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">{act.durationMins}m</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
