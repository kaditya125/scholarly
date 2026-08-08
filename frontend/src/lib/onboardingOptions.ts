/**
 * Single source of truth for the student onboarding / learning profile — the option lists, the
 * profile shape, the small derivation helpers (stream auto-selection, which steps apply), and the
 * completion-percentage calc. Shared by the onboarding wizard, the Settings > Learning Profile
 * editor, and the dashboard profile card so they never drift.
 */

export type PreparationLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LearningProfile {
  /** Primary goal — an exam ("NEET") or a class ("Class 10"). */
  goal?: string;
  /** Mirrored from goal by the backend for legacy checks. */
  targetExam?: string;
  board?: string;
  classLevel?: string;
  stream?: string;
  subjects?: string[];
  preparationLevel?: PreparationLevel;
  /** Concrete aspiration, e.g. "650+ marks", "AIR under 1000". */
  target?: string;
  /** Hours per day (0.5 = 30 min). */
  dailyStudyHours?: number;
  learningStyles?: string[];
  preferredLanguage?: string;
  targetYear?: string;
  weakAreas?: string[];
  onboardedAt?: string;
  isComplete?: boolean;
}

// ─── Option lists ────────────────────────────────────────────────────────────

/** Grouped so the wizard can show classes and exams as visually distinct clusters. */
export const GOAL_GROUPS: { label: string; options: string[] }[] = [
  { label: 'School', options: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'] },
  { label: 'Medical / Engineering', options: ['NEET', 'JEE Main', 'JEE Advanced'] },
  { label: 'University & Other Exams', options: ['CUET', 'Olympiads', 'Foundation', 'UPSC', 'SSC', 'GATE', 'College'] },
  { label: 'Other', options: ['State Board', 'Other'] },
];

export const GOALS: string[] = GOAL_GROUPS.flatMap((g) => g.options);

export const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge', 'Other'];

export const STREAMS = ['Science', 'Commerce', 'Arts'];

export const SUBJECTS = [
  'Physics', 'Chemistry', 'Biology', 'Mathematics',
  'English', 'Hindi', 'Computer Science',
  'History', 'Geography', 'Political Science', 'Economics',
  'Accountancy', 'Business Studies', 'General Knowledge', 'Reasoning',
];

export const LEVELS: { value: PreparationLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'Just starting out — build from the ground up' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Know the basics — need practice & revision' },
  { value: 'advanced', label: 'Advanced', hint: 'Strong grasp — aiming for mastery' },
];

export const TARGET_SUGGESTIONS = [
  'Score above 95%', 'Crack the exam', 'AIR under 1000', 'Pass board exams',
  'Improve fundamentals', 'Daily learning habit', 'School homework help', 'Competitive preparation',
];

export const STUDY_TIMES: { value: number; label: string }[] = [
  { value: 0.5, label: '30 min' },
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 3, label: '3 hours' },
  { value: 4, label: '4+ hours' },
];

export const LEARNING_STYLES = [
  'Visual explanations', 'Diagrams', 'Animations', 'Videos', 'AI Tutor', 'Mind Maps',
  'Flashcards', 'Practice Questions', 'MCQs', 'Revision Notes', 'Podcasts', 'Mixed',
];

export const LANGUAGES = ['English', 'Hindi', 'Bilingual'];

// ─── Derivation helpers ──────────────────────────────────────────────────────

/** NEET implies PCB and JEE implies PCM — auto-derive so the student doesn't pick a stream twice. */
export function autoStream(goal?: string): string | null {
  if (!goal) return null;
  if (goal === 'NEET') return 'PCB (Physics, Chemistry, Biology)';
  if (goal === 'JEE Main' || goal === 'JEE Advanced') return 'PCM (Physics, Chemistry, Maths)';
  return null;
}

/** Streams apply to Class 11+/college/CUET, and only when not already auto-derived by the goal. */
export function showStreamStep(goal?: string): boolean {
  if (!goal || autoStream(goal)) return false;
  return ['Class 11', 'Class 12', 'CUET', 'College'].includes(goal);
}

/** Reasonable default subjects for a goal, so the Subjects step starts pre-filled (still editable). */
export function suggestedSubjects(goal?: string, stream?: string): string[] {
  if (goal === 'NEET') return ['Physics', 'Chemistry', 'Biology'];
  if (goal === 'JEE Main' || goal === 'JEE Advanced') return ['Physics', 'Chemistry', 'Mathematics'];
  const s = stream || '';
  if (s.startsWith('Science')) return ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
  if (s.startsWith('Commerce')) return ['Accountancy', 'Business Studies', 'Economics', 'Mathematics'];
  if (s.startsWith('Arts')) return ['History', 'Geography', 'Political Science', 'Economics'];
  return [];
}

// ─── Completion ──────────────────────────────────────────────────────────────

/** The fields that make up a "complete" learning profile, weighted equally. */
const COMPLETION_FIELDS: (keyof LearningProfile)[] = [
  'goal', 'board', 'subjects', 'preparationLevel', 'target', 'dailyStudyHours', 'learningStyles', 'preferredLanguage',
];

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  return true;
}

/** Percentage (0-100) of the core profile fields that are filled. */
export function profileCompletion(profile?: LearningProfile | null): number {
  if (!profile) return 0;
  const filled = COMPLETION_FIELDS.filter((f) => isFilled(profile[f])).length;
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

/** A short human summary of the goal for the dashboard card, e.g. "Preparing for NEET". */
export function goalHeadline(profile?: LearningProfile | null): string | null {
  if (!profile) return null;
  const goal = profile.goal || profile.targetExam || profile.classLevel;
  if (!goal && !profile.board && !profile.stream && !profile.target) return null;

  if (!goal) {
    if (profile.board) return `${profile.board} Student Profile`;
    if (profile.stream) return `${profile.stream} Learning Profile`;
    return 'Customized AI Learning Profile';
  }

  const year = profile.targetYear ? ` ${profile.targetYear}` : '';
  return /^Class\b/i.test(goal) ? `Studying ${goal}${year}` : `Preparing for ${goal}${year}`;
}
