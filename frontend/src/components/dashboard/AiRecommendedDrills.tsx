import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Zap,
  Clock,
  HelpCircle,
  ChevronRight,
  Sparkles,
  RotateCw,
  Target,
  BookOpen,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import { useProfile } from '../../hooks/api/useProfile';
import { useUserStats } from '../../hooks/api/useUserStats';
import { useAdaptiveAssessment } from '../../hooks/api/useAdaptiveAssessment';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { useTheme } from '../../lib/ThemeContext';
import { EXAM_CATALOG } from '../../lib/examCatalog';
import { examApi } from '../../lib/api/exams';
import { quizApi } from '../../lib/api/quiz';

/** "SSC_CGL" / "ssc-cgl" / "SSC CGL" all collapse to "ssccgl", matching the backend's own
 *  normaliseExamToken (examIndex.ts) so a catalog slug and a canonical examId can be compared. */
function normaliseExamToken(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface DrillCard {
  id: string;
  subject: string;
  topic: string;
  badge: 'Weak Area Fix' | 'High Yield' | 'Speed Booster' | 'PYQ Focus' | 'Concept Revision';
  description: string;
  durationMins: number;
  questionCount: number;
  isWeakArea: boolean;
  accuracyNote?: string;
  /** Real canonical syllabus identity, when the weak area backing this card came from
   *  GET /quiz/weak-areas rather than the client-side digitalTwin/stats/profile merge below. */
  syllabusNodeId?: string;
  examId?: string;
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

  const targetExam = profile?.goal || profile?.targetExam || 'Competitive Exams';

  /*
   * 1. Resolve the student's exam through the SAME canonical registry PYQ/syllabus retrieval
   *    uses (examIndex.ts, via GET /exams/resolve-id) — not a frontend-only fuzzy match against
   *    this file's static catalog. This used to fall back to EXAM_CATALOG[0] (NEET) whenever the
   *    match failed, which is why an unresolved "SSC CGL" profile showed NEET/Physics/Chemistry
   *    content: the fallback silently substituted a DIFFERENT exam rather than showing nothing.
   */
  const { data: resolvedExamId } = useQuery({
    queryKey: ['examResolve', targetExam],
    queryFn: () => examApi.resolveExamId(targetExam).then((r) => r.examId),
    enabled: !!profile?.goal || !!profile?.targetExam,
    staleTime: 1000 * 60 * 10,
  });

  // 2. Match the resolved canonical id to this file's descriptive catalog (topics, high-yield
  //    lists) — NEVER falls back to an unrelated exam's entry. No match => matchedExam is null,
  //    and the component shows a neutral empty state instead of guessing.
  const matchedExam = useMemo(() => {
    if (!resolvedExamId) return null;
    const norm = normaliseExamToken(resolvedExamId);
    return (
      EXAM_CATALOG.find((e) => {
        const slug = normaliseExamToken(e.slug);
        return slug === norm || norm.includes(slug) || slug.includes(norm);
      }) ?? null
    );
  }, [resolvedExamId]);

  // 3. Identify student's active subjects. No hardcoded exam-shaped default (this used to default
  //    to ['Physics','Chemistry','Mathematics','Biology'] — a NEET/JEE-shaped guess — whenever
  //    neither profile.subjects nor a matched syllabus were available). Empty means the component
  //    shows a "complete your profile" prompt rather than another exam's subjects.
  const studentSubjects = useMemo(() => {
    if (profile?.subjects && profile.subjects.length > 0) {
      return profile.subjects;
    }
    if (matchedExam?.syllabus && matchedExam.syllabus.length > 0) {
      return matchedExam.syllabus.map((s) => s.subject.split('(')[0].trim());
    }
    return [] as string[];
  }, [profile?.subjects, matchedExam]);

  // 3a. Real, exam-scoped weak areas with syllabus identity — GET /quiz/weak-areas, the same
  // structured data QuestionMixer's WEAK_AREA_DRILL mode consumes server-side. Takes priority
  // over the client-side signals below: those carry no syllabusNodeId, so a drill built from them
  // alone can only ever be a fuzzy topic-string search, not a real scoped retrieval.
  const { data: structuredWeakAreas } = useQuery({
    queryKey: ['weakAreas', resolvedExamId],
    queryFn: () => quizApi.getWeakAreas(resolvedExamId!).then((r) => r.weakAreas),
    enabled: !!resolvedExamId,
    staleTime: 1000 * 30,
  });

  // 3b. Extract real weak topics from telemetry & profile
  const recordedWeakAreas = useMemo(() => {
    const weakList: { subject?: string; topic: string; accuracy?: number; syllabusNodeId?: string; examId?: string }[] = [];

    // Structured, backend-scoped weak areas first — these carry real syllabus identity.
    if (structuredWeakAreas && structuredWeakAreas.length > 0) {
      structuredWeakAreas.forEach((w) => {
        weakList.push({
          subject: w.subjectId, topic: w.topicName, accuracy: w.accuracy,
          syllabusNodeId: w.syllabusNodeId, examId: w.examId,
        });
      });
    }

    // From digital twin knowledge graph
    if (digitalTwin?.knowledgeGraph) {
      Object.values(digitalTwin.knowledgeGraph).forEach((concept) => {
        if (
          concept.status === 'weak' ||
          (typeof concept.masteryScore === 'number' && concept.masteryScore < 60)
        ) {
          weakList.push({
            subject: concept.subject,
            topic: concept.conceptName || concept.topic,
            accuracy: concept.masteryScore,
          });
        }
      });
    }

    // From stats weakTopics
    if (stats?.weakTopics && stats.weakTopics.length > 0) {
      stats.weakTopics.forEach((t) => {
        if (!weakList.some((w) => w.topic.toLowerCase() === t.toLowerCase())) {
          weakList.push({ topic: t });
        }
      });
    }

    // From profile weakAreas
    if (profile?.weakAreas && profile.weakAreas.length > 0) {
      profile.weakAreas.forEach((t) => {
        if (!weakList.some((w) => w.topic.toLowerCase() === t.toLowerCase())) {
          weakList.push({ topic: t });
        }
      });
    }

    return weakList;
  }, [structuredWeakAreas, digitalTwin?.knowledgeGraph, stats?.weakTopics, profile?.weakAreas]);

  // 4. Generate AI Drills tailored to student course & subjects
  const drills = useMemo(() => {
    const list: DrillCard[] = [];
    const subjectsToUse =
      selectedSubject === 'All'
        ? studentSubjects
        : [selectedSubject];

    // Badge rotation sequence
    const badgeRotation: DrillCard['badge'][] = [
      'High Yield',
      'Speed Booster',
      'PYQ Focus',
      'Concept Revision',
    ];

    subjectsToUse.forEach((subj, sIdx) => {
      // Check if subject matches a syllabus entry in the catalog
      const syllabusEntry = matchedExam?.syllabus?.find(
        (s) =>
          s.subject.toLowerCase().includes(subj.toLowerCase()) ||
          subj.toLowerCase().includes(s.subject.toLowerCase())
      );

      // A) Check for measured weak area GENUINELY tagged to this subject. Subject-less weak
      // topics (stats.weakTopics / profile.weakAreas carry no subject) used to satisfy `!w.subject`
      // here and so matched EVERY subject — a real English weakness like "Punctuation" was
      // stamped onto Physics and Chemistry cards for an SSC CGL student. They're collected
      // separately below into one honestly-labelled card instead of being dropped or contaminating
      // every subject.
      const weakMatch = recordedWeakAreas.find(
        (w) =>
          w.subject &&
          (w.subject.toLowerCase().includes(subj.toLowerCase()) ||
            subj.toLowerCase().includes(w.subject.toLowerCase()))
      );

      if (weakMatch) {
        list.push({
          id: `weak-${subj}-${weakMatch.topic}`,
          subject: subj,
          topic: weakMatch.topic,
          badge: 'Weak Area Fix',
          description: weakMatch.accuracy
            ? `Calibrated to address your recent ${Math.round(weakMatch.accuracy)}% diagnostic accuracy in ${weakMatch.topic}.`
            : `Targeted precision drill to reinforce weak fundamentals in ${subj}.`,
          durationMins: 15,
          questionCount: 10,
          isWeakArea: true,
          accuracyNote: weakMatch.accuracy ? `${Math.round(weakMatch.accuracy)}% Accuracy` : undefined,
          syllabusNodeId: weakMatch.syllabusNodeId,
          examId: weakMatch.examId,
        });
      }

      // B) Pick high-yield topics from syllabus
      const highYieldTopics = syllabusEntry?.highWeightageTopics || [];
      const chapterTopics =
        syllabusEntry?.chapters?.flatMap((c) => c.topics) || [];
      const allSyllabusTopics = [
        ...highYieldTopics,
        ...chapterTopics,
        `${subj} Core Fundamentals`,
        `${subj} Practice Problems`,
      ];

      // Use shuffle offset to rotate topics
      const offset = (sIdx * 2 + shuffleIndex) % allSyllabusTopics.length;
      const primaryTopic = allSyllabusTopics[offset] || `${subj} High-Yield Units`;
      const secondaryTopic =
        allSyllabusTopics[(offset + 1) % allSyllabusTopics.length] || `${subj} Problem Solving`;

      list.push({
        id: `syl-${subj}-${primaryTopic}`,
        subject: subj,
        topic: primaryTopic,
        badge: badgeRotation[(sIdx + shuffleIndex) % badgeRotation.length],
        description: `High-yield ${targetExam} syllabus focus on ${primaryTopic} (${subj}) with standard exam pattern questions.`,
        durationMins: 15,
        questionCount: 10,
        isWeakArea: false,
      });

      if (subjectsToUse.length === 1 || list.length < 2) {
        list.push({
          id: `syl-sec-${subj}-${secondaryTopic}`,
          subject: subj,
          topic: secondaryTopic,
          badge: badgeRotation[(sIdx + shuffleIndex + 1) % badgeRotation.length],
          description: `Reinforce speed, formula retention, and elimination shortcuts for ${secondaryTopic}.`,
          durationMins: 15,
          questionCount: 10,
          isWeakArea: false,
        });
      }
    });

    // Subject-less weak topics (no subject match found above, in the "All" view) still get
    // surfaced — real signal, just honestly labelled as unattributed rather than stamped onto a
    // subject it may not belong to.
    if (selectedSubject === 'All') {
      const unattributed = recordedWeakAreas.filter((w) => !w.subject);
      if (unattributed.length > 0) {
        const top = unattributed[0];
        list.push({
          id: `weak-unattributed-${top.topic}`,
          subject: 'General',
          topic: top.topic,
          badge: 'Weak Area Fix',
          description: top.accuracy
            ? `Calibrated to address your recent ${Math.round(top.accuracy)}% diagnostic accuracy in ${top.topic}.`
            : `Targeted precision drill for a recently flagged weak area.`,
          durationMins: 15,
          questionCount: 10,
          isWeakArea: true,
          accuracyNote: top.accuracy ? `${Math.round(top.accuracy)}% Accuracy` : undefined,
          syllabusNodeId: top.syllabusNodeId,
          examId: top.examId,
        });
      }
    }

    // Ensure we always have at least 2 distinct drills
    return list.slice(0, 4);
  }, [
    studentSubjects,
    selectedSubject,
    matchedExam,
    recordedWeakAreas,
    targetExam,
    shuffleIndex,
  ]);

  const handleStartDrill = (drill: DrillCard) => {
    launch({
      // A real syllabusNodeId already pins WHERE precisely — concatenating subject+topic into
      // one search string on top of it would just add noise to the mixer's exact-node retrieval.
      // Falls back to the combined string for syllabus-catalog-derived cards (High Yield / Speed
      // Booster / etc.), which never had a real node to begin with.
      topic: drill.syllabusNodeId ? drill.topic : `${drill.subject} - ${drill.topic}`,
      count: drill.questionCount,
      mode: 'exam',
      syllabusNodeId: drill.syllabusNodeId,
      examId: drill.examId,
      isWeakAreaDrill: drill.isWeakArea,
    });
  };

  const getBadgeStyle = (badge: DrillCard['badge']) => {
    switch (badge) {
      case 'Weak Area Fix':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'High Yield':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'Speed Booster':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'PYQ Focus':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'Concept Revision':
      default:
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558]" />
            <span>AI-Recommended Weak Area Drills</span>
            <span className="text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 text-[#6ca855] dark:text-[#c8e558] border border-[#6ca855]/20 dark:border-[#c8e558]/20">
              Personalized for {targetExam}
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh AI recommendations button */}
          <button
            onClick={() => setShuffleIndex((prev) => prev + 1)}
            title="Roll new syllabus topics"
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

      {/* Subject Filter Pills (if student has multiple subjects) */}
      {studentSubjects.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedSubject('All')}
            className={cn(
              "text-[11px] font-semibold px-3 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap",
              selectedSubject === 'All'
                ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-2xs font-bold"
                : isDarkMode
                ? "bg-[#1a1a1e] text-slate-400 border-white/[0.08] hover:text-slate-200 hover:bg-[#222228]"
                : "bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            All Subjects ({studentSubjects.length})
          </button>

          {studentSubjects.map((subj) => (
            <button
              key={subj}
              onClick={() => setSelectedSubject(subj)}
              className={cn(
                "text-[11px] font-medium px-3 py-1 rounded-full border transition-all cursor-pointer whitespace-nowrap",
                selectedSubject === subj
                  ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 border-transparent shadow-2xs font-bold"
                  : isDarkMode
                  ? "bg-[#1a1a1e] text-slate-400 border-white/[0.08] hover:text-slate-200 hover:bg-[#222228]"
                  : "bg-white text-slate-600 border-slate-200/80 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {subj}
            </button>
          ))}
        </div>
      )}

      {/* Empty state: no exam resolved and no subjects on the profile — show a prompt instead of
          silently falling back to another exam's content (the previous behavior). */}
      {drills.length === 0 && (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
          )}
        >
          <BookOpen className="w-5 h-5 mx-auto mb-2 text-slate-400" />
          <p className="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
            Set your target exam and subjects in your profile to see personalized practice drills.
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
