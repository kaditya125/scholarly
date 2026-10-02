/**
 * GoalRouter — decides whether a message is a question (Chat mode) or a goal (Agent mode).
 *
 * Deterministic by design, like pyqQueryParser: the routing decision should not itself be a
 * model's opinion that drifts between runs, and most messages are unambiguous ("what is
 * osmosis?" vs "make me flashcards on osmosis"). A cheap-model tie-breaker for the ambiguous tail
 * can be added later behind a flag; the student can always override the choice either way.
 *
 * A goal only routes to Agent mode when a workflow that can actually do it exists. Otherwise the
 * decision says so (`agentCandidate`), and the caller answers in chat mode with an honest note.
 */

export type AgentIntent =
  | 'ANSWER'
  | 'EXPLAIN'
  | 'SEARCH'
  | 'CREATE_ARTIFACT'
  | 'PRACTICE'
  | 'TEST'
  | 'STUDY_PLAN'
  | 'ANALYZE'
  | 'SUMMARIZE'
  | 'TRANSFORM'
  | 'RESEARCH'
  | 'REVISE'
  | 'COMPARE'
  | 'TRACK_PROGRESS'
  | 'EXAM_OVERVIEW'
  | 'CHAPTER_BRIEFING'
  | 'CHAPTER_HANDOUT'
  | 'FORMULA_CHART'
  | 'FLASHCARDS_FROM_ARTIFACT'
  | 'QUIZ_FROM_ARTIFACT'
  | 'WEAK_AREA_QUIZ'
  | 'QUIZ_MISTAKES'
  | 'TESTS_ANALYSIS'
  | 'REVISION_PLAN'
  | 'QUESTION_SET'
  | 'DOCUMENT_STUDY_PACK'
  | 'PYQ_PRACTICE'
  | 'CHAPTER_NOTES'
  | 'MOCK_TEST'
  | 'PERSONAL_PREP'
  | 'MULTI_STEP_GOAL';

export interface RouteDecision {
  mode: 'chat' | 'agent';
  intent: AgentIntent;
  /** The workflow to run when mode is 'agent'. */
  workflowId?: string;
  /** True when the message is a goal an agent should do, whether or not a workflow exists yet. */
  agentCandidate: boolean;
  confidence: number;
  reason: string;
}

const AGENTIC_INTENTS: ReadonlySet<AgentIntent> = new Set<AgentIntent>([
  'CREATE_ARTIFACT', 'PRACTICE', 'TEST', 'STUDY_PLAN', 'ANALYZE', 'TRACK_PROGRESS', 'EXAM_OVERVIEW',
  'CHAPTER_BRIEFING', 'CHAPTER_HANDOUT', 'FORMULA_CHART', 'FLASHCARDS_FROM_ARTIFACT', 'QUIZ_FROM_ARTIFACT', 'WEAK_AREA_QUIZ',
  'QUIZ_MISTAKES', 'TESTS_ANALYSIS', 'REVISION_PLAN', 'QUESTION_SET', 'DOCUMENT_STUDY_PACK', 'PYQ_PRACTICE', 'CHAPTER_NOTES', 'MOCK_TEST', 'PERSONAL_PREP', 'MULTI_STEP_GOAL',
]);

/** Intent → workflow that can fulfil it. Grows phase by phase. */
const INTENT_WORKFLOWS: Partial<Record<AgentIntent, string>> = {
  EXAM_OVERVIEW: 'exam_overview',
  CHAPTER_BRIEFING: 'chapter_briefing',
  CHAPTER_HANDOUT: 'chapter_handout',
  FORMULA_CHART: 'formula_chart',
  FLASHCARDS_FROM_ARTIFACT: 'flashcards_from_artifact',
  QUIZ_FROM_ARTIFACT: 'quiz_from_artifact',
  WEAK_AREA_QUIZ: 'weak_area_quiz',
  QUIZ_MISTAKES: 'quiz_mistake_analysis',
  TESTS_ANALYSIS: 'tests_analysis',
  REVISION_PLAN: 'revision_plan',
  QUESTION_SET: 'question_set',
  DOCUMENT_STUDY_PACK: 'document_study_pack',
  PYQ_PRACTICE: 'pyq_practice',
  CHAPTER_NOTES: 'chapter_revision_notes',
  MOCK_TEST: 'mock_test',
  PERSONAL_PREP: 'exam_prep',
};

const EXAM_WORDS =
  /\b(ssc|cgl|chsl|upsc|ias|cse|bpsc|jee|neet|cuet|gate|ugc[\s-]*net|net|ibps|sbi|rrb|ntpc|ctet|tet|nda|cds|cat|clat|exam|examination)\b/i;
const CREATE_VERBS = /\b(create|make|prepare|generate|build|design|draft|compile|produce|give me|get me)\b/i;
const ARTIFACT_NOUNS =
  /\b(formula\s*(chart|sheet)|cheat\s*sheet|revision\s*(notes|sheet|package)|notes|flash\s*cards?|mind\s*map|concept\s*map|summary\s*sheet|worksheet|pdf|handout)\b/i;
// "30 NEET Biology questions" counts too: words may sit between the number and "questions".
const TEST_NOUNS = /\b(mock\s*test|practice\s*test|test\s*paper|question\s*paper|quiz)\b|\b\d{1,3}\b[^.?!]{0,40}\b(questions?|mcqs?)\b/i;
const PLAN_PATTERNS =
  /\b(study\s*plan|time\s*table|timetable|revision\s*plan|schedule|prepare\s+me\s+for|plan\s+my|in\s+\d+\s+(days|weeks)|next\s+\d+\s+(days|weeks)|study\s+with\s+me)\b/i;
const ANALYZE_PATTERNS =
  /\b(analy[sz]e|review|assess)\b.*\b(my|last|past|previous)\b.*\b(tests?|attempts?|mistakes?|performance|results?)\b|\bweak\s+(areas?|topics?|spots?)\b/i;
const PROGRESS_PATTERNS = /\b(my\s+progress|how\s+am\s+i\s+doing|track\s+my)\b/i;
const OVERVIEW_PATTERNS =
  /\b(overview|pattern|syllabus|structure|weightage|high[\s-]*yield\s+topics|most\s+(asked|tested|important)\s+topics|exam\s+analysis)\b/i;
const QUESTION_START = /^\s*(what|why|how|explain|define|who|when|where|which|is|are|does|do|can|could|tell me)\b/i;
// A curriculum chapter is named by class/board plus a topic ("Laws of Motion, Class 11 Physics").
const CLASS_WORDS = /\b(class|grade|std|standard)\s*\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)\s+(class|grade|standard)\b|\bncert\b/i;
const CHAPTER_WORDS = /\b(chapter|lesson|unit)\b/i;
const BRIEF_VERBS = /\b(brief|briefing|overview|walk me through|what'?s in|tell me about|go over|introduce)\b/i;
// A printable document about a whole chapter. Formula charts, flashcards and notes are separate
// artifacts with their own (later) workflows, so they are excluded here.
const HANDOUT_NOUNS = /\b(pdf|handout|printable|one[\s-]?pager)\b/i;
const OTHER_ARTIFACTS = /\b(formula|flash\s*cards?|mind\s*map|concept\s*map|notes|cheat\s*sheet|worksheet|summary\s*sheet)\b/i;
// "formula chart", "formula sheet", "all the formulae of …".
const FORMULA_CHART = /\bformula[es]*\s*(chart|sheet|list|table)\b|\b(all|key|important)\s+(the\s+)?formula[es]*\b/i;
// Something made from an artifact the student already has: "flashcards from this formula chart".
const FLASHCARDS = /\bflash\s*cards?\b/i;
const FROM_EXISTING = /\b(from|of|using|out of)\s+(this|that|the|my|it)\b(\s+(formula\s*)?(chart|sheet|pdf|handout|document))?|\bfrom it\b/i;
// Phase 6. A quiz or question set: "quiz", "20-question", "30 NEET Biology questions".
const QUIZ_NOUNS = /\bquiz(zes)?\b|\b\d{1,3}\b[^.?!]{0,40}\b(questions?|mcqs?)\b/i;
// Made from something the student already has — narrower than FROM_EXISTING, so "questions from
// the Laws of Motion chapter" is a new question set, not a quiz from their chart.
const FROM_OWN_ARTIFACT =
  /\b(from|of|using|out of|based on)\s+(this|that|it|my)\b(\s+(formula\s*)?(chart|sheet|pdf|handout|document|flash\s*cards?|deck|notes))?|\bfrom\s+(the|my|this|that)\s+(formula\s*)?(chart|sheet|flash\s*cards?|deck)\b|\bfrom it\b/i;
const ANALYZE_VERBS = /\b(analy[sz]e|analysis|review|assess|evaluate|diagnose|go through)\b/i;
const HISTORY_REF =
  /\b(last|past|previous|recent)\s+(\d{1,2}\s+|[a-z]+\s+)?(tests?|quizz?e?s?|attempts?|mocks?|papers?|exams?)\b|\bmy\s+(tests|test\s+results|results|performance|scores)\b/i;
const MISTAKES = /\bmistakes?\b|\bwrong\s+answers?\b|\bgot\s+wrong\b|\bwhat\s+should\s+i\s+revise\b/i;
const WEAK_AREAS = /\bweak(er)?\s+(areas?|topics?|spots?|points?)\b/i;
const QUIZ_ME = /\b(quiz|drill|test)\s+me\b/i;
// Past-year questions: "PYQs", "previous year questions", "past papers", "solved papers".
const PYQ_WORDS = /\bpyqs?\b|\bprevious[\s-]*years?\b|\bpast[\s-]*(years?[\s-]*)?(papers?|questions?)\b|\bsolved\s+papers?\b/i;
// "my uploaded PDF", "the attached document" — the student's own file, not something Sadhya made.
const UPLOADED_DOC = /\b(uploaded|attached)\s+(pdf|document|file|notes|chapter)\b|\bmy\s+(uploaded\s+)?(pdf|document|file)\b/i;
const STUDY_VERBS = /\b(read|study|summari[sz]e|revise)\b/i;
// A whole mock paper is a blueprint-driven test (its own workflow), not a question set on a topic.
const MOCK_TEST = /\bmocks?(\s*tests?)?\b|\bfull[\s-]*length\b|\bmodel\s+papers?\b|\bsample\s+papers?\b/i;
// Notes on a chapter: "revision notes on Laws of Motion", "short notes for Photosynthesis".
const CHAPTER_NOTES_WORDS = /\b((revision|short|study|chapter)\s+)?notes\b/i;
const REVISION_PLAN = /\b(revision|revise)\b[^.?!]*\bplan\b|\bplan\b[^.?!]*\b(revision|revise)\b|\brevision\s+(schedule|timetable)\b/i;
// Preparing for a whole exam (Phase 7): "Prepare me for SSC CGL in 90 days", "Study with me for the
// next 30 days", "Make a study plan for JEE Main".
const PERSONAL_PREP =
  /\b(prepare|get)\s+me\s+(ready\s+)?for\b|\bhelp\s+me\s+(prepare|get\s+ready)\s+for\b|\bstudy\s+with\s+me\b|\b(study|preparation|prep)\s+plan\b|\bplan\s+my\s+(preparation|prep|studies)\b/i;

export function routeGoal(message: string, opts: { explicitAgent?: boolean; hasDocument?: boolean } = {}): RouteDecision {
  const text = String(message || '').trim();
  const explicit = Boolean(opts.explicitAgent);
  const hasDocument = Boolean(opts.hasDocument);

  const decide = (intent: AgentIntent, confidence: number, reason: string): RouteDecision => {
    const agentCandidate = AGENTIC_INTENTS.has(intent) || (explicit && intent === 'MULTI_STEP_GOAL');
    const workflowId = INTENT_WORKFLOWS[intent];
    if (agentCandidate && workflowId) {
      return { mode: 'agent', intent, workflowId, agentCandidate, confidence, reason };
    }
    return {
      mode: 'chat',
      intent,
      agentCandidate,
      confidence,
      reason: agentCandidate ? `${reason}; no agent workflow can do this yet` : reason,
    };
  };

  if (!text) return decide('ANSWER', 1, 'empty message');

  // Order matters: specific goal shapes before generic question shapes.
  if (EXAM_WORDS.test(text) && OVERVIEW_PATTERNS.test(text) && !ARTIFACT_NOUNS.test(text) && !TEST_NOUNS.test(text)) {
    // "What is the SSC CGL syllabus?" is a question a student may want answered in chat; only route
    // it to the agent when the student chose Agent mode or phrased it as a request.
    if (explicit || CREATE_VERBS.test(text) || /\b(overview|analysis|analy[sz]e)\b/i.test(text)) {
      return decide('EXAM_OVERVIEW', 0.8, 'asks for an exam overview');
    }
    return decide('SEARCH', 0.6, 'asks about an exam syllabus or pattern');
  }
  // The student's own document — attached to this turn, or named as their upload: notes, cards
  // and quizzes are written from it (golden case 4).
  if ((hasDocument || UPLOADED_DOC.test(text)) && (ARTIFACT_NOUNS.test(text) || QUIZ_NOUNS.test(text) || STUDY_VERBS.test(text))) {
    return decide('DOCUMENT_STUDY_PACK', 0.85, 'asks for study material from their own document');
  }
  // Flashcards from something the student already made: reuse it, don't rebuild it.
  if (FLASHCARDS.test(text) && FROM_EXISTING.test(text)) {
    return decide('FLASHCARDS_FROM_ARTIFACT', 0.85, 'asks for flashcards from an existing document');
  }
  // Phase 6 — the rest of the learning loop, most specific first.
  if (QUIZ_NOUNS.test(text) && FROM_OWN_ARTIFACT.test(text) && !ANALYZE_VERBS.test(text) && !MISTAKES.test(text)) {
    return decide('QUIZ_FROM_ARTIFACT', 0.85, 'asks for a quiz from an existing document');
  }
  if ((QUIZ_ME.test(text) || (CREATE_VERBS.test(text) && QUIZ_NOUNS.test(text))) && WEAK_AREAS.test(text)) {
    return decide('WEAK_AREA_QUIZ', 0.85, 'asks for a quiz on their weak areas');
  }
  if (ANALYZE_VERBS.test(text) || MISTAKES.test(text) || WEAK_AREAS.test(text)) {
    if (HISTORY_REF.test(text)) return decide('TESTS_ANALYSIS', 0.85, 'asks to analyse recent tests');
    if (MISTAKES.test(text)) return decide('QUIZ_MISTAKES', 0.85, 'asks what went wrong in a quiz');
    if (REVISION_PLAN.test(text)) return decide('REVISION_PLAN', 0.85, 'asks for a revision plan for weak areas');
    if (WEAK_AREAS.test(text) && !CREATE_VERBS.test(text)) return decide('TESTS_ANALYSIS', 0.8, 'asks about weak areas');
  }
  // A whole real paper taken as a mock: "JEE Main mock test", "a full-length mock for NEET".
  if (MOCK_TEST.test(text) && (CREATE_VERBS.test(text) || explicit || /\b(take|start|attempt|practi[cs]e|want|need)\b/i.test(text))) {
    return decide('MOCK_TEST', 0.85, 'asks for a mock test');
  }
  // Real past papers: "Give me JEE Main 2023 Physics PYQs", "previous year questions on optics".
  if (PYQ_WORDS.test(text) && !MOCK_TEST.test(text) && (CREATE_VERBS.test(text) || /\b(practi[cs]e|quiz\s+me|show|solve|want|need)\b/i.test(text) || QUIZ_NOUNS.test(text))) {
    return decide('PYQ_PRACTICE', 0.85, 'asks for past-year questions');
  }
  // A question set on a topic: "Create 30 NEET Biology questions from Cell Structure".
  if (CREATE_VERBS.test(text) && QUIZ_NOUNS.test(text) && !MOCK_TEST.test(text) && !FROM_OWN_ARTIFACT.test(text)) {
    return decide('QUESTION_SET', 0.8, 'asks for a question set on a topic');
  }
  // Preparing for a whole exam — named, or the student's saved one ("study with me…"). A chapter
  // or class is a narrower job, left to the chapter workflows.
  if (
    (PERSONAL_PREP.test(text) || (REVISION_PLAN.test(text) && EXAM_WORDS.test(text))) &&
    !CHAPTER_WORDS.test(text) &&
    !CLASS_WORDS.test(text) &&
    (EXAM_WORDS.test(text) || /\bstudy\s+with\s+me\b/i.test(text) || explicit)
  ) {
    return decide('PERSONAL_PREP', 0.85, 'asks to be prepared for an exam');
  }
  // "Create a revision plan" with no exam named (a whole-exam plan is the personal agent above).
  if (REVISION_PLAN.test(text) && !EXAM_WORDS.test(text) && !/\bprepare\s+me\s+for\b/i.test(text)) {
    return decide('REVISION_PLAN', 0.8, 'asks for a revision plan');
  }
  // Notes on a curriculum chapter (the student's own document went to the study pack above). A
  // whole exam syllabus is not a chapter, and flashcards, formula charts and quizzes have their own.
  if (
    CHAPTER_NOTES_WORDS.test(text) &&
    (CREATE_VERBS.test(text) || explicit || /\b(write|want|need)\b/i.test(text)) &&
    !FLASHCARDS.test(text) &&
    !FORMULA_CHART.test(text) &&
    !QUIZ_NOUNS.test(text) &&
    !FROM_OWN_ARTIFACT.test(text) &&
    !(EXAM_WORDS.test(text) && /\bsyllabus\b/i.test(text))
  ) {
    return decide('CHAPTER_NOTES', 0.8, 'asks for revision notes on a chapter');
  }
  // The flagship: a verified formula chart for a chapter.
  if (FORMULA_CHART.test(text) && (CREATE_VERBS.test(text) || explicit || /\b(chart|sheet)\b/i.test(text)) && !TEST_NOUNS.test(text)) {
    return decide('FORMULA_CHART', 0.85, 'asks for a formula chart');
  }
  // A printable handout of a named chapter ("Make a PDF on Laws of Motion, Class 11 Physics").
  if (CLASS_WORDS.test(text) && CREATE_VERBS.test(text) && HANDOUT_NOUNS.test(text) && !OTHER_ARTIFACTS.test(text) && !TEST_NOUNS.test(text)) {
    return decide('CHAPTER_HANDOUT', 0.85, 'asks for a printable chapter handout');
  }
  // A named curriculum chapter, asked about rather than turned into something. Artifact and test
  // requests about a chapter belong to their own (not yet built) workflows, so they fall through.
  if (
    CLASS_WORDS.test(text) &&
    !ARTIFACT_NOUNS.test(text) &&
    !TEST_NOUNS.test(text) &&
    !PLAN_PATTERNS.test(text) &&
    (CHAPTER_WORDS.test(text) || BRIEF_VERBS.test(text) || explicit)
  ) {
    return decide('CHAPTER_BRIEFING', 0.8, 'asks about a curriculum chapter');
  }
  if (ANALYZE_PATTERNS.test(text)) return decide('ANALYZE', 0.85, 'asks to analyse past performance');
  if (PLAN_PATTERNS.test(text)) return decide('STUDY_PLAN', 0.8, 'asks for a study or revision plan');
  if (CREATE_VERBS.test(text) && TEST_NOUNS.test(text)) return decide('TEST', 0.85, 'asks to build a test or question set');
  if (CREATE_VERBS.test(text) && ARTIFACT_NOUNS.test(text)) return decide('CREATE_ARTIFACT', 0.85, 'asks to create a study artifact');
  if (/\b(practice|drill|quiz\s+me)\b/i.test(text)) return decide('PRACTICE', 0.7, 'asks to practise');
  if (PROGRESS_PATTERNS.test(text)) return decide('TRACK_PROGRESS', 0.7, 'asks about progress');
  if (/\b(compare|difference\s+between|vs\.?|versus)\b/i.test(text)) return decide('COMPARE', 0.7, 'asks for a comparison');
  if (/\b(summari[sz]e|summary\s+of|tl;?dr)\b/i.test(text)) return decide('SUMMARIZE', 0.7, 'asks for a summary');
  if (/\b(latest|news|current|announcement|notification|this\s+year)\b/i.test(text)) return decide('RESEARCH', 0.6, 'asks for current information');
  if (/^\s*explain\b|\bexplain\b/i.test(text)) return decide('EXPLAIN', 0.8, 'asks for an explanation');
  if (QUESTION_START.test(text)) return decide('ANSWER', 0.75, 'asks a question');
  if (explicit) return decide('MULTI_STEP_GOAL', 0.4, 'student chose Agent mode');
  return decide('ANSWER', 0.5, 'default to chat');
}
