import {
  MessagesSquare, ClipboardCheck, Headphones, Users,
  Presentation, Sparkles, TrendingUp, Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * The public site's product taxonomy.
 */

export interface NavLeaf {
  label: string;
  href: string;
  /** One-line description, shown in the mega panel on wider screens. */
  desc: string;
}

export interface NavGroup {
  title: string;
  icon: LucideIcon;
  links: NavLeaf[];
}

export const PRODUCT_GROUPS: NavGroup[] = [
  {
    title: 'Learn & Understand',
    icon: MessagesSquare,
    links: [
      { label: 'AI Tutor', href: '/chat', desc: 'Cited answers with a visible reasoning trace' },
      { label: 'Live Voice Chat', href: '/chat?mode=voice', desc: 'Real-time spoken AI tutor with instant voice responses' },
      { label: 'Teacher Classrooms', href: '/my-classes', desc: 'Join free & paid classes by verified educators' },
      { label: 'Scan & Solve', href: '/chat', desc: 'Photograph a question, solve it step by step' },
      { label: 'Notebooks & Notes', href: '/notebooks', desc: 'Upload your PDFs or unlock teacher notes' },
    ],
  },
  {
    title: 'Practice & Assess',
    icon: ClipboardCheck,
    links: [
      { label: 'Mock Tests', href: '/tests', desc: 'Full-length papers on the real pattern' },
      { label: 'Baseline Assessment', href: '/baseline-assessment', desc: 'Adaptive placement in fewer questions' },
      { label: 'Teacher Assignments', href: '/my-classes', desc: 'Solve homework sets with automated grading' },
      { label: 'Analytics', href: '/analytics', desc: 'Where you gain and lose marks' },
    ],
  },
  {
    title: 'Create & Listen',
    icon: Headphones,
    links: [
      { label: 'Podcast Studio', href: '/podcasts', desc: 'Turn any topic into a two-voice explainer' },
      { label: 'Video Lessons & Lectures', href: '/video-lesson', desc: 'Generated lessons & class video archives' },
      { label: 'Research', href: '/research', desc: 'Deep dives with sources attached' },
      { label: 'Exclusive Resources', href: '/documents', desc: 'Teacher study guides, question banks & vault' },
    ],
  },
  {
    title: 'Community',
    icon: Users,
    links: [
      { label: 'Discussions', href: '/discussions', desc: 'Ask peers, answer others' },
      { label: 'Study Groups', href: '/groups', desc: 'Prepare alongside people on your exam' },
      { label: 'Leaderboard', href: '/leaderboard', desc: 'See where you stand' },
      { label: 'Help & Live Support', href: '/help', desc: '24/7 AI guide & real helpdesk agent support' },
      { label: 'Teach on Sadhya', href: '/for-teachers', desc: 'For teachers and institutions' },
    ],
  },
];

/** Dedicated Teacher Product Taxonomy — dynamically shown when browsing /for-teachers */
export const TEACHER_PRODUCT_GROUPS: NavGroup[] = [
  {
    title: 'Teaching & Live Classes',
    icon: Presentation,
    links: [
      { label: 'Classroom Hub', href: '/teach/classes', desc: 'Manage student cohorts, attendance & invites' },
      { label: 'Live Video Sessions', href: '/for-teachers', desc: 'Host real-time lectures with screen sharing' },
      { label: 'Doubts & Homework', href: '/doubts', desc: 'Review and resolve student question queues' },
      { label: 'Lecture Recordings', href: '/video-lesson', desc: 'Automated video archive for your students' },
    ],
  },
  {
    title: 'AI Content Studio',
    icon: Sparkles,
    links: [
      { label: 'Content Pipeline', href: '/content-pipeline', desc: 'Instant slides, worksheets & revision notes' },
      { label: 'Automation Studio', href: '/admin/automations', desc: 'Build closed-loop remedial DAG workflows' },
      { label: 'Test & Quiz Builder', href: '/tests', desc: 'Create custom exams with automated grading' },
      { label: 'Class Podcasts', href: '/podcasts', desc: 'Generate 2-voice audio review explainers' },
      { label: 'Curriculum Documents', href: '/documents', desc: 'Index and share verified study materials' },
    ],
  },
  {
    title: 'Analytics & Grading',
    icon: TrendingUp,
    links: [
      { label: 'Student Analytics', href: '/analytics', desc: 'Track where cohorts gain and lose marks' },
      { label: 'Baseline Placement', href: '/baseline-assessment', desc: 'Diagnose student baseline proficiency' },
      { label: 'Class Leaderboard', href: '/leaderboard', desc: 'Gamify class progress with peer rankings' },
      { label: 'Assessment Reports', href: '/assessment-report', desc: 'Export student performance summaries' },
    ],
  },
  {
    title: 'Earnings & Growth',
    icon: Wallet,
    links: [
      { label: 'Earnings & Payouts', href: '/teach/earnings', desc: 'Direct automated bank payouts via RazorpayX' },
      { label: 'Teacher Referrals', href: '/teach/referrals', desc: 'Earn recurring bonuses for educator invites' },
      { label: 'Educator Helpdesk', href: '/help', desc: '24/7 AI guidance & live specialist support' },
      { label: 'Teacher Community', href: '/discussions', desc: 'Collaborate with verified subject educators' },
    ],
  },
];

/** Top-level items for student context */
export const TOP_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'For teachers', href: '/for-teachers' },
  { label: 'Help', href: '/help' },
  { label: 'About', href: '/about' },
];

/** Top-level items for teacher context (linking back to 'For students') */
export const TEACHER_TOP_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'For students', href: '/' },
  { label: 'Help', href: '/help' },
  { label: 'About', href: '/about' },
];
