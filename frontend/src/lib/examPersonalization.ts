/**
 * Central lookup driving Test Center personalization: which exams are shown to which student,
 * what subjects/categories apply, and what a student's onboarding `goal` resolves to here.
 *
 * examId values match the canonical ids the backend's exam alias index resolves to
 * (backend-firestore/src/services/pyq/examIndex.ts EXTRA_ALIASES) — passing one of these lets
 * generation and PYQ retrieval stay exam-scoped instead of falling back to free-text topic match.
 */

export interface SubjectOption {
  value: string;
  label: string;
}

export interface CategoryConfig {
  /** Key into the icon map CategoryGrid renders with — kept out of this data module on purpose. */
  icon: 'mocks' | 'subject' | 'chapter' | 'pyq' | 'daily' | 'speed';
  label: string;
  count: string;
  countNum: number;
  topic: string;
}

export interface FallbackRecommendation {
  title: string;
  topic: string;
  reason: string;
  type: string;
  count: number;
}

export interface ExamConfig {
  examId: string;
  subjectOptions: SubjectOption[];
  categories: CategoryConfig[];
  fallbackRecommendations: FallbackRecommendation[];
}

/** Canonical group -> sibling exam names, in display order. The default export order too. */
export const EXAM_GROUPS: Record<string, string[]> = {
  ssc: ['SSC CGL', 'SSC CHSL'],
  upsc: ['UPSC'],
  'state-psc': ['BPSC', 'TRE Bihar'],
  railway: ['Railway NTPC'],
  engineering: ['JEE Main', 'JEE Advanced'],
  medical: ['NEET'],
  banking: ['Banking PO'],
};

/** Every exam the selector can show, group order then within-group order. */
export const EXAMS: string[] = Object.values(EXAM_GROUPS).flat();

function ssc(examId: string, label: string): ExamConfig {
  return {
    examId,
    subjectOptions: [
      { value: 'Quantitative Aptitude', label: 'Quantitative Aptitude' },
      { value: 'General Intelligence & Reasoning', label: 'General Intelligence & Reasoning' },
      { value: 'English Comprehension', label: 'English Comprehension' },
      { value: 'General Awareness', label: 'General Awareness' },
    ],
    categories: [
      { icon: 'mocks', label: `${label} Full Mocks (100 Qs)`, count: '20 Sets', countNum: 100, topic: `${label} Full Mock` },
      { icon: 'subject', label: 'Quant Speed Drills', count: '15 Min Sprints', countNum: 15, topic: 'Quantitative Aptitude' },
      { icon: 'chapter', label: 'Reasoning Pattern Sets', count: '100+ Topics', countNum: 15, topic: 'General Intelligence & Reasoning' },
      { icon: 'subject', label: 'English Comprehension', count: '100+ Topics', countNum: 15, topic: 'English Comprehension' },
      { icon: 'daily', label: 'GK & Current Affairs', count: 'Fresh Daily', countNum: 10, topic: 'General Awareness' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 25, topic: `${label} Previous Year Papers` },
    ],
    fallbackRecommendations: [
      {
        title: 'Speed & Quantitative Diagnostic',
        topic: 'Quantitative Aptitude',
        reason: 'Calibrated to test your mental math calculation speed and time management.',
        type: 'Speed Drill',
        count: 10,
      },
      {
        title: 'High-Yield Reasoning Patterns',
        topic: 'General Intelligence & Reasoning',
        reason: 'Targeting high-frequency syllogisms, series, and puzzle arrangements.',
        type: 'Concept Focus',
        count: 10,
      },
    ],
  };
}

function statePsc(examId: string, label: string): ExamConfig {
  return {
    examId,
    subjectOptions: [
      { value: 'General Studies I', label: 'General Studies I' },
      { value: 'General Studies II', label: 'General Studies II' },
      { value: 'Current Affairs', label: 'Current Affairs' },
      { value: 'Essay', label: 'Essay' },
    ],
    categories: [
      { icon: 'mocks', label: `${label} Full Mocks`, count: '15+ Sets', countNum: 100, topic: `${label} Full Mock` },
      { icon: 'subject', label: 'GS Paper I Sets', count: '100+ Topics', countNum: 15, topic: 'General Studies I' },
      { icon: 'chapter', label: 'GS Paper II Sets', count: '100+ Topics', countNum: 15, topic: 'General Studies II' },
      { icon: 'daily', label: 'State Current Affairs', count: 'Fresh Daily', countNum: 10, topic: 'Current Affairs' },
      { icon: 'speed', label: 'Essay Practice', count: '5 Min Sprints', countNum: 5, topic: 'Essay' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 20, topic: `${label} Previous Year Papers` },
    ],
    fallbackRecommendations: [
      {
        title: 'General Studies I Diagnostic',
        topic: 'General Studies I',
        reason: 'History, geography and society questions calibrated to recent paper patterns.',
        type: 'Concept Focus',
        count: 10,
      },
      {
        title: 'Current Affairs Weekly Booster',
        topic: 'Current Affairs',
        reason: 'Stay sharp on the last 4 weeks of state and national developments.',
        type: 'Speed Drill',
        count: 10,
      },
    ],
  };
}

export const EXAM_CONFIG: Record<string, ExamConfig> = {
  'SSC CGL': ssc('SSC_CGL', 'SSC CGL'),
  'SSC CHSL': ssc('SSC_CHSL', 'SSC CHSL'),
  'UPSC': {
    examId: 'UPSC_CSE',
    subjectOptions: [
      { value: 'GS Paper I', label: 'GS Paper I' },
      { value: 'GS Paper II', label: 'GS Paper II' },
      { value: 'GS Paper III', label: 'GS Paper III' },
      { value: 'CSAT', label: 'CSAT' },
      { value: 'Essay', label: 'Essay' },
    ],
    categories: [
      { icon: 'mocks', label: 'UPSC Prelims Full Mocks', count: '10+ Sets', countNum: 100, topic: 'UPSC Prelims Full Mock' },
      { icon: 'subject', label: 'GS Paper I Sets', count: '100+ Topics', countNum: 15, topic: 'GS Paper I' },
      { icon: 'chapter', label: 'GS Paper II (Polity)', count: '100+ Topics', countNum: 15, topic: 'GS Paper II' },
      { icon: 'daily', label: 'Current Affairs Weekly', count: 'Fresh Weekly', countNum: 15, topic: 'Current Affairs' },
      { icon: 'speed', label: 'CSAT Practice', count: '5 Min Sprints', countNum: 10, topic: 'CSAT' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 20, topic: 'UPSC Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'GS Paper II Polity Diagnostic',
        topic: 'GS Paper II',
        reason: 'Constitution, governance and polity questions calibrated to Prelims difficulty.',
        type: 'Concept Focus',
        count: 10,
      },
      {
        title: 'CSAT Comprehension Booster',
        topic: 'CSAT',
        reason: 'Reading comprehension and logical reasoning under Prelims time pressure.',
        type: 'Speed Drill',
        count: 10,
      },
    ],
  },
  'BPSC': statePsc('BPSC_CCE', 'BPSC'),
  'TRE Bihar': statePsc('BPSC_TRE', 'TRE Bihar'),
  'Railway NTPC': {
    examId: 'RRB_NTPC',
    subjectOptions: [
      { value: 'Mathematics', label: 'Mathematics' },
      { value: 'General Intelligence & Reasoning', label: 'General Intelligence & Reasoning' },
      { value: 'General Awareness', label: 'General Awareness' },
      { value: 'General Science', label: 'General Science' },
    ],
    categories: [
      { icon: 'mocks', label: 'RRB NTPC Full Mocks', count: '15+ Sets', countNum: 100, topic: 'RRB NTPC Full Mock' },
      { icon: 'subject', label: 'Math Speed Drills', count: '15 Min Sprints', countNum: 15, topic: 'Mathematics' },
      { icon: 'chapter', label: 'Reasoning Pattern Sets', count: '100+ Topics', countNum: 15, topic: 'General Intelligence & Reasoning' },
      { icon: 'daily', label: 'GK & Current Affairs', count: 'Fresh Daily', countNum: 10, topic: 'General Awareness' },
      { icon: 'speed', label: 'General Science Sprints', count: '5 Min Sprints', countNum: 10, topic: 'General Science' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 20, topic: 'RRB NTPC Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'Math Speed Diagnostic',
        topic: 'Mathematics',
        reason: 'Calibrated to test your mental math calculation speed and time management.',
        type: 'Speed Drill',
        count: 10,
      },
      {
        title: 'High-Yield Reasoning Patterns',
        topic: 'General Intelligence & Reasoning',
        reason: 'Targeting high-frequency syllogisms, series, and puzzle arrangements.',
        type: 'Concept Focus',
        count: 10,
      },
    ],
  },
  'JEE Main': {
    examId: 'JEE_MAIN',
    subjectOptions: [
      { value: 'Physics', label: 'Physics' },
      { value: 'Chemistry', label: 'Chemistry' },
      { value: 'Mathematics', label: 'Mathematics' },
    ],
    categories: [
      { icon: 'mocks', label: 'JEE Main Full Mocks', count: '15+ Sets', countNum: 75, topic: 'JEE Main Full Mock' },
      { icon: 'subject', label: 'Physics Numericals', count: '100+ Topics', countNum: 15, topic: 'Physics' },
      { icon: 'chapter', label: 'Chemistry Reaction Drills', count: '100+ Topics', countNum: 15, topic: 'Chemistry' },
      { icon: 'subject', label: 'Mathematics Problem Sets', count: '100+ Topics', countNum: 15, topic: 'Mathematics' },
      { icon: 'daily', label: 'Daily AI Quiz', count: 'Fresh Daily', countNum: 10, topic: 'JEE Main' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 25, topic: 'JEE Main Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'Physics Numericals Diagnostic',
        topic: 'Physics',
        reason: 'Mechanics and electrodynamics numericals calibrated to JEE Main difficulty.',
        type: 'Concept Focus',
        count: 10,
      },
      {
        title: 'Mathematics Speed Booster',
        topic: 'Mathematics',
        reason: 'Calculus and coordinate geometry problems under exam time pressure.',
        type: 'Speed Drill',
        count: 10,
      },
    ],
  },
  'JEE Advanced': {
    examId: 'JEE_ADVANCED',
    subjectOptions: [
      { value: 'Physics', label: 'Advanced Physics' },
      { value: 'Chemistry', label: 'Advanced Chemistry' },
      { value: 'Mathematics', label: 'Advanced Mathematics' },
    ],
    categories: [
      { icon: 'mocks', label: 'JEE Advanced Full Mocks', count: '10+ Sets', countNum: 54, topic: 'JEE Advanced Full Mock' },
      { icon: 'subject', label: 'Physics Numericals', count: '100+ Topics', countNum: 15, topic: 'Physics' },
      { icon: 'chapter', label: 'Chemistry Reaction Drills', count: '100+ Topics', countNum: 15, topic: 'Chemistry' },
      { icon: 'subject', label: 'Mathematics Problem Sets', count: '100+ Topics', countNum: 15, topic: 'Mathematics' },
      { icon: 'daily', label: 'Daily AI Quiz', count: 'Fresh Daily', countNum: 10, topic: 'JEE Advanced' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 20, topic: 'JEE Advanced Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'Multi-Concept Physics Diagnostic',
        topic: 'Physics',
        reason: 'Problems that merge multiple chapters, the way JEE Advanced actually tests.',
        type: 'Concept Focus',
        count: 10,
      },
      {
        title: 'Organic Chemistry Mechanism Booster',
        topic: 'Chemistry',
        reason: 'Multi-step syntheses and named reactions at Advanced difficulty.',
        type: 'Speed Drill',
        count: 10,
      },
    ],
  },
  'NEET': {
    examId: 'NEET_UG',
    subjectOptions: [
      { value: 'Biology', label: 'Biology' },
      { value: 'Physics', label: 'Physics' },
      { value: 'Chemistry', label: 'Chemistry' },
    ],
    categories: [
      { icon: 'mocks', label: 'NEET Full Mocks (180 Qs)', count: '15+ Sets', countNum: 180, topic: 'NEET Full Mock' },
      { icon: 'subject', label: 'Biology MCQ Sets', count: '100+ Topics', countNum: 15, topic: 'Biology' },
      { icon: 'chapter', label: 'Physics Numericals', count: '100+ Topics', countNum: 15, topic: 'Physics' },
      { icon: 'subject', label: 'Chemistry Reaction Drills', count: '100+ Topics', countNum: 15, topic: 'Chemistry' },
      { icon: 'daily', label: 'Daily AI Quiz', count: 'Fresh Daily', countNum: 10, topic: 'NEET' },
      { icon: 'pyq', label: 'NEET PYQ Papers', count: '2018-2025', countNum: 25, topic: 'NEET Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'NCERT Biology Diagnostic',
        topic: 'Biology',
        reason: 'Line-by-line NCERT-grounded questions — where 85%+ of NEET Biology comes from.',
        type: 'Concept Focus',
        count: 10,
      },
      {
        title: 'Physics Numericals Speed Booster',
        topic: 'Physics',
        reason: 'Mechanics and electrodynamics numericals under exam time pressure.',
        type: 'Speed Drill',
        count: 10,
      },
    ],
  },
  'Banking PO': {
    examId: 'IBPS_PO',
    subjectOptions: [
      { value: 'Quantitative Aptitude', label: 'Quantitative Aptitude' },
      { value: 'Reasoning', label: 'Reasoning' },
      { value: 'English', label: 'English' },
      { value: 'General Awareness', label: 'General Awareness' },
      { value: 'Computer', label: 'Computer Knowledge' },
    ],
    categories: [
      { icon: 'mocks', label: 'Banking PO Full Mocks', count: '15+ Sets', countNum: 100, topic: 'Banking PO Full Mock' },
      { icon: 'subject', label: 'Quant Speed Drills', count: '15 Min Sprints', countNum: 15, topic: 'Quantitative Aptitude' },
      { icon: 'chapter', label: 'Reasoning Pattern Sets', count: '100+ Topics', countNum: 15, topic: 'Reasoning' },
      { icon: 'subject', label: 'English Comprehension', count: '100+ Topics', countNum: 15, topic: 'English' },
      { icon: 'daily', label: 'Banking & Current Affairs', count: 'Fresh Daily', countNum: 10, topic: 'General Awareness' },
      { icon: 'pyq', label: 'Previous Year Papers', count: '2018-2025', countNum: 20, topic: 'Banking PO Previous Year Papers' },
    ],
    fallbackRecommendations: [
      {
        title: 'Speed & Quantitative Diagnostic',
        topic: 'Quantitative Aptitude',
        reason: 'Calibrated to test your mental math calculation speed and time management.',
        type: 'Speed Drill',
        count: 10,
      },
      {
        title: 'High-Yield Reasoning Patterns',
        topic: 'Reasoning',
        reason: 'Targeting high-frequency puzzles, seating arrangements, and syllogisms.',
        type: 'Concept Focus',
        count: 10,
      },
    ],
  },
};

/** Fallback used for any exam name not in EXAM_CONFIG (should not normally happen — EXAMS is closed). */
const DEFAULT_EXAM: ExamConfig = EXAM_CONFIG['SSC CGL'];

export function getExamConfig(exam: string): ExamConfig {
  return EXAM_CONFIG[exam] || DEFAULT_EXAM;
}

export function groupOf(exam: string): string | undefined {
  return Object.entries(EXAM_GROUPS).find(([, exams]) => exams.includes(exam))?.[0];
}

/** Sibling exams in the same group, with `exam` itself first. Falls back to just `[exam]`. */
export function getSiblingExams(exam: string): string[] {
  const group = groupOf(exam);
  if (!group) return [exam];
  const siblings = EXAM_GROUPS[group];
  return [exam, ...siblings.filter((e) => e !== exam)];
}

/**
 * Maps a student's onboarding `goal` (broad — "SSC", "NEET") to the specific exam name the
 * selector and config use ("SSC CGL", "NEET"). Returns null for goals with no exam-scoped
 * personalization (school classes, CUET, Olympiads, Foundation, GATE, College, State Board,
 * Other) — callers keep their own generic default in that case.
 */
export function resolveExamFromGoal(goal?: string | null): string | null {
  if (!goal) return null;
  switch (goal) {
    case 'SSC': return 'SSC CGL';
    case 'NEET': return 'NEET';
    case 'JEE Main': return 'JEE Main';
    case 'JEE Advanced': return 'JEE Advanced';
    case 'UPSC': return 'UPSC';
    default: return null;
  }
}
