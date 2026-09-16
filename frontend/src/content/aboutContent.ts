/**
 * Copy for /about, shared by the page (src/pages/About.tsx) and the static HTML the SEO prerender writes
 * for crawlers (scripts/seo-prerender.ts). Plain strings only — no React, no icons — so it imports in Node.
 */

export const ABOUT_HEADLINE = 'Most students don’t need more content. They need someone to explain it.';

export const ABOUT_INTRO = [
  'There is no shortage of material for NEET, JEE, UPSC or a Class 12 board paper. There are more books, videos and question banks than anyone could work through in a decade. What’s scarce is someone patient enough to explain the same idea a third time, in the way that finally lands, at the exact level you’re at.',
  'That is the whole of what Sadhya is trying to be — and the reason it insists on showing you where every answer came from.',
] as const;

export const ABOUT_PRINCIPLES = [
  {
    title: 'Show the working',
    body: 'Every answer carries the sources it was built from and the six steps taken to reach it. If a student can’t check the reasoning, they’re being asked to trust a black box — which is exactly the habit an exam punishes.',
  },
  {
    title: 'Built for a specific syllabus',
    body: 'An answer grounded in a generic large model is dangerous in an exam where negative marking applies. Answers here are built against the official syllabus for your exam, and against its previous papers and textbooks wherever those have been indexed.',
  },
  {
    title: 'Adaptive, not uniform',
    body: 'Two students preparing for the same exam have different gaps. The baseline assessment, revision cycles and mock tests adjust to where you are, not where an imaginary average student would be.',
  },
  {
    title: 'Say only what’s true',
    body: 'No invented success rates, no stock-photo testimonials, no features listed before they work. When something is still being built, this site says so — including on this page.',
  },
] as const;
