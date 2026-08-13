import {
  MessagesSquare, ClipboardCheck, Headphones, Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The public site's product taxonomy.
 *
 * Every entry points at a route that exists in App.tsx and is backed by a router
 * mounted in backend-firestore/src/routes/index.ts. Deliberately excluded:
 *
 *   · Flashcards   — no /flashcards router is mounted; the page is unwired.
 *   · Explore      — renders `mockAssets`, not live data.
 *   · AI Workspace — renders mock data.
 *
 * These links target protected app routes. That is intentional: ProtectedRoute sends a
 * signed-out visitor to /signin with `state.from` set, so they land on the feature they
 * clicked once they authenticate, and signed-in visitors go straight there.
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
      { label: 'Scan & Solve', href: '/chat', desc: 'Photograph a question, solve it step by step' },
      { label: 'Notebooks', href: '/notebooks', desc: 'Upload your PDFs and ask across them' },
      { label: 'My Doubts', href: '/doubts', desc: 'Park a question, return to it later' },
    ],
  },
  {
    title: 'Practice & Assess',
    icon: ClipboardCheck,
    links: [
      { label: 'Mock Tests', href: '/tests', desc: 'Full-length papers on the real pattern' },
      { label: 'Baseline Assessment', href: '/baseline-assessment', desc: 'Adaptive placement in fewer questions' },
      { label: 'Analytics', href: '/analytics', desc: 'Where you gain and lose marks' },
      { label: 'Study Planner', href: '/planner', desc: 'A schedule built around your exam date' },
    ],
  },
  {
    title: 'Create & Listen',
    icon: Headphones,
    links: [
      { label: 'Podcast Studio', href: '/podcasts', desc: 'Turn any topic into a two-voice explainer' },
      { label: 'Video Lessons', href: '/video-lesson', desc: 'Generated visual walkthroughs' },
      { label: 'Research', href: '/research', desc: 'Deep dives with sources attached' },
      { label: 'Documents', href: '/documents', desc: 'Your library, indexed and searchable' },
    ],
  },
  {
    title: 'Community',
    icon: Users,
    links: [
      { label: 'Discussions', href: '/discussions', desc: 'Ask peers, answer others' },
      { label: 'Study Groups', href: '/groups', desc: 'Prepare alongside people on your exam' },
      { label: 'Leaderboard', href: '/leaderboard', desc: 'See where you stand' },
      { label: 'Teach on Scholarly', href: '/for-teachers', desc: 'For teachers and institutions' },
    ],
  },
];

/** Top-level items to the right of the Product mega menu. */
export const TOP_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'For teachers', href: '/for-teachers' },
  { label: 'About', href: '/about' },
];
