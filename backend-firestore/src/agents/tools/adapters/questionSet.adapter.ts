import { z } from 'zod';
import { MAX_QUIZ_QUESTIONS } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { ChapterTextError, loadChapterPages } from './chapterText';
import { parseSubject, titleCase } from './curriculumMatch';
import {
  McqDraft,
  NEAR_DUPLICATE,
  SourceSection,
  batchSections,
  callJson,
  checkMcq,
  evidenceKey,
  mapLimit,
  sectionOfEvidence,
  sectionsFromPages,
  similarity,
  solveFromEvidence,
} from './grounded';
import { answerIndex, plainText, screenPastQuestions } from './pastPapers';
import { syllabusMatchScore } from './progress.adapter';
import { QuizQuestionDraft, quizQuestionSchema } from './quiz.adapter';

/**
 * Question sets (Phase 6, golden case 2): "Create 30 NEET Biology questions from Cell Structure."
 *
 *   resolve_exam_topic            syllabus retrieval — the exam, and where the topic sits in its syllabus
 *   (resolve_curriculum_chapter)  topic retrieval — the NCERT chapter that teaches it
 *   read_chapter_sections         the chapter's own text, section by section
 *   plan_question_blueprint       how many questions per section, and the difficulty mix
 *   find_verified_past_questions  real past-year questions — only those with real provenance
 *   generate_grounded_questions   question generation, from each section's text, with evidence
 *   validate_questions            question + answer validation against the chapter text
 *   detect_duplicate_questions    duplicates within the set and against what the student has seen
 *   (create_quiz_artifact)        the quiz
 *
 * Identity rule, as in the rest of the repo: a syllabus node matched from the student's words is
 * shown as where the topic sits, never stamped onto questions as their canonical identity.
 */

const syllabusGraph = () => require('../../../services/exam/syllabusGraph.service').syllabusGraphService;
const examIndex = () => require('../../../services/pyq/examIndex');
const examMaster = () => require('../../../services/exam/examMaster.service').examMasterService;
const pyqRepo = () => require('../../../repositories/pyq.repository').pyqRepository;
const quizAttempts = () => require('../../../services/tests/quizAttempts.service').quizAttemptsService;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Create 30 NEET Biology questions from Cell Structure." → "Cell Structure". */
export function topicFromGoal(goal: string): string {
  const exams = /\b(neet(\s*ug)?|jee(\s*(main|advanced))?|ssc|cgl|chsl|upsc|cuet|gate|cbse|ncert|board)\b/gi;
  const subjects = /\b(physics|chemistry|biology|botany|zoology|mathematics|maths|math|science)\b/gi;
  const filler = /\b(create|make|generate|give|me|prepare|write|build|set|of|a|an|the|some|questions?|mcqs?|quiz(zes)?|tests?|practice|from|on|about|for|chapter|topic|unit|class\s*\d{1,2}|\d+)\b/gi;
  const cleaned = String(goal ?? '')
    .replace(/[.?!]+\s*$/, '')
    .replace(exams, ' ')
    .replace(subjects, ' ')
    .replace(filler, ' ')
    .replace(/[^\p{L}\p{N}\s:'-]/gu, ' ')
    .replace(/(^|\s)[-:']+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/** The spellings a chapter name is stored under, for exact-match lookups. */
export function chapterNameVariants(name: string): string[] {
  const t = String(name ?? '').trim();
  return [...new Set([t, titleCase(t), t.toUpperCase(), t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()])].filter(Boolean);
}

// The past-paper checks live in ./pastPapers, shared with PYQ practice; re-exported for callers here.
export { answerIndex, hasRealProvenance, provenanceRefusal } from './pastPapers';

/** Proportional to how much each section teaches, at least one each, largest remainders first. */
export function allocate(sections: Array<{ id: string; heading: string; chars: number }>, count: number): Array<{ sectionId: string; heading: string; count: number }> {
  const usable = sections.filter((s) => s.chars >= 400).sort((a, b) => b.chars - a.chars).slice(0, Math.max(1, count));
  const total = usable.reduce((n, s) => n + s.chars, 0) || 1;
  const raw = usable.map((s) => ({ s, exact: (s.chars / total) * count }));
  const out = raw.map(({ s, exact }) => ({ sectionId: s.id, heading: s.heading, count: Math.max(1, Math.floor(exact)), rem: exact - Math.floor(exact) }));
  let sum = out.reduce((n, a) => n + a.count, 0);
  for (const a of [...out].sort((x, y) => y.rem - x.rem)) {
    if (sum >= count) break;
    a.count++;
    sum++;
  }
  while (sum > count) {
    const biggest = out.reduce((m, a) => (a.count > m.count ? a : m), out[0]);
    if (biggest.count <= 1) break;
    biggest.count--;
    sum--;
  }
  // Chapter order, not size order.
  const order = new Map(sections.map((s, i) => [s.id, i]));
  return out.sort((a, b) => (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0)).map(({ sectionId, heading, count: n }) => ({ sectionId, heading, count: n }));
}

/** Sadhya's standard practice mix, used when no trustworthy observed mix exists for the exam. */
export function difficultyMix(count: number): { easy: number; medium: number; hard: number; basis: string } {
  const easy = Math.round(count * 0.3);
  const hard = Math.round(count * 0.2);
  return { easy, medium: count - easy - hard, hard, basis: 'Sadhya’s standard practice mix (30% easy, 50% medium, 20% hard)' };
}

async function chapterSections(notebookId: string, sourceId: string, headings: string[]): Promise<{ sections: SourceSection[]; pages: Array<{ pageNumber: number; text: string }> }> {
  try {
    const chapter = await loadChapterPages(notebookId, sourceId);
    return { sections: sectionsFromPages(chapter.pages, headings), pages: chapter.pages };
  } catch (e) {
    if (e instanceof ChapterTextError) throw new ToolError(e.code === 'NOT_CURRICULUM' ? 'permission' : 'not_found', e.message);
    throw e;
  }
}

/** One call's prompt: several passages (sections), each with how many questions to write from it. */
export const mcqPrompt = (args: {
  exam?: string;
  subject?: string;
  sourceTitle: string;
  passages: Array<{ label: string; section: SourceSection; count: number }>;
  mix: { easy: number; medium: number; hard: number };
}) =>
  [
    `Write multiple-choice questions${args.exam ? ` in the style of ${args.exam}` : ''}${args.subject ? ` (${args.subject})` : ''}, strictly from the passages below (sections of ${args.sourceTitle}).`,
    `How many from each passage: ${args.passages.map((p) => `${p.label}: ${p.count}`).join(', ')}.`,
    '',
    'Rules:',
    '- Every question must be answerable from its passage alone. Do not use outside facts.',
    '- Exactly 4 options, exactly one correct, all distinct and plausible. Use the passage’s own terms for the correct option.',
    '- No "all of the above", "none of the above" or "both A and B" options. No NOT / EXCEPT / incorrect-statement questions.',
    `- Difficulty overall: about ${args.mix.easy} easy (one fact), ${args.mix.medium} medium (a fact applied), ${args.mix.hard} hard (two facts from the passage linked).`,
    '- "evidence": copy ONE sentence (or clause) from the passage WORD FOR WORD that proves the correct answer.',
    '- "explanation": one sentence, in your own words, on why the answer is right.',
    '- "passage": the label of the passage the question comes from.',
    '',
    'Reply with JSON only: {"questions":[{"passage":"P1","question":"…","options":["…","…","…","…"],"correctIndex":0,"explanation":"…","evidence":"…","difficulty":"easy|medium|hard"}]}',
    '',
    ...args.passages.flatMap((p) => [`PASSAGE ${p.label} — ${p.section.heading}:`, p.section.text, '']),
  ].join('\n');

/** The whole resolve_exam_topic output: optional exam and subject travel inside it, since a step
 *  reference to a missing value would skip the step instead of passing nothing. */
const examTopicInput = z.object({ examId: z.string().optional(), examName: z.string().optional(), examShort: z.string().optional(), subject: z.string().optional(), topic: z.string() }).passthrough();

const sectionsInput = z.object({
  notebookId: z.string().min(1),
  sourceId: z.string().min(1),
  headings: z.array(z.string()).max(80).default([]),
});

export function registerQuestionSetTools(registry: ToolRegistry): ToolRegistry {
  const examTopic: ToolDefinition<any, any> = {
    name: 'resolve_exam_topic',
    description:
      "Syllabus retrieval for a question-set request: the exam it names, the topic, and where that topic sits in the exam's official syllabus (matched by name, shown — never used as identity).",
    category: 'knowledge',
    inputSchema: z.object({ query: z.string().min(3).max(400) }),
    outputSchema: z
      .object({
        examId: z.string().optional(),
        examName: z.string().optional(),
        /** "NEET UG" — for titles; examName is the official long name. */
        examShort: z.string().optional(),
        subject: z.string().optional(),
        topic: z.string(),
        syllabus: z.object({ nodeId: z.string(), label: z.string(), path: z.array(z.string()), matchedBy: z.literal('name') }).optional(),
        chapterQuery: z.string(),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const topic = topicFromGoal(input.query);
      if (topic.length < 3) throw new ToolError('validation', 'Which topic should the questions be on?');
      const subject = parseSubject(input.query);
      const examId: string | undefined = (await examIndex().detectExamId(input.query).catch(() => null)) ?? undefined;
      let examName: string | undefined;
      let syllabus: any;
      if (examId) {
        examName = (await examMaster().getExam(examId).catch(() => null))?.name ?? examId.replace(/_/g, ' ');
        const nodes: any[] = await syllabusGraph().getSyllabusNodes({ examId }).catch(() => []);
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const ancestors = (n: any) => {
          const out: any[] = [];
          let cur = n;
          const seen = new Set<string>();
          while (cur?.parentEntityId && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byId.get(cur.parentEntityId);
            if (cur) out.unshift(cur);
          }
          return out;
        };
        const inSubject = (n: any) => !subject || ancestors(n).some((a) => String(a.label).toLowerCase().includes(subject));
        const matches = nodes.filter((n) => inSubject(n) && syllabusMatchScore(topic, String(n.label)) >= 1);
        const deepest = matches.slice().sort((a, b) => ancestors(b).length - ancestors(a).length)[0];
        if (deepest && matches.every((m) => m.id === deepest.id || ancestors(deepest).some((a) => a.id === m.id))) {
          syllabus = {
            nodeId: deepest.id,
            label: clip(String(deepest.label), 600),
            path: [...ancestors(deepest).map((a) => clip(String(a.label), 200)), clip(String(deepest.label), 200)].slice(-4),
            matchedBy: 'name',
          };
        }
      }
      const chapterQuery = clip([subject, topic, syllabus?.label].filter(Boolean).join(' '), 700);
      const examShort = examId ? examId.replace(/_/g, ' ') : undefined;
      return { data: { ...(examId ? { examId, examName, examShort } : {}), ...(subject ? { subject } : {}), topic, ...(syllabus ? { syllabus } : {}), chapterQuery }, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ exam: out?.examId, topic: out?.topic, syllabus: out?.syllabus ? 'matched' : 'none' }),
  };

  const readSections: ToolDefinition<any, any> = {
    name: 'read_chapter_sections',
    description: "Reads an NCERT chapter's own text and splits it at the chapter's section headings (teaching text only; summary and exercises left out).",
    category: 'knowledge',
    inputSchema: sectionsInput,
    outputSchema: z.object({ sections: z.array(z.object({ id: z.string(), heading: z.string(), pages: z.array(z.number()), chars: z.number() })).min(1), chars: z.number() }),
    permissions: ['read:shared-corpus'],
    costClass: 'low',
    timeoutMs: 60_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1_000 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const { sections } = await chapterSections(input.notebookId, input.sourceId, input.headings);
      if (sections.length === 0) throw new ToolError('not_found', 'The chapter has no readable teaching text to write questions from.');
      return {
        data: { sections: sections.map((s) => ({ id: s.id, heading: s.heading, pages: s.pages, chars: s.text.length })), chars: sections.reduce((n, s) => n + s.text.length, 0) },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ sections: out?.sections?.length ?? 0, chars: out?.chars ?? 0 }),
  };

  const blueprint: ToolDefinition<any, any> = {
    name: 'plan_question_blueprint',
    description:
      'Topic distribution (questions per chapter section, in proportion to how much each teaches) and difficulty distribution for a question set. No model call.',
    category: 'assessment',
    inputSchema: z.object({
      sections: z.array(z.object({ id: z.string(), heading: z.string(), chars: z.number() }).passthrough()).min(1),
      count: z.number().int().min(5).max(MAX_QUIZ_QUESTIONS),
    }),
    outputSchema: z.object({
      allocations: z.array(z.object({ sectionId: z.string(), heading: z.string(), count: z.number() })).min(1),
      difficulty: z.object({ easy: z.number(), medium: z.number(), hard: z.number(), basis: z.string() }),
      count: z.number(),
    }),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      return { data: { allocations: allocate(input.sections, input.count), difficulty: difficultyMix(input.count), count: input.count }, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ sections: out?.allocations?.length ?? 0, count: out?.count }),
  };

  const pastQuestions: ToolDefinition<any, any> = {
    name: 'find_verified_past_questions',
    description:
      "Looks for real past-year questions on the chapter in the exam's question bank, and keeps only those with real provenance: an authentic import with an officially confirmed answer, from a source whose answer key is plausibly a real paper's. Template and unverified questions are counted, never used.",
    category: 'assessment',
    inputSchema: z.object({ examTopic: examTopicInput, chapterName: z.string().min(2).max(200), limit: z.number().int().min(1).max(20).default(6) }),
    outputSchema: z.object({
      checked: z.number(),
      usable: z.array(quizQuestionSchema),
      excluded: z.record(z.string(), z.number()),
    }),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const examId = input.examTopic.examId;
      if (!examId) return { data: { checked: 0, usable: [], excluded: {} }, provenance: 'VERIFIED_CORPUS' };
      // The bank's `topic` is matched exactly, so try the spellings a chapter name comes in
      // ("CELL: THE UNIT OF LIFE" in a chapter's header, "Cell: The Unit of Life" in the bank).
      const rows: any[] = [];
      const seenIds = new Set<string>();
      for (const topic of chapterNameVariants(input.chapterName)) {
        for (const q of await pyqRepo().listQuestions({ examId, topic, limit: 200 }).catch(() => [])) {
          if (!seenIds.has(q.questionId)) {
            seenIds.add(q.questionId);
            rows.push(q);
          }
        }
      }
      const screened = await screenPastQuestions(rows);
      const usable: QuizQuestionDraft[] = screened.usable.slice(0, input.limit).map((q) => ({
        id: `pyq_${String(q.questionId).slice(-40)}`,
        text: clip(plainText(q.questionText), 1_500),
        topic: clip(String(q.topic || input.chapterName), 200),
        options: q.options.map((o: any) => clip(plainText(o), 500)),
        correctAnswerIndex: answerIndex(q),
        explanation: clip(plainText(q.explanation || q.solution) || `${q.examName ?? examId} ${q.year}: official answer ${q.correctAnswer}.`, 1_200),
        questionOrigin: 'AUTHENTIC_PYQ' as const,
        identityStatus: q.syllabusNodeId ? ('CANONICAL' as const) : ('UNANCHORED' as const),
        examId: q.examId,
        ...(q.syllabusNodeId ? { syllabusNodeId: q.syllabusNodeId } : {}),
        sourcePyqId: q.questionId,
        sourceYear: q.year,
        ...(q.shift ? { sourceShift: String(q.shift) } : {}),
        ...(q.paper ? { sourcePaper: String(q.paper) } : {}),
      }));
      const excluded = screened.excluded;
      return { data: { checked: rows.length, usable, excluded }, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ checked: out?.checked ?? 0, usable: out?.usable?.length ?? 0 }),
  };

  const generate: ToolDefinition<any, any> = {
    name: 'generate_grounded_questions',
    description:
      'Writes multiple-choice questions from each chapter section’s own text (a few sections at a time), asking for the sentence that proves each answer. Some spares are written, since validation will reject some.',
    category: 'assessment',
    inputSchema: sectionsInput.extend({
      allocations: z.array(z.object({ sectionId: z.string(), heading: z.string(), count: z.number().int().min(1) })).min(1),
      difficulty: z.object({ easy: z.number(), medium: z.number(), hard: z.number() }).passthrough(),
      sourceTitle: z.string().min(2).max(200),
      examTopic: examTopicInput,
    }),
    outputSchema: z.object({
      drafts: z.array(z.object({ question: z.string(), options: z.array(z.string()), correctIndex: z.number(), explanation: z.string().optional(), evidence: z.string(), difficulty: z.string().optional(), sectionId: z.string() }).passthrough()),
      calls: z.number(),
    }),
    permissions: ['read:shared-corpus'],
    costClass: 'medium',
    timeoutMs: 150_000,
    // A retry repeats every model call; one attempt, and validation handles thin output.
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'GENERATED',
    async execute(input, ctx) {
      const { sections } = await chapterSections(input.notebookId, input.sourceId, input.headings);
      const byId = new Map(sections.map((s) => [s.id, s]));
      const total = input.allocations.reduce((n: number, a: any) => n + a.count, 0);
      // Spares for what validation will reject, then a few sections per call.
      const asks = (input.allocations as Array<{ sectionId: string; count: number }>)
        .map((a) => ({ section: byId.get(a.sectionId)!, count: Math.ceil(a.count * 1.4) }))
        .filter((a) => a.section);
      const batches = batchSections(asks);
      let tokens = 0;
      let costUsd = 0;
      const results = await mapLimit(batches, 2, async (batch) => {
        const passages = batch.map((a, i) => ({ label: `P${i + 1}`, section: a.section, count: a.count }));
        const asked = batch.reduce((n, a) => n + a.count, 0);
        const share = (k: number) => Math.round((k * asked) / Math.max(1, total * 1.4));
        const { json, usage } = await callJson(
          mcqPrompt({
            exam: input.examTopic.examShort ?? input.examTopic.examName,
            subject: input.examTopic.subject,
            sourceTitle: input.sourceTitle,
            passages,
            mix: { easy: share(input.difficulty.easy), medium: share(input.difficulty.medium), hard: share(input.difficulty.hard) },
          }),
          'You write exam questions strictly from given passages and reply with JSON only.',
          { userId: ctx.userId, operation: 'agent_question_generation' },
        );
        tokens += usage.tokens;
        costUsd += usage.costUsd;
        const bySection = new Map(passages.map((p) => [p.label, p.section.id]));
        const items: any[] = Array.isArray(json?.questions) ? json.questions : [];
        return items.slice(0, asked + 4).map(
          (q): McqDraft => ({
            question: String(q?.question ?? ''),
            options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [],
            correctIndex: Number(q?.correctIndex),
            explanation: String(q?.explanation ?? ''),
            evidence: String(q?.evidence ?? ''),
            difficulty: ['easy', 'medium', 'hard'].includes(q?.difficulty) ? q.difficulty : undefined,
            // A hint only: validation places the question by where its evidence really is.
            sectionId: bySection.get(String(q?.passage ?? '')) ?? passages[0].section.id,
          }),
        );
      });
      const drafts = results.flat();
      if (drafts.length === 0) throw new ToolError('internal', 'The question writer returned nothing usable. Please try again.');
      return { data: { drafts, calls: batches.length }, provenance: 'GENERATED', usage: { tokens, costUsd } };
    },
    // Counts only: never a question or an answer in a run event.
    summarize: (out: any) => ({ drafts: out?.drafts?.length ?? 0, calls: out?.calls ?? 0 }),
  };

  const validate: ToolDefinition<any, any> = {
    name: 'validate_questions',
    description:
      'Question and answer validation against the chapter text: four distinct options, none restating another, no lazy or negative stems, the quoted evidence really is in the chapter and states the marked answer — then an independent solver, which never sees the key, must reach the same answer from the evidence alone.',
    category: 'assessment',
    inputSchema: sectionsInput.extend({
      drafts: z.array(z.any()).min(1),
      chapterName: z.string().min(2).max(200),
      examTopic: examTopicInput,
    }),
    outputSchema: z.object({ accepted: z.array(quizQuestionSchema), checked: z.number(), rejected: z.record(z.string(), z.number()) }),
    permissions: ['read:shared-corpus'],
    costClass: 'low',
    timeoutMs: 120_000,
    // One attempt: a retry would repeat the solver call; a thin result is reported, not re-bought.
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      const { sections, pages } = await chapterSections(input.notebookId, input.sourceId, input.headings);
      const byId = new Map(sections.map((s) => [s.id, s]));
      const sourceKey = evidenceKey(pages.map((p) => p.text).join('\n'));
      const pageKeys = pages.map((p) => ({ page: p.pageNumber, key: evidenceKey(p.text) }));
      const rejected: Record<string, number> = {};
      const reject = (reason: string) => (rejected[reason] = (rejected[reason] ?? 0) + 1);
      const passed = (input.drafts as McqDraft[]).filter((d) => {
        const reason = checkMcq(d, sourceKey);
        if (reason) reject(reason);
        return !reason;
      });
      // The independent solver: same question, options and evidence, no key.
      const { answers, usage } = passed.length
        ? await solveFromEvidence(
            passed.map((d, i) => ({ id: `q${i + 1}`, question: d.question, options: d.options, evidence: d.evidence })),
            { userId: ctx.userId, operation: 'agent_answer_validation' },
          )
        : { answers: new Map<string, number>(), usage: { tokens: 0, costUsd: 0 } };
      const accepted: QuizQuestionDraft[] = [];
      for (const [i, d] of passed.entries()) {
        const solved = answers.get(`q${i + 1}`);
        if (solved === undefined || solved === -1) {
          reject('not_settled_by_evidence');
          continue;
        }
        if (solved !== d.correctIndex) {
          reject('solver_disagrees');
          continue;
        }
        const ev = evidenceKey(d.evidence);
        const page = pageKeys.find((p) => p.key.includes(ev))?.page;
        // Where the evidence really is decides the topic; the model's passage label is a fallback.
        const section = sectionOfEvidence(sections, d.evidence) ?? byId.get(d.sectionId);
        accepted.push({
          id: `gq_${accepted.length + 1}`,
          text: clip(d.question.trim(), 1_500),
          topic: clip(section?.heading ?? input.chapterName, 200),
          options: d.options.map((o) => clip(o.trim(), 500)),
          correctAnswerIndex: d.correctIndex,
          explanation: clip(`${d.explanation ? `${d.explanation.trim()} ` : ''}The chapter says: “${d.evidence.trim()}”${page ? ` (${input.chapterName}, p. ${page} of the chapter PDF)` : ''}.`, 1_200),
          questionOrigin: 'CURRICULUM_SYNTHESIZED',
          identityStatus: 'UNANCHORED',
          ...(input.examTopic.examId ? { examId: input.examTopic.examId } : {}),
        });
      }
      return { data: { accepted, checked: input.drafts.length, rejected }, provenance: 'VERIFIED_CORPUS', usage };
    },
    summarize: (out: any) => ({ accepted: out?.accepted?.length ?? 0, checked: out?.checked ?? 0 }),
  };

  const dedupe: ToolDefinition<any, any> = {
    name: 'detect_duplicate_questions',
    description:
      'Removes near-duplicate questions within the set and questions the student has already seen in recent quizzes, then trims to the size asked for, keeping every section represented.',
    category: 'assessment',
    inputSchema: z.object({
      questions: z.array(quizQuestionSchema).min(1),
      pastQuestions: z.array(quizQuestionSchema).default([]),
      count: z.number().int().min(1).max(MAX_QUIZ_QUESTIONS),
      chapterName: z.string().min(2).max(200),
      bookTitle: z.string().max(200).optional(),
      examTopic: examTopicInput,
      checked: z.number().int().min(0),
      rejected: z.record(z.string(), z.number()),
    }),
    outputSchema: z.object({
      title: z.string(),
      questions: z.array(quizQuestionSchema).min(1),
      topics: z.array(z.object({ topic: z.string(), count: z.number() })),
      origin: z.array(z.object({ label: z.string(), count: z.number() })),
      validation: z.object({ checked: z.number(), accepted: z.number(), rejected: z.record(z.string(), z.number()) }),
      sourceNote: z.string(),
      removed: z.object({ withinSet: z.number(), seenBefore: z.number() }),
    }),
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      // What the student has seen lately: their last few quizzes' questions.
      const seen: string[] = [];
      const recent: any[] = ((await quizAttempts().listAttempts(ctx.userId).catch(() => [])) as any[]).slice(0, 8);
      for (const s of recent) {
        const a = await quizAttempts().getAttempt(ctx.userId, s.id).catch(() => null);
        for (const q of a?.questions ?? []) seen.push(String(q.text));
      }
      const kept: QuizQuestionDraft[] = [];
      let withinSet = 0;
      let seenBefore = 0;
      // Real past-year questions first: they are the scarcer kind.
      for (const q of [...input.pastQuestions, ...input.questions] as QuizQuestionDraft[]) {
        if (seen.some((t) => similarity(t, q.text) >= NEAR_DUPLICATE)) {
          seenBefore++;
          continue;
        }
        if (kept.some((k) => similarity(k.text, q.text) >= NEAR_DUPLICATE)) {
          withinSet++;
          continue;
        }
        kept.push(q);
      }
      if (kept.length === 0) throw new ToolError('not_found', 'Every question duplicated one you have already seen. Ask again for a fresh set.');

      // Trim to size round-robin across topics, so no section is squeezed out.
      const topics: string[] = [];
      for (const q of kept) if (!topics.includes(q.topic)) topics.push(q.topic);
      const queues = new Map(topics.map((t) => [t, kept.filter((q) => q.topic === t)]));
      const final: QuizQuestionDraft[] = [];
      while (final.length < Math.min(input.count, kept.length)) {
        for (const t of topics) {
          if (final.length >= input.count) break;
          const next = queues.get(t)!.shift();
          if (next) final.push(next);
        }
      }
      const questions = final.map((q, i) => ({ ...q, id: `${q.questionOrigin === 'AUTHENTIC_PYQ' ? 'pq' : 'gq'}_${i + 1}` }));
      const topicCounts = new Map<string, number>();
      for (const q of questions) topicCounts.set(q.topic, (topicCounts.get(q.topic) ?? 0) + 1);
      const pyq = questions.filter((q) => q.questionOrigin === 'AUTHENTIC_PYQ').length;
      const exam = input.examTopic.examShort ?? input.examTopic.examName;
      const title = clip(`${input.chapterName} — ${questions.length} ${exam ? `${exam} ` : ''}questions`, 120);
      const sourceNote = clip(
        `Written from ${input.bookTitle ? `${input.bookTitle}, ` : ''}“${input.chapterName}”: every answer was checked against a sentence of the chapter, quoted in its explanation.${pyq ? ' Past-year questions are included only where their source is verified.' : ''}`,
        300,
      );
      return {
        data: {
          title,
          questions,
          topics: [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
          origin: [
            ...(questions.length - pyq ? [{ label: 'Written from the NCERT chapter, each answer checked against its text', count: questions.length - pyq }] : []),
            ...(pyq ? [{ label: 'Real past-year questions (verified source)', count: pyq }] : []),
          ],
          validation: {
            checked: input.checked,
            accepted: input.checked - Object.values(input.rejected as Record<string, number>).reduce((a, b) => a + b, 0),
            rejected: { ...input.rejected, ...(withinSet ? { near_duplicate: withinSet } : {}), ...(seenBefore ? { seen_recently: seenBefore } : {}) },
          },
          sourceNote,
          removed: { withinSet, seenBefore },
        },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ questions: out?.questions?.length ?? 0, withinSet: out?.removed?.withinSet ?? 0, seenBefore: out?.removed?.seenBefore ?? 0 }),
  };

  for (const tool of [examTopic, readSections, blueprint, pastQuestions, generate, validate, dedupe]) registry.register(tool);
  return registry;
}
