import {
  Network, FileSearch, Target, CalendarRange, Bot, Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Content for /our-team — the "Meet the Founder" page.
 *
 * Separated from presentation for the same reason teacherPageData.ts is: every factual
 * claim the page makes about a person or about the product can be audited in one file.
 *
 * ── THE RULE FOR THIS FILE ────────────────────────────────────────────────────────────────
 * 1. NOTHING about the founder may be written here that isn't independently verifiable.
 *    No qualifications, employers, years of experience, awards, prior startups, student
 *    counts or investors — none of that is established anywhere in this repository, and a
 *    public page is exactly where an unverified claim becomes load-bearing. If a detail
 *    isn't known, it is omitted rather than filled in.
 *
 * 2. Nothing gets `status: 'available'` unless a route is mounted in
 *    backend-firestore/src/routes/index.ts AND a real (non-mock) page renders it.
 *    Everything else is 'building'. The page says "Building toward…" for those.
 *
 * Verified 2026-08-27 against the working tree:
 *   ✅ syllabus coverage : /coverage route + coverageRoutes mounted + lib/api/coverage.ts
 *                          (server owns CoverageState; Stage 3 landed in f4552680)
 *   ✅ mastery           : masteryScore per syllabus node, keyed by a validated node id
 *                          (Stage 2, c9097d8a / f097c4c9)
 *   ✅ study plan        : /plan route + studyPlanRoutes + planningRoutes mounted
 *   ✅ AI tutor          : /chat route + chatRoutes mounted, with sources + reasoning shown
 *   ✅ community         : /community route + discussions/rooms/dm/connections mounted
 *   🟡 PYQ→concept       : pyqRoutes are mounted and PYQs appear in chat sources and test
 *                          search, but the corpus verification/publish pipeline is still
 *                          in progress (scripts/phase4a), so the concept-level linkage is
 *                          NOT claimed as finished.
 *
 * Do not promote an item here without re-checking those two things.
 */

/* ── The founder ──────────────────────────────────────────────────────────────────────── */

export interface Person {
  name: string;
  role: string;
  /** One short paragraph. Scope of work only — never a résumé. */
  blurb: string;
  /** Initials for the typographic avatar, used whenever `photo` is absent. */
  initials: string;
  /**
   * Path to a real photograph, e.g. '/founder.jpg' in public/.
   * Deliberately null: no verified image of the founder exists in this project, and a
   * generated or stock portrait of a real person would be a fabrication. Drop a file in
   * public/ and set this string — the avatar component swaps automatically, no other edit.
   */
  photo: string | null;
  /**
   * Public professional profiles.
   *
   * Empty on purpose. The only handle derivable from this repository is a personal GitHub
   * account on the git remote, which is infrastructure rather than a published founder
   * link, and no LinkedIn/X handle for the founder exists anywhere in the project. The page
   * therefore routes people to the real /contact form instead of shipping a guessed URL.
   * To add one later: append { label, href, icon } and the profile card renders it.
   */
  links: { label: string; href: string; icon: LucideIcon }[];
}

export const FOUNDER: Person = {
  name: 'Aditya Kumar',
  role: 'Founder & Product Engineer',
  blurb:
    'Building Sadhya across product, engineering, AI-powered learning systems, syllabus intelligence, PYQ infrastructure, personalized mastery, study planning, and the student experience.',
  initials: 'AK',
  photo: null,
  links: [],
};

/**
 * Future roster.
 *
 * Both are empty today and the page renders NOTHING for an empty list — no "Team" heading
 * over an empty grid, no placeholder cards. When the first hire happens, push a Person here
 * and the section appears with the same card the founder already uses.
 */
export const TEAM: Person[] = [];
export const ADVISORS: Person[] = [];

/* ── Section: the connected learning system ───────────────────────────────────────────── */

/** The chain the product is organised around, in order. Rendered as a linked sequence. */
export const LEARNING_CHAIN = [
  { label: 'Syllabus', note: 'What the exam actually asks for' },
  { label: 'Questions', note: 'What has really been asked before' },
  { label: 'Practice', note: 'Where a student meets it' },
  { label: 'Mastery', note: 'What they can now do' },
  { label: 'Planning', note: 'What to work on next' },
] as const;

/* ── Section: what I'm building ───────────────────────────────────────────────────────── */

export type BuildStatus = 'available' | 'building';

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  available: 'Live today',
  building: 'Building toward',
};

export interface BuildCard {
  icon: LucideIcon;
  title: string;
  body: string;
  status: BuildStatus;
  /** Where it lives in the product, when it exists. Sign-in may be required. */
  href?: string;
}

export const BUILDING: BuildCard[] = [
  {
    icon: Network,
    title: 'Syllabus Intelligence',
    body: 'Turning exam syllabi into structured, addressable learning maps.',
    status: 'available',
    href: '/coverage',
  },
  {
    icon: FileSearch,
    title: 'Authentic PYQs',
    body: 'Connecting real historical questions to the concepts students need to master.',
    status: 'building',
  },
  {
    icon: Target,
    title: 'Student Mastery',
    body: 'Measuring learning at the topic level instead of relying only on activity metrics.',
    status: 'available',
    href: '/coverage',
  },
  {
    icon: CalendarRange,
    title: 'Personalized Planning',
    body: 'Turning syllabus gaps and mastery into a practical study plan.',
    status: 'available',
    href: '/plan',
  },
  {
    icon: Bot,
    title: 'AI Learning',
    body: 'Helping students understand concepts, questions, and difficult topics when they need help.',
    status: 'available',
    href: '/chat',
  },
  {
    icon: Users,
    title: 'Student Community',
    body: 'Creating a space where students can learn, discuss, and grow together.',
    status: 'available',
    href: '/community',
  },
];

/* ── Section: the core philosophy ─────────────────────────────────────────────────────── */

/** The five questions the product is designed to answer, in the order it answers them. */
export const PHILOSOPHY_QUESTIONS = [
  'What is in the syllabus?',
  'What has the student covered?',
  'What do they actually understand?',
  'Where are they weak?',
  'What should they practice next?',
] as const;
