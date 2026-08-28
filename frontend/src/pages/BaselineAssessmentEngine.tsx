import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldAlert, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';
import { PreAssessmentScreen } from '../components/assessment/PreAssessmentScreen';

import { useAuth } from '../lib/AuthContext';
import { sendRealNotification } from '../lib/api/realtimeNotifications';

export default function BaselineAssessmentEngine() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    clearResponse,
    handleAnswerQuestion,
    trackHover,
    loadError,
    retry,
  } = useAdaptiveAssessment();

  const [showPreModal, setShowPreModal] = useState(true);
  const [showConfidencePrompt, setShowConfidencePrompt] = useState(false);

  /*
   * Session clock. Counts UP, and is labelled "Time elapsed" rather than "Time left" — see the
   * note above the render. Started when the first question actually arrives, not on mount, so the
   * generation wait (which can be ~13 s) is not charged to the candidate.
   */
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!questions?.length) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - (startedAtRef.current as number)) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [questions?.length]);

  useEffect(() => {
    if (isAssessmentFinished) {
      if (user?.uid) {
        sendRealNotification({
          userId: user.uid,
          type: 'assessment',
          category: 'ai',
          title: '🧠 AI Baseline Assessment Complete!',
          body: 'Your academic calibration is finished. Your Student Digital Twin and personalized roadmap are active.',
          actionUrl: '/welcome',
          actions: ['View Digital Twin'],
          priority: 'high',
        }).catch(() => {});
      }
      navigate('/welcome');
    }
  }, [isAssessmentFinished, navigate, user?.uid]);

  useEffect(() => {
    if (questions && questions.length > 0) {
      setShowPreModal(false);
    }
  }, [questions]);

  const handleStart = async () => {
    setShowPreModal(false);
    await startAssessment();
  };

  /*
   * Selecting an option no longer pops the confidence prompt. In a CBT you choose, you may change
   * your mind, and only then commit with Save & Next — interrupting at the moment of selection
   * both broke that rhythm and made changing an answer feel like a mistake. The prompt now fires
   * from Save & Next, which is also where the commit genuinely happens.
   */
  const handleOptionClick = (opt: string | number) => {
    handleSelectOption(opt);
  };

  /** mm:ss, or h:mm:ss once an hour has passed. */
  const formatClock = (total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const handleConfidenceSelect = async (rating: 'Very Confident' | 'Confident' | 'Not Sure' | 'Pure Guess') => {
    setShowConfidencePrompt(false);
    await handleAnswerQuestion(rating);
  };

  /*
   * An honest failure state. Previously a failed load was invisible: the API substituted four
   * hardcoded questions and the student sat a fabricated assessment believing it was theirs.
   * Showing the error costs a moment; the alternative silently calibrated their Digital Twin on
   * questions from an exam they may not even be taking.
   */
  if (loadError && (!questions || questions.length === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#0b0b0c] text-slate-900 dark:text-white p-6">
        <div className="w-full max-w-sm bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/10 rounded-lg p-7 text-center">
          <ShieldAlert className="w-7 h-7 mx-auto text-amber-600 dark:text-amber-400" aria-hidden />
          <h2 className="mt-4 text-[16px] font-semibold">We couldn&rsquo;t load your paper</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-gray-300">{loadError}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
            We&rsquo;d rather show you this than a generic test. Your questions are set for your
            exam, and the result isn&rsquo;t worth having if they came from someone else&rsquo;s.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            <button
              onClick={() => retry()}
              disabled={isStarting}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {isStarting ? 'Trying again…' : 'Try again'}
              <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="h-10 px-5 rounded-md border border-slate-300 dark:border-white/15 text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showPreModal && (!questions || questions.length === 0)) {
    return <PreAssessmentScreen isOpen={showPreModal} onStart={handleStart} isLoading={isStarting} />;
  }

  /*
   * The waiting states share the exam's own chrome rather than a separate "app" styling. A student
   * mid-test should not watch the interface change character underneath them — and the previous
   * copy ("Load Questions Instantly", "Synthesizing Your Student Digital Twin") described the
   * machinery rather than telling the candidate what is happening to their paper.
   */
  if (isSubmitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#0b0b0c] text-slate-900 dark:text-white p-6">
        <div className="w-full max-w-sm text-center bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/10 rounded-lg p-7">
          <Loader2 className="w-7 h-7 mx-auto animate-spin text-slate-500 dark:text-gray-400" aria-hidden />
          <h2 className="mt-4 text-[16px] font-semibold">Submitting your responses</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
            Your answers are being graded and your starting profile built. Please don&rsquo;t close
            this tab.
          </p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#0b0b0c] text-slate-900 dark:text-white p-6">
        <div className="w-full max-w-sm text-center bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/10 rounded-lg p-7">
          <Loader2 className="w-7 h-7 mx-auto animate-spin text-slate-500 dark:text-gray-400" aria-hidden />
          <h2 className="mt-4 text-[16px] font-semibold">Preparing your paper</h2>
          {/* Honest about the wait: generation takes ~13 s, and an unexplained blank screen for
              that long reads as a hang. */}
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
            Questions are being set for your exam and subjects. This usually takes a few seconds.
          </p>
          <button
            onClick={() => startAssessment()}
            disabled={isStarting}
            className="mt-5 h-10 px-5 rounded-md border border-slate-300 dark:border-white/15 text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            {isStarting ? 'Preparing…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  /*
   * ── WHY THIS LOOKS LIKE A CBT AND NOT A QUIZ ──────────────────────────────────────────────
   * Every student using this sits a computer-based test for real — NTA, SSC, IBPS and BPSC all
   * use the same interface conventions. A diagnostic dressed as a consumer quiz (gradients,
   * glows, "Load Questions Instantly") measures something subtly different from one that looks
   * like the exam: posture, pacing and care are all calibrated by what the screen resembles. So
   * the chrome follows the conventions students already know — palette on the right, Save & Next
   * at the bottom, colour-coded status, plain high-contrast question type.
   *
   * WHAT IS DELIBERATELY NOT IMITATED. A real CBT lets you jump to any question and counts down
   * to auto-submit. Neither is true here and neither is faked. The assessment is ADAPTIVE: the
   * next batch is chosen from the answers already given, so later questions genuinely do not
   * exist yet, and a clickable palette would be a costume over a flow that cannot honour it. The
   * palette therefore reports status without accepting clicks, and the clock counts UP under the
   * label "Time elapsed" — no limit is enforced, and showing "time left" would apply pressure the
   * system would never act on.
   */
  const answeredCount = currentQIndex;
  const paletteSize = Math.max(questions.length, currentQIndex + 1);
  const optionLetter = (i: number) => String.fromCharCode(65 + i);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0b0b0c] text-slate-900 dark:text-white flex flex-col">
      {/* ── Exam chrome: who is sitting what, and for how long ───────────────────────── */}
      <header className="shrink-0 bg-white dark:bg-white/[0.04] border-b border-slate-300 dark:border-white/10">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.01em] truncate">
              Baseline Diagnostic Test
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400 truncate">
              {user?.displayName || user?.email || 'Candidate'}
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            <div className="text-right">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-gray-400">
                Time elapsed
              </p>
              <p className="text-[16px] sm:text-[18px] font-semibold tabular-nums">
                {formatClock(elapsedSec)}
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-md border border-slate-300 dark:border-white/15 text-[12px] font-semibold text-slate-600 dark:text-gray-300">
              {currentQuestion.subject}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1240px] w-full mx-auto px-4 sm:px-6 py-5 grid lg:grid-cols-[minmax(0,1fr)_248px] gap-5">
        {/* ── The question ──────────────────────────────────────────────────────────── */}
        <section className="flex flex-col bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
            <h2 className="text-[14px] font-semibold">Question {currentQIndex + 1}</h2>
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-gray-400">
              <span className="inline-flex items-center h-6 px-2 rounded border border-slate-300 dark:border-white/15 font-semibold">
                {currentQuestion.type || 'MCQ'}
              </span>
              <span className="inline-flex items-center h-6 px-2 rounded border border-slate-300 dark:border-white/15 font-semibold">
                {currentQuestion.difficulty}
              </span>
            </div>
          </div>

          <div className="flex-1 px-4 sm:px-6 py-6">
            {/* Plain, high-contrast and selectable — read the way a paper would be. */}
            <p className="text-[16px] sm:text-[17.5px] leading-[1.65] text-slate-900 dark:text-gray-100 select-text">
              {currentQuestion.question}
            </p>

            {currentQuestion.options && currentQuestion.options.length > 0 ? (
              <ul className="mt-6 space-y-2.5">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = selectedAnswer === opt;
                  return (
                    <li key={idx}>
                      {/* A real radio input, so keyboard and screen readers behave as in a CBT. */}
                      <label
                        onMouseEnter={trackHover}
                        className={
                          'flex items-start gap-3 p-3 sm:p-3.5 rounded-md border cursor-pointer transition-colors ' +
                          (isSelected
                            ? 'border-slate-900 dark:border-white bg-slate-900/[0.04] dark:bg-white/[0.08]'
                            : 'border-slate-300 dark:border-white/12 hover:bg-slate-50 dark:hover:bg-white/[0.05]')
                        }
                      >
                        <input
                          type="radio"
                          name="answer"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => handleOptionClick(opt)}
                        />
                        <span
                          aria-hidden
                          className={
                            'mt-0.5 w-6 h-6 rounded-full border flex items-center justify-center text-[12px] font-semibold shrink-0 ' +
                            (isSelected
                              ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                              : 'border-slate-400 dark:border-white/25 text-slate-600 dark:text-gray-300')
                          }
                        >
                          {optionLetter(idx)}
                        </span>
                        <span className="text-[15px] leading-relaxed text-slate-800 dark:text-gray-200">{opt}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-6">
                <label className="block text-[12.5px] font-semibold text-slate-600 dark:text-gray-300 mb-2">
                  Enter your answer
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={selectedAnswer ?? ''}
                  onChange={(e) => handleOptionClick(e.target.value)}
                  className="w-full max-w-xs px-4 py-3 rounded-md bg-white dark:bg-white/[0.05] border border-slate-300 dark:border-white/15 text-[16px] tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-white/40"
                />
              </div>
            )}
          </div>

          {/* ── The action bar, in the order a CBT puts it ───────────────────────────── */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={clearResponse}
              disabled={selectedAnswer === null}
              className="h-10 px-4 rounded-md border border-slate-300 dark:border-white/15 text-[13px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear Response
            </button>
            <button
              type="button"
              onClick={() => setShowConfidencePrompt(true)}
              disabled={selectedAnswer === null || isFetchingBatch || isSubmitting}
              className="h-10 px-5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity ml-auto inline-flex items-center gap-2"
            >
              {isFetchingBatch ? 'Loading next…' : 'Save & Next'}
              <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </section>

        {/* ── Question palette. Status only — see the note above on why it is not clickable. ── */}
        <aside className="lg:sticky lg:top-5 self-start bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/10 rounded-lg p-4">
          <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-gray-400">
            Question palette
          </h2>

          <div className="mt-3 grid grid-cols-6 lg:grid-cols-5 gap-1.5">
            {Array.from({ length: paletteSize }, (_, i) => {
              const state = i < answeredCount ? 'answered' : i === currentQIndex ? 'current' : 'pending';
              return (
                <span
                  key={i}
                  title={`Question ${i + 1}`}
                  className={
                    'h-8 rounded flex items-center justify-center text-[12px] font-semibold tabular-nums border ' +
                    (state === 'answered'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : state === 'current'
                        ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-white/[0.05] border-slate-300 dark:border-white/12 text-slate-500 dark:text-gray-400')
                  }
                >
                  {i + 1}
                </span>
              );
            })}
          </div>

          <dl className="mt-4 space-y-1.5 text-[12px] text-slate-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span aria-hidden className="w-3.5 h-3.5 rounded border bg-emerald-600 border-emerald-600 shrink-0" />
              <dt className="flex-1">Answered</dt>
              <dd className="tabular-nums font-semibold text-slate-800 dark:text-gray-200">{answeredCount}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-3.5 h-3.5 rounded border bg-slate-900 dark:bg-white border-slate-900 dark:border-white shrink-0"
              />
              <dt className="flex-1">Current</dt>
              <dd className="tabular-nums font-semibold text-slate-800 dark:text-gray-200">1</dd>
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-3.5 h-3.5 rounded border bg-slate-100 dark:bg-white/[0.05] border-slate-300 dark:border-white/12 shrink-0"
              />
              <dt className="flex-1">Not reached</dt>
              <dd className="tabular-nums font-semibold text-slate-800 dark:text-gray-200">
                {Math.max(paletteSize - answeredCount - 1, 0)}
              </dd>
            </div>
          </dl>

          {/* Says plainly why this behaves differently from the palette they know. */}
          <p className="mt-4 pt-3 border-t border-slate-200 dark:border-white/10 text-[11.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            This test adapts as you go — each question is chosen from your previous answers, so you
            cannot return to an earlier one.
          </p>
        </aside>
      </div>

      {/* ── Confidence, asked on Save & Next rather than the instant an option is clicked ── */}
      <AnimatePresence>
        {showConfidencePrompt && selectedAnswer !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowConfidencePrompt(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#141416] border border-slate-300 dark:border-white/12 rounded-lg p-5 sm:p-6"
            >
              <h3 className="text-[15px] font-semibold">How sure are you of that answer?</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
                This is recorded alongside your answer. A confident wrong answer and a lucky guess
                mean very different things about what you know, and only you can tell them apart.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {(['Very Confident', 'Confident', 'Not Sure', 'Pure Guess'] as const).map((label) => (
                  <button
                    key={label}
                    onClick={() => handleConfidenceSelect(label)}
                    className="h-11 px-3 rounded-md border border-slate-300 dark:border-white/15 text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
