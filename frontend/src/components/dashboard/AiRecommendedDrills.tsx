import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Brain, Zap, Clock, HelpCircle, ChevronRight, RotateCw, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useProfile } from '../../hooks/api/useProfile';
import { useUserStats } from '../../hooks/api/useUserStats';
import { useAdaptiveAssessment } from '../../hooks/api/useAdaptiveAssessment';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { useTheme } from '../../lib/ThemeContext';
import { quizApi, DrillTopicsResponse } from '../../lib/api/quiz';

/**
 * Dashboard drill cards, built ONLY from real data:
 *   - "Weak Area Fix": the student's measured weak topics (quiz results / diagnostics), matched to a
 *     topic or subject that actually exists in the exam's corpus. Free-text weak labels that match
 *     nothing are dropped rather than turned into an ungrounded drill.
 *   - "High Yield" / "PYQ Focus": the exam's topics ranked by how many genuine previous-year
 *     questions carry them (GET /quiz/drill-topics) — not a hand-typed syllabus list.
 * Each card launches with subject and topic sent separately, so the backend's QuestionMixer can
 * retrieve real PYQs and indexed reference-book questions for exactly that topic.
 */

interface DrillCard {
  id: string;
  subject: string;
  topic: string;
  badge: 'Weak Area Fix' | 'High Yield' | 'PYQ Focus';
  description: string;
  durationMins: number;
  questionCount: number;
  isWeakArea: boolean;
  /** Subject-level drill (the weak area is a whole subject, not one topic). */
  subjectLevel?: boolean;
  accuracyNote?: string;
  syllabusNodeId?: string;
  examId?: string;
}

/** Loose comparison key for subject/topic names ("General Intelligence & Reasoning" ≈ "general intelligence and reasoning"). */
const norm = (s: unknown) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const looselyEqual = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

type Subjects = DrillTopicsResponse['subjects'];

/** Map a free-text weak label to something the corpus actually has: a whole subject, or a topic. */
function groundWeakLabel(label: string, subjects: Subjects, subjectHint?: string):
  | { kind: 'subject'; subject: string }
  | { kind: 'topic'; subject: string; topic: string }
  | null {
  const subj = subjects.find((s) => looselyEqual(s.subject, label));
  if (subj) return { kind: 'subject', subject: subj.subject };
  const pool = subjectHint ? subjects.filter((s) => looselyEqual(s.subject, subjectHint)) : subjects;
  for (const s of pool.length ? pool : subjects) {
    const t = s.topics.find((t) => looselyEqual(t.topic, label));
    if (t) return { kind: 'topic', subject: s.subject, topic: t.topic };
  }
  return null;
}

export function AiRecommendedDrills() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const { digitalTwin } = useAdaptiveAssessment();
  const launch = useLaunchTest();

  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [shuffleIndex, setShuffleIndex] = useState(0);

  const targetExam = profile?.targetExam || profile?.goal || '';

  // The exam's real topics, ranked by genuine PYQ frequency. The backend resolves the free-text
  // goal through the same exam registry retrieval uses — no client-side catalog matching.
  const { data: drillTopics, isLoading } = useQuery({
    queryKey: ['drillTopics', targetExam],
    queryFn: () => quizApi.getDrillTopics(targetExam),
    enabled: !!targetExam,
    staleTime: 1000 * 60 * 30,
  });
  const subjects: Subjects = drillTopics?.subjects || [];
  const examId = drillTopics?.examId || undefined;
  // The exam the drills actually come from ("SSC_CGL" → "SSC CGL"), which can be more specific
  // than the profile's goal (the "SSC" family option drills from SSC CGL).
  const examLabel = examId ? examId.replace(/_/g, ' ') : targetExam;

  // Measured, exam-scoped weak topics (carry syllabus identity when known).
  const { data: structuredWeak } = useQuery({
    queryKey: ['weakAreas', targetExam],
    queryFn: () => quizApi.getWeakAreas(targetExam).then((r) => r.weakAreas),
    enabled: !!targetExam,
    staleTime: 1000 * 30,
  });

  const subjectNames = useMemo(() => subjects.filter((s) => s.topics.length > 0).map((s) => s.subject), [subjects]);

  const weakCards = useMemo(() => {
    if (subjects.length === 0) return [] as DrillCard[];
    const cards: DrillCard[] = [];
    const seen = new Set<string>();
    const push = (c: DrillCard) => {
      const k = `${norm(c.subject)}::${norm(c.topic)}`;
      if (seen.has(k)) return;
      seen.add(k);
      cards.push(c);
    };

    // 1. Structured weak topics from real quiz results.
    for (const w of structuredWeak || []) {
      const grounded = groundWeakLabel(w.topicName, subjects, w.subjectId);
      if (!grounded && !w.syllabusNodeId) continue;
      const subject = grounded?.subject || subjects.find((s) => looselyEqual(s.subject, w.subjectId || ''))?.subject || 'Weak area';
      const topic = grounded?.kind === 'topic' ? grounded.topic : w.topicName;
      const acc = Math.round(w.accuracy);
      push({
        id: `weak-${subject}-${topic}`, subject, topic, badge: 'Weak Area Fix',
        description: `You scored ${acc}% on ${topic} across ${w.total} attempted question${w.total === 1 ? '' : 's'}. This drill targets it with real previous-year questions.`,
        durationMins: 15, questionCount: 10, isWeakArea: true, subjectLevel: grounded?.kind === 'subject',
        accuracyNote: `${acc}% accuracy`, syllabusNodeId: w.syllabusNodeId, examId: w.examId || examId,
      });
    }

    // 2. Diagnostic / profile weak labels — kept only when they match the exam's real corpus.
    const labels: { label: string; accuracy?: number; subjectHint?: string }[] = [];
    Object.values(digitalTwin?.knowledgeGraph || {}).forEach((c: any) => {
      if (c.status === 'weak' || (typeof c.masteryScore === 'number' && c.masteryScore < 60)) {
        labels.push({ label: c.conceptName || c.topic, accuracy: c.masteryScore, subjectHint: c.subject });
      }
    });
    (stats?.weakTopics || []).forEach((t: string) => labels.push({ label: t }));
    (profile?.weakAreas || []).forEach((t: string) => labels.push({ label: t }));

    for (const l of labels) {
      const g = groundWeakLabel(l.label, subjects, l.subjectHint);
      if (!g) continue;
      const topic = g.kind === 'topic' ? g.topic : `Mixed ${g.subject}`;
      const acc = typeof l.accuracy === 'number' ? Math.round(l.accuracy) : null;
      push({
        id: `weak-${g.subject}-${topic}`, subject: g.subject, topic, badge: 'Weak Area Fix',
        description: g.kind === 'subject'
          ? `Your diagnostics flagged ${g.subject} as weak. A mixed drill across its most-asked topics, from real previous-year questions.`
          : `Flagged in your diagnostics${acc != null ? ` at ${acc}% mastery` : ''}. Practise ${topic} with real previous-year questions.`,
        durationMins: 15, questionCount: 10, isWeakArea: true, subjectLevel: g.kind === 'subject',
        accuracyNote: acc != null ? `${acc}% mastery` : undefined, examId,
      });
    }
    return cards;
  }, [subjects, structuredWeak, digitalTwin?.knowledgeGraph, stats?.weakTopics, profile?.weakAreas, examId]);

  const drills = useMemo(() => {
    const inScope = (c: DrillCard) => selectedSubject === 'All' || c.subject === selectedSubject;
    const list: DrillCard[] = weakCards.filter(inScope).slice(0, 2);
    const taken = new Set(list.map((c) => `${norm(c.subject)}::${norm(c.topic)}`));

    // High-yield topics, round-robin across subjects so one subject doesn't fill every slot.
    // "Refresh" advances each subject to its next most-asked topic.
    const pool = subjects.filter((s) => s.topics.length > 0 && (selectedSubject === 'All' || s.subject === selectedSubject));
    const perSubject = pool.map((s) => {
      const n = s.topics.length;
      return Array.from({ length: n }, (_, i) => ({ s, t: s.topics[(i + shuffleIndex) % n], rank: (i + shuffleIndex) % n }));
    });
    for (let round = 0; list.length < 4 && perSubject.some((q) => q.length > round); round++) {
      for (const queue of perSubject) {
        if (list.length >= 4) break;
        const item = queue[round];
        if (!item) continue;
        const k = `${norm(item.s.subject)}::${norm(item.t.topic)}`;
        if (taken.has(k)) continue;
        taken.add(k);
        list.push({
          id: `hy-${item.s.subject}-${item.t.topic}`,
          subject: item.s.subject,
          topic: item.t.topic,
          // Top 3 by real PYQ frequency within the subject earn "High Yield"; the rest are real
          // but less frequent, so they say so.
          badge: item.rank < 3 ? 'High Yield' : 'PYQ Focus',
          description: `${item.t.pyqCount.toLocaleString()} previous-year ${examLabel} questions in our bank are on ${item.t.topic}. `
            + (item.t.referenceCount > 0
              ? 'This drill mixes real PYQs with reference-book practice.'
              : 'This drill mixes real PYQs with questions in the same pattern.'),
          durationMins: 15, questionCount: 10, isWeakArea: false, examId,
        });
      }
    }
    return list;
  }, [weakCards, subjects, selectedSubject, shuffleIndex, examLabel, examId]);

  const handleStartDrill = (drill: DrillCard) => {
    launch({
      // Subject-level weak drills send the subject as the topic: the backend treats a subject name
      // as "mixed practice across this subject".
      topic: drill.subjectLevel ? drill.subject : drill.topic,
      subject: drill.subject,
      count: drill.questionCount,
      mode: 'exam',
      syllabusNodeId: drill.syllabusNodeId,
      examId: drill.examId,
      isWeakAreaDrill: drill.isWeakArea,
      // PYQ-heavy mix for topic drills: 40% real PYQs, 30% PYQ-pattern, 20% reference book, 10%
      // generated. Weak-area drills use WEAK_AREA_DRILL's own mix via isWeakAreaDrill.
      testMode: drill.isWeakArea ? undefined : 'SMART_MIXED',
    });
  };

  const getBadgeStyle = (badge: DrillCard['badge']) => {
    switch (badge) {
      case 'Weak Area Fix':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'High Yield':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'PYQ Focus':
      default:
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    }
  };

  const showEmpty = !isLoading && drills.length === 0;

  return (
    <div className="space-y-3.5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-x-2 gap-y-1">
            <Brain className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558]" />
            <span>AI-Recommended Weak Area Drills</span>
            {examLabel && (
              <span className="whitespace-nowrap text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 text-[#6ca855] dark:text-[#c8e558] border border-[#6ca855]/20 dark:border-[#c8e558]/20">
                Personalized for {examLabel}
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShuffleIndex((prev) => prev + 1)}
            title="Show the next most-asked topics"
            className="text-[12px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh Drills</span>
          </button>

          <button
            onClick={() => navigate('/tests')}
            className="text-[12px] font-semibold text-[#6ca855] dark:text-[#c8e558] hover:underline cursor-pointer flex items-center gap-0.5"
          >
            All Tests <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subject filter pills — the exam's real subjects from its PYQ corpus. */}
      {subjectNames.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {['All', ...subjectNames].map((subj) => (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={cn(
                "text-[11px] px-3 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap",
                selectedSubject === subj
                  ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-2xs font-bold"
                  : isDarkMode
                  ? "font-medium bg-[#1a1a1e] text-slate-400 border-white/[0.08] hover:text-slate-200 hover:bg-[#222228]"
                  : "font-medium bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {subj === 'All' ? `All Subjects (${subjectNames.length})` : subj}
            </button>
          ))}
        </div>
      )}

      {/* Empty state: no exam set, or an exam with no previous-year corpus yet — say so instead of
          inventing topics. */}
      {showEmpty && (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
          )}
        >
          <BookOpen className="w-5 h-5 mx-auto mb-2 text-slate-400" />
          <p className="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
            {targetExam
              ? `Drills for ${targetExam} appear once its previous-year question bank is available.`
              : 'Set your target exam in your profile to see drills built from its previous-year questions.'}
          </p>
        </div>
      )}

      {/* Drills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <AnimatePresence mode="popLayout">
          {drills.map((drill, idx) => (
            <motion.div
              key={drill.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.05, duration: 0.2 }}
              className={cn(
                "p-4 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs group hover:shadow-md",
                isDarkMode
                  ? "bg-[#1a1a1e] border-white/[0.08] hover:border-white/20"
                  : "bg-white border-slate-200/90 hover:border-slate-300"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span className="text-[10.5px] font-bold text-[#8ba32b] dark:text-[#c8e558] uppercase tracking-wider block">
                      {drill.subject}
                    </span>
                    <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white leading-tight">
                      {drill.topic}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                      getBadgeStyle(drill.badge)
                    )}
                  >
                    {drill.badge}
                  </span>
                </div>

                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                  {drill.description}
                </p>

                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" />
                    {drill.durationMins} Mins
                  </span>
                  <span className="flex items-center gap-1">
                    <HelpCircle className="w-3 h-3 text-emerald-500" />
                    {drill.questionCount} Questions
                  </span>
                  {drill.accuracyNote && (
                    <span className="text-rose-500 font-semibold">
                      · {drill.accuracyNote}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleStartDrill(drill)}
                className={cn(
                  "w-full py-2 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98",
                  isDarkMode
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 font-bold"
                    : "bg-slate-900 hover:bg-slate-800 text-white font-bold"
                )}
              >
                <Zap className="w-3.5 h-3.5 fill-current" /> Start Practice Drill
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
