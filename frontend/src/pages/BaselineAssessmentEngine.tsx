import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Sparkles, Clock, CheckCircle2, ArrowRight, ShieldAlert, Award, HelpCircle, Layers, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';
import { PreAssessmentScreen } from '../components/assessment/PreAssessmentScreen';

export default function BaselineAssessmentEngine() {
  const navigate = useNavigate();
  const {
    questions,
    currentQuestion,
    currentQIndex,
    totalQuestions,
    selectedAnswer,
    isAssessmentFinished,
    isStarting,
    isSubmitting,
    isFetchingBatch,
    startAssessment,
    handleSelectOption,
    handleAnswerQuestion,
    trackHover,
  } = useAdaptiveAssessment();

  const [showPreModal, setShowPreModal] = useState(true);
  const [showConfidencePrompt, setShowConfidencePrompt] = useState(false);

  useEffect(() => {
    if (isAssessmentFinished) {
      navigate('/welcome');
    }
  }, [isAssessmentFinished, navigate]);

  useEffect(() => {
    if (questions && questions.length > 0) {
      setShowPreModal(false);
    }
  }, [questions]);

  const handleStart = async () => {
    setShowPreModal(false);
    await startAssessment();
  };

  const handleOptionClick = (opt: string | number) => {
    handleSelectOption(opt);
    setShowConfidencePrompt(true);
  };

  const handleConfidenceSelect = async (rating: 'Very Confident' | 'Confident' | 'Not Sure' | 'Pure Guess') => {
    setShowConfidencePrompt(false);
    await handleAnswerQuestion(rating);
  };

  if (showPreModal && (!questions || questions.length === 0)) {
    return <PreAssessmentScreen isOpen={showPreModal} onStart={handleStart} isLoading={isStarting} />;
  }

  if (isSubmitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 mb-6">
          <Brain className="w-10 h-10 text-indigo-400 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Synthesizing Your Student Digital Twin</h2>
        <p className="text-sm text-slate-400 max-w-md text-center">
          Analyzing accuracy, time allocation, confidence calibration, and knowledge graph dependencies...
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" /> Creating personalized first-week study roadmap
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 mx-auto">
            <Brain className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <h3 className="text-base font-bold text-white">Initializing Adaptive Questions</h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            Scholarly is building your baseline adaptive question batch.
          </p>
          <button
            onClick={() => startAssessment()}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-xs font-bold text-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          >
            Load Questions Instantly
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(((currentQIndex + 1) / Math.max(totalQuestions, 20)) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/80 backdrop-blur-xl px-4 py-3 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Brain className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              AI Baseline Assessment
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 uppercase">
                Adaptive CAT
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Question {currentQIndex + 1} of {Math.max(totalQuestions, 20)} · {currentQuestion.subject}
            </p>
          </div>
        </div>

        {/* Difficulty Badge */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-slate-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Difficulty: <span className="text-amber-300 font-bold">{currentQuestion.difficulty}</span>
          </span>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-slate-900 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Main Runner Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col justify-between">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Question Meta Badge */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold">
              {currentQuestion.topic}
            </span>
            <span>·</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
              {currentQuestion.knowledgeGraphTag}
            </span>
          </div>

          {/* Question Text */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8 backdrop-blur-xl shadow-xl">
            <h2 className="text-lg md:text-xl font-bold text-white leading-relaxed">
              {currentQuestion.question}
            </h2>

            {/* Options List */}
            {currentQuestion.options && currentQuestion.options.length > 0 ? (
              <div className="mt-6 space-y-3">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = selectedAnswer === opt;
                  return (
                    <button
                      key={idx}
                      onMouseEnter={trackHover}
                      onClick={() => handleOptionClick(opt)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 text-sm md:text-base font-medium ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-[0_0_20px_rgba(99,102,241,0.25)]'
                          : 'border-white/10 bg-white/5 text-slate-200 hover:border-indigo-500/50 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        {opt}
                      </span>
                      {isSelected && <Check className="w-5 h-5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Numerical Input Option */
              <div className="mt-6">
                <input
                  type="text"
                  placeholder="Type numerical answer..."
                  value={selectedAnswer || ''}
                  onChange={(e) => handleOptionClick(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-slate-800/80 border border-white/15 text-white font-mono text-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* Confidence Prompt Modal / Card */}
        <AnimatePresence>
          {showConfidencePrompt && selectedAnswer !== null && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-6 rounded-3xl border border-indigo-500/30 bg-slate-900/95 p-6 backdrop-blur-xl shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">How confident are you with this answer?</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Scholarly uses your confidence estimation to calculate your Confidence Calibration & Cognitive Profile.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {[
                  { label: 'Very Confident', cls: 'hover:border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-300' },
                  { label: 'Confident', cls: 'hover:border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-300' },
                  { label: 'Not Sure', cls: 'hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-300' },
                  { label: 'Pure Guess', cls: 'hover:border-rose-500/50 hover:bg-rose-500/10 text-rose-300' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handleConfidenceSelect(item.label as any)}
                    className={`px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] ${item.cls}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
