import {
  Network, FileSearch, Target, CalendarRange, Bot, Users,
  Code2, BookOpenCheck, PenTool, MessagesSquare, Linkedin,
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
   * Path to a real photograph in public/.
   *
   * Must be an actual photograph of the person. A generated or stock portrait on a page whose
   * whole point is that the founder is real would be a fabrication, so this stays null until a
   * genuine image exists rather than being filled with a placeholder face.
   */
  photo: string | null;
  /**
   * A large environmental portrait for the page hero, when one exists.
   *
   * Deliberately separate from `photo`. `photo` feeds a 72px square avatar and wants a headshot
   * tight enough to survive a square crop; this feeds a wide 4:3 cover band across the top of
   * the same card and wants the opposite — room, context, the wall behind. One image cannot be
   * both, so the page carries both rather than mangling one into the other's shape.
   *
   * Three files because a hero photograph on a public page is the heaviest thing on it: WebP at
   * two widths for the browsers that take it, a JPEG at one width for the ones that don't.
   */
  heroPhoto?: {
    /** Desktop / retina-mobile WebP. */
    webp1000: string;
    /** Small-screen WebP, so a phone doesn't pull the desktop file. */
    webp500: string;
    /** Fallback for browsers without WebP, and the `src` the <img> actually carries. */
    jpg1000: string;
    /** Intrinsic size of the delivered files, so the hero reserves its space before they land. */
    width: number;
    height: number;
    /** Read into the alt text, so it describes this photograph rather than any photograph. */
    alt: string;
  } | null;
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
  // Supplied by the founder, 354x472. Rendered unretouched; the avatar crops it square from the
  // top so the face survives the crop without the source needing to be pre-cropped.
  photo: '/founder.jpg',
  /*
   * Supplied by the founder as a 1024x1536 PNG (`public/founder hero.png`, 1.9 MB). These three
   * are resamples of it, generated with sharp — same photograph, 85 KB instead of 1.9 MB at the
   * size the page actually renders. The original stays in public/ as the master; nothing links
   * to it, and its filename contains a space, which is the other reason nothing should.
   */
  heroPhoto: {
    webp1000: '/founder-hero-1000.webp',
    webp500: '/founder-hero-500.webp',
    jpg1000: '/founder-hero-1000.jpg',
    width: 1000,
    height: 1500,
    // Describes what is in the frame. Everything named here is visible in the photograph.
    alt: 'seated at a workbench in the Sadhya workspace, beside a laptop, with the Sadhya logo and the line "Every goal, attainable." on the wall behind',
  },
  links: [
    {
      label: 'LinkedIn',
      href: 'https://www.linkedin.com/in/aditya-kumar-122370267/',
      icon: Linkedin,
    },
  ],
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

/* ── Section: getting involved ────────────────────────────────────────────────────────── */

/**
 * Ways someone could contribute.
 *
 * ── THE RULE FOR THIS BLOCK ───────────────────────────────────────────────────────────────
 * These are AREAS OF WORK, not job openings, and the copy must never imply otherwise. Nothing
 * here may promise a salary, equity, a title, a start date, or a hiring process — none of those
 * exist, and a public page is exactly where an implied offer becomes something someone acts on.
 * The page says plainly that there is no formal process and routes people to the real /contact
 * form, which is the only commitment that can actually be honoured today.
 *
 * Each entry describes work the project genuinely needs, drawn from what is actually being
 * built (see BUILDING above) rather than from a generic startup roles list.
 */
export interface ContributionArea {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const CONTRIBUTION_AREAS: ContributionArea[] = [
  {
    icon: Code2,
    title: 'Engineering & AI',
    body: 'Build high-impact full-stack features with React & TypeScript, optimize sub-second vector search & syllabus retrieval pipelines, and craft real-time multimodal AI tutoring experiences.',
  },
  {
    icon: BookOpenCheck,
    title: 'Teaching & Subject Expertise',
    body: 'Shape curriculum intelligence, review syllabus blueprints, validate answer explanations against official commission standards, and guide students with authentic pedagogical insight.',
  },
  {
    icon: PenTool,
    title: 'Design & Product Experience',
    body: 'Craft frictionless, accessible, and distraction-free learning interfaces that turn dense mastery metrics and study schedules into intuitive, empowering student workflows.',
  },
  {
    icon: MessagesSquare,
    title: 'Student Champions & Feedback',
    body: 'Test real exam workflows, share fearless feedback, discover edge cases, and help co-create the exact study companion you and fellow aspirants need to succeed.',
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
