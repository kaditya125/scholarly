import {
  MessagesSquare, NotebookPen, Camera, ListChecks, Headphones, ClipboardCheck,
  UserRound, Users, LayoutGrid, Sparkles, Share2, BarChart3,
  type LucideIcon,
} from 'lucide-react';

/**
 * Content for /for-teachers, separated from presentation so that every claim on the page can
 * be audited in one file against the code that backs it.
 *
 * ── THE RULE FOR THIS FILE ────────────────────────────────────────────────────────────────
 * Nothing gets `status: 'available'` unless a route is mounted in
 * backend-firestore/src/routes/index.ts AND a real (non-mock) page renders it. Everything
 * else is 'building' (code exists but is a placeholder / partially wired) or 'next'
 * (no implementation exists at all).
 *
 * Verified 2026-08-12 against the working tree:
 *   ✅ mounted + real UI : chat, notebooks(+graph,+assets), scan, quiz, questions, tests,
 *                          baseline-assessment, podcasts, documents, discussions,
 *                          study-groups, connections, teacher(profile)
 *   🟡 partial           : /teach is now a real workspace shell (Phase 3C) exposing the shared
 *                          tools, verification state and server-derived capabilities — but the
 *                          class/student/earnings sections it navigates to do not exist yet.
 *   🔴 no code at all    : classes, classMembers, enrollment, referral, entitlements,
 *                          capabilities, teacherContext, AUTHORING mode,
 *                          GET /teacher/profile/:uid (public discovery)
 *
 * Do not promote an item here without re-checking those two things.
 */

export type FeatureStatus = 'available' | 'building' | 'next';

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  available: 'Available now',
  building: 'Being built',
  next: 'Coming next',
};

export interface Capability {
  icon: LucideIcon;
  title: string;
  body: string;
  status: FeatureStatus;
  /** Where this lives in the product today, when it exists. */
  href?: string;
}

/* ── Section: the problem ─────────────────────────────────────────────────────────────── */

export const PROBLEMS = [
  {
    title: 'The same preparation, every year',
    body: 'Explanations, worked examples, practice sets, revision sheets. You have written them before — probably several times — and they are scattered across drives, notebooks and old printouts.',
  },
  {
    title: 'One explanation, thirty different students',
    body: 'The version that lands for the strongest student in the room loses the one who is still shaky on last term’s prerequisite. Writing both takes twice the time you have.',
  },
  {
    title: 'Your material is everywhere except one place',
    body: 'Chapter PDFs, question papers, your own notes, links you meant to keep. Finding the right thing takes longer than using it.',
  },
  {
    title: 'A generic chatbot starts from zero, every time',
    body: 'It does not know your board, your class, the exam you are preparing them for, or how you like to explain. So you spend the first half of every prompt re-establishing context you have already typed a hundred times.',
  },
];

/* ── Section: what you get ────────────────────────────────────────────────────────────── */

export const CAPABILITIES: Capability[] = [
  {
    icon: MessagesSquare,
    title: 'An AI you can draft with',
    body: 'Ask for an explanation, a worked example, an analogy or a counter-example. Every answer shows the sources it used and the steps it took, so you can check it before it reaches a student.',
    status: 'available',
    href: '/chat',
  },
  {
    icon: NotebookPen,
    title: 'Your material, indexed',
    body: 'Put your chapter PDFs, notes and past papers into a notebook. Scholarly extracts the text, maps how the concepts connect, and answers from your material — citing the page it came from.',
    status: 'available',
    href: '/notebooks',
  },
  {
    icon: Camera,
    title: 'Scan a question',
    body: 'Photograph a problem from any book or paper. Scholarly reads it, works out which chapter it belongs to, and works through it step by step.',
    status: 'available',
    href: '/chat',
  },
  {
    icon: ListChecks,
    title: 'Practice sets and papers',
    body: 'Generate questions on a topic, or full-length mock tests on the real exam pattern, with the analytics that come from them.',
    status: 'available',
    href: '/tests',
  },
  {
    icon: Headphones,
    title: 'Audio explainers',
    body: 'Turn a topic or a whole notebook into a two-voice audio explainer — storytelling, documentary, interview or narration — for students who revise on the move.',
    status: 'available',
    href: '/podcasts',
  },
  {
    icon: ClipboardCheck,
    title: 'Find a student’s real level',
    body: 'An adaptive baseline assessment that gets harder or easier as it goes, placing a learner in far fewer questions than a fixed test would need.',
    status: 'available',
    href: '/baseline-assessment',
  },
  {
    icon: UserRound,
    title: 'A teaching profile',
    body: 'Tell Scholarly what you teach, which boards and classes, which exams you prepare students for, and how you like to explain. Set up once, kept on your account.',
    status: 'available',
    href: '/teacher/onboarding',
  },
  {
    icon: Users,
    title: 'Connect with other people on Scholarly',
    body: 'Send a connection request, accept or decline one, follow someone, or block them. A real two-sided handshake — nobody is added to your network without agreeing to it.',
    status: 'available',
    href: '/people',
  },
  {
    icon: LayoutGrid,
    title: 'A teacher workspace',
    body: 'Today /teach shows your profile, your verification status and links into the tools above. The workspace that pulls your drafts, classes and material into one surface is the next thing being built.',
    status: 'building',
  },
  {
    icon: Sparkles,
    title: 'AI that knows how you teach',
    body: 'Your teaching profile is collected and stored today, but the AI does not read it yet — it still answers as a tutor rather than as your drafting assistant. Wiring that context in is active work.',
    status: 'building',
  },
  {
    icon: Share2,
    title: 'Classes, and sharing to them',
    body: 'You can now create a class in your workspace — title, subject, board, syllabus, schedule and price — and publish it. What does not exist yet is the half that involves students: inviting them, having them accept, and sharing material to a class. Creating is real; enrolling is not.',
    status: 'building',
  },
  {
    icon: BarChart3,
    title: 'Class-scoped progress',
    body: 'Seeing how the students in one of your classes are actually doing. This depends on classes existing first, and on a consent handshake that has to come before any data does.',
    status: 'next',
  },
];

/* ── Section: the journey ─────────────────────────────────────────────────────────────── */

/**
 * What actually happens from signup onwards.
 *
 * Steps 1–4 are the real, shipped flow. Steps 5–6 describe things that do not exist, and say
 * so in the copy rather than only in the pill — a teacher deciding where to put their
 * preparation time should not have to read a badge to learn that classes aren't built.
 *
 * Step 3 reflects the interim auto-approval policy (INITIAL_TEACHER_STATUS in
 * backend-firestore/src/services/teacherProfile.service.ts). If that reverts to 'pending'
 * when a real review process ships, this step must be rewritten in the same commit.
 */
export const JOURNEY: {
  step: string;
  title: string;
  time?: string;
  body: string;
  status: FeatureStatus;
}[] = [
  {
    step: '01',
    title: 'Create your account',
    time: 'about 2 minutes',
    body: 'Choose “I’m a teacher”, then sign in with Google, GitHub or an email address. One account holds one role — a teacher account cannot later be switched to a student one without contacting support, so it is worth picking deliberately.',
    status: 'available',
  },
  {
    step: '02',
    title: 'Tell Scholarly what you teach',
    time: 'about 3 minutes',
    body: 'Eight short steps: your subjects, the classes you take, the boards you follow, the exams you prepare students for, the languages you teach in, and how you like to explain. You can edit any of it later. We do not ask for your address, your availability or your certificates.',
    status: 'available',
  },
  {
    step: '03',
    title: 'Your profile goes forward for review',
    body: 'Your account is created immediately and you get the full platform from the first minute — verification does not gate the AI, your notebooks or anything you use to prepare. It applies to teaching-specific capabilities, which are still being built. We do not publish a turnaround time we cannot yet stand behind.',
    status: 'available',
  },
  {
    step: '04',
    title: 'Start preparing',
    body: 'Draft explanations with the AI, put your own PDFs and notes into notebooks, generate practice sets and mock papers, and turn a chapter into an audio explainer. This is the part that works today, and it is the reason to sign up now.',
    status: 'available',
  },
  {
    step: '05',
    title: 'Teach your own students here',
    body: 'Creating a class, inviting students, sharing your notes with just that group, setting a class test and seeing how they did. None of this is built yet. The material you make today will still be here when it is — but today you cannot deliver it to a student through Scholarly.',
    status: 'next',
  },
  {
    step: '06',
    title: 'Earning from your teaching',
    body: 'Not available, and we are not going to imply otherwise. Paying teachers means bank verification, tax handling and payout infrastructure that we have not built. Until that exists, Scholarly is a tool that saves you preparation time — not a source of income.',
    status: 'next',
  },
];

/* ── Section: AI copilot workflow ─────────────────────────────────────────────────────── */

export const COPILOT_STEPS = [
  { n: '01', title: 'You ask', body: 'In your words. “Explain this for a Class 9 group that has just met vectors.”' },
  { n: '02', title: 'It reads the request', body: 'Intent, the concept, and what kind of output you actually want — an explanation, a question set, a summary.' },
  { n: '03', title: 'It retrieves', body: 'Semantic search across indexed curriculum and any notebooks you have added, reranked so prescribed texts outrank a stray page.' },
  { n: '04', title: 'It drafts', body: 'Composed from the retrieved passages, then each claim checked back against them before it reaches you.' },
  { n: '05', title: 'You review', body: 'With the sources and the reasoning steps visible, so you are checking work rather than trusting a paragraph.' },
  { n: '06', title: 'You use it', body: 'Keep it, rework it, put it in a notebook, or turn it into an audio explainer.' },
];

/** Prompts that map to a workflow the platform can genuinely run today. */
export const EXAMPLE_PROMPTS = [
  { text: 'Explain Newton’s third law for a Class 9 group that has just met vectors.', via: 'AI chat' },
  { text: 'Make 10 questions on this chapter, hardest last.', via: 'Question generation' },
  { text: 'Give me three real-world examples I can use in class tomorrow.', via: 'AI chat' },
  { text: 'Turn this chapter PDF into a revision sheet.', via: 'Notebooks' },
  { text: 'Make a 12-minute audio explainer on electrostatics.', via: 'Podcast studio' },
];

/* ── Section: teaching context ────────────────────────────────────────────────────────── */

/**
 * The literal fields of TeacherProfile (backend-firestore/src/types/teacher.ts) collected by
 * the eight-step wizard. Not an invented list — if a field is not here, the product does not
 * ask for it. Location, availability and qualifications are deliberately not collected.
 */
export const PROFILE_FIELDS: { label: string; value: string }[] = [
  { label: 'Subjects', value: 'Physics · Chemistry' },
  { label: 'Classes taught', value: 'Class 11 · Class 12' },
  { label: 'Boards', value: 'CBSE · ICSE' },
  { label: 'Exams', value: 'NEET · JEE Main' },
  { label: 'Languages', value: 'English · Hindi' },
  { label: 'Teaching style', value: 'Concept-first' },
  { label: 'Experience', value: '8 years' },
  { label: 'Profile visibility', value: 'Private' },
];

/* ── Section: a day with Scholarly ────────────────────────────────────────────────────── */

export const DAY = [
  { when: 'Before class', what: 'Draft the explanation you are going to open with, and two examples you can fall back on.', tool: 'AI chat' },
  { when: 'In the room', what: 'A student is not following. Ask for the same idea a different way, without breaking your flow.', tool: 'AI chat' },
  { when: 'After the bell', what: 'Turn the chapter you just taught into a revision sheet, or a short audio explainer for the bus home.', tool: 'Notebooks · Podcasts' },
  { when: 'Setting work', what: 'Generate a practice set on today’s topic with the difficulty rising through it.', tool: 'Questions · Tests' },
  { when: 'Over the weekend', what: 'Put next term’s papers and notes into a notebook so they are searchable when you need them.', tool: 'Notebooks' },
];

/* ── Section: comparison ──────────────────────────────────────────────────────────────── */

export const COMPARISON: { generic: string; scholarly: string }[] = [
  { generic: 'A conversation that ends when you close the tab', scholarly: 'Material you keep, in notebooks you build up' },
  { generic: 'Answers from whatever it was trained on', scholarly: 'Answers retrieved from curriculum and your own uploads, cited' },
  { generic: 'A paragraph you have to take on trust', scholarly: 'The sources and the reasoning steps shown alongside' },
  { generic: 'You re-explain your context in every prompt', scholarly: 'A teaching profile you set once' },
  { generic: 'Separate tools for text, questions, audio', scholarly: 'One place where the same material becomes all three' },
  { generic: 'Built for anyone, about anything', scholarly: 'Built around Indian boards and competitive exams' },
];

/* ── Section: FAQ ─────────────────────────────────────────────────────────────────────── */

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is Scholarly only for students?',
    a: 'No. Scholarly is one platform gated by capability rather than split into a student product and a teacher product. A teacher account gets the whole platform — the AI, notebooks, practice, podcasts — plus a teaching profile, and the teacher-specific surfaces are being added on top of that rather than beside it.',
  },
  {
    q: 'Do I have to be a school teacher?',
    a: 'No. The profile asks what you teach, which classes and boards, and which exams you prepare people for — a coaching-centre teacher, a private tutor or a subject specialist all fit that. There is no institutional check and no document upload today.',
  },
  {
    q: 'Can I use one account as both a teacher and a student?',
    a: 'No. An account holds exactly one product role, it is set when you sign up, and the server refuses to change it — signing up again with the same email returns a conflict rather than creating a second account. Changing it needs support. Pick the one that fits before you create the account.',
  },
  {
    q: 'Can teachers see students’ data?',
    a: 'No — and this is structural, not a setting. Being a teacher grants access to nobody. There is no endpoint that lists students and no way to look one up. When classes arrive, visibility will come only from a relationship the student actively accepted, scoped to that class, and it ends the moment they leave.',
  },
  {
    q: 'Can I invite other teachers?',
    a: 'You can connect with anyone on Scholarly today — send a request, they accept or decline, either side can block. A teacher-specific referral programme with benefits attached is specified but not built, so there is nothing to claim or earn yet.',
  },
  {
    q: 'Is the AI here to replace teachers?',
    a: 'No, and the product is not built that way. It drafts, retrieves and reformats — the repetitive half of preparation. Nothing it produces reaches a student unless you decide it should. You review every output, with its sources visible.',
  },
  {
    q: 'What can I actually make today?',
    a: 'Explanations and worked examples, practice questions and full mock tests, revision material from your own PDFs, and two-voice audio explainers. All of that works now. What you cannot yet do is create a class, enrol students, or share material to a group.',
  },
  {
    q: 'Is there a teacher dashboard?',
    a: 'Partly. Signing up as a teacher gives you onboarding, a stored teaching profile, and a /teach page with your account state and links into the tools. It is honestly a starting point rather than a workspace — the fuller one is what is being built now.',
  },
  {
    q: 'Is there a verification process I have to pass?',
    a: 'There is a review, and your account enters it when you finish your profile. It does not hold you up: you get the full platform straight away, and verification applies only to teaching-specific capabilities — creating classes, taking on students — which are still being built. We are not publishing a turnaround time until we can stand behind one.',
  },
  {
    q: 'Can I earn money from teaching on Scholarly?',
    a: 'No, and we would rather be blunt than vague. Paying teachers requires bank verification, tax handling and payout infrastructure that we have not built and have not committed to a date for. Scholarly today is a tool that cuts your preparation time — treat it as that, not as an income stream. If that changes, it will be announced clearly rather than buried in a pricing page.',
  },
];

/* ── Section: status board ────────────────────────────────────────────────────────────── */

export const STATUS_BOARD: Record<FeatureStatus, string[]> = {
  available: [
    'AI chat with citations and a visible reasoning trace',
    'Notebooks — upload, index and query your own material',
    'Scan a question from a book or paper',
    'Question, quiz and mock-test generation',
    'Adaptive baseline assessment',
    'Two-voice audio explainers',
    'Teacher signup, onboarding and teaching profile',
    'Full platform access from signup, while verification is pending',
    'Peer connections with accept / decline / block',
    'Discussions and study groups',
  ],
  building: [
    'The teacher workspace at /teach — dashboard and classes are live',
    'Creating and publishing a class (students cannot join one yet)',
    'AI that reads your teaching profile when it drafts',
    'A public teacher profile students can find you by',
  ],
  next: [
    'Student invitations and enrolment, with consent on both sides',
    'Sharing material to a class only',
    'Class-scoped progress for your students',
    'Teacher-to-teacher referral benefits',
    'Any way for teachers to earn money on the platform',
  ],
};
