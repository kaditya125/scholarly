import { z } from 'zod';
import { MAX_PAPER_QUESTIONS, MAX_QUIZ_QUESTIONS } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { parseSubject, titleCase, tokenize } from './curriculumMatch';
import { answerIndex, plainText, screenPastQuestions, sourceKey } from './pastPapers';
import { QuizQuestionDraft, quizQuestionSchema } from './quiz.adapter';

/**
 * Past-year question practice (Phase 6): "Give me JEE Main 2023 Physics PYQs."
 *
 * Only questions that pass the shared past-paper screen (./pastPapers) are served: labels that
 * allow it, an official answer, no figure the quiz can't show, and a source whose answer key is
 * plausibly a real paper's. Everything else is counted by reason and never shown. For an exam
 * with nothing that passes, the result is empty and says why, rather than a practice set passed
 * off as a past paper.
 *
 * What is claimed, and what is not: the questions are from real papers; the answers are the ones
 * recorded with each question from the exam body's key. Sadhya has not re-checked those answers
 * against the key file itself, and the summary says so.
 */

const examIndex = () => require('../../../services/pyq/examIndex');
const examMaster = () => require('../../../services/exam/examMaster.service').examMasterService;
const pyqRepo = () => require('../../../repositories/pyq.repository').pyqRepository;
const quizAttempts = () => require('../../../services/tests/quizAttempts.service').quizAttemptsService;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const FETCH_LIMIT = 1_000;
/**
 * Minutes per question for a real paper taken as a mock. Sadhya's pacing, stated as such: no exam's
 * own time limit is recorded in Sadhya's exam data (checked 27 Sep 2026), so none is claimed.
 */
export const PAPER_PACE_MINUTES = 2;

// Words around a PYQ request that are not its topic: "show me the last 5 years' JEE Main PYQs".
const FILLER = new Set(
  (
    'pyq pyqs previous past year years yr yrs paper papers question questions qs mcq mcqs solved solve solving ' +
    'practice practise practicing practising mock test tests quiz give show get find fetch list want need like would could can ' +
    'you please some few any every only just more most top best latest recent last first new old real actual official verified ' +
    'authentic exam exams asked appeared came come based wise chapterwise topicwise yearwise subjectwise shift shifts session ' +
    'sessions january february march april may june july august september october november december jan feb mar apr jun jul ' +
    'aug sep sept oct nov dec morning evening attempt let lets us help set sets bank series collection again answers answer ' +
    'solutions solution explanations explanation marks mark section level hard easy medium difficult tough frequently repeated ' +
    'times time day days week today tomorrow ug pg paper1 paper2 tier im am be it its that this these those'
  ).split(' '),
);

/** "JEE Main 2023 Physics PYQs on thermodynamics" → { year: 2023, subject: 'Physics', topicWords: ['thermodynamics'] }. */
export function pyqRequestFromGoal(goal: string): { year?: number; subject?: string; topicWords: string[] } {
  const g = String(goal ?? '');
  const year = Number(g.match(/\b(19[89]\d|20[0-4]\d)\b/)?.[1]) || undefined;
  const subject = parseSubject(g);
  const rest = g
    .replace(/\b(19[89]\d|20[0-4]\d)\b/g, ' ')
    .replace(/\b(neet(\s*ug)?|jee(\s*(main|advanced))?|ssc|cgl|chsl|upsc|cuet|gate|cse|prelims|mains?)\b/gi, ' ')
    .replace(/\b(physics|chemistry|biology|botany|zoology|mathematics|maths|math|science|reasoning|quant(itative)?(\s+aptitude)?|english|general\s+(awareness|studies|knowledge))\b/gi, ' ');
  // The subject is a filter of its own, not a topic word ("UPSC 2023 History PYQs").
  const subjectWords = new Set(subject ? tokenize(subject) : []);
  const topicWords = [...new Set(tokenize(rest).filter((w) => !FILLER.has(w) && !subjectWords.has(w)))];
  return { ...(year ? { year } : {}), ...(subject ? { subject: titleCase(subject) } : {}), topicWords };
}

/** "capacitor" matches "capacitors", "optic" matches "optics"; "electric" does not match "electrostatics". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3;
}

/** Every topic word must appear in the question's topic, chapter or subtopic. */
export function onTopic(q: any, topicWords: string[]): boolean {
  if (!topicWords.length) return true;
  const words = tokenize(`${q?.topic ?? ''} ${q?.chapter ?? ''} ${q?.subtopic ?? ''}`);
  return topicWords.every((t) => words.some((w) => sameWord(t, w)));
}

const sittingOf = (q: any) => [q.year, q.shift].filter(Boolean).join(' · ');

// Acronyms stay as they are; the words in an exam's id read as words: JEE_MAIN → "JEE Main".
const EXAM_ID_WORDS = new Set(['MAIN', 'MAINS', 'ADVANCED', 'PRELIMS', 'TIER']);
export const shortExamName = (examId: string): string =>
  examId
    .split('_')
    .map((w) => (EXAM_ID_WORDS.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(' ');

export function registerPyqTools(registry: ToolRegistry): ToolRegistry {
  const find: ToolDefinition<any, any> = {
    name: 'find_verified_past_year_questions',
    description:
      'Past-year question practice: questions from the exam’s real papers, filtered by year, subject and topic — only those that pass the past-paper screen (labels, official answer, no missing figure, a plausible answer key). The rest are counted by reason and refused.',
    category: 'assessment',
    inputSchema: z.object({ query: z.string().min(3).max(400), count: z.number().int().min(5).max(MAX_QUIZ_QUESTIONS).default(20) }),
    outputSchema: z
      .object({
        examId: z.string().optional(),
        examName: z.string().optional(),
        /** The name students use: "JEE Main", not "Joint Entrance Examination (Main)". */
        examShort: z.string().optional(),
        year: z.number().optional(),
        subject: z.string().optional(),
        topicWords: z.array(z.string()),
        checked: z.number(),
        /** The bank held more than was read; "checked" is then a floor. */
        checkedAtLeast: z.boolean(),
        /** Absent when none qualifies, so the save step is skipped rather than failing. */
        questions: z.array(quizQuestionSchema).min(1).optional(),
        excluded: z.record(z.string(), z.number()),
        title: z.string(),
        topics: z.array(z.object({ topic: z.string(), count: z.number() })),
        origin: z.array(z.object({ label: z.string(), count: z.number() })),
        sittings: z.array(z.string()),
        /** The answer sources as recorded on the questions — reported, not re-checked. */
        answerSources: z.array(z.string()),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 45_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const examId: string | null = await examIndex().detectExamId(input.query).catch(() => null);
      if (!examId) throw new ToolError('validation', 'Which exam’s past papers? For example: “JEE Main 2023 Physics PYQs”.');
      const examName: string = (await examMaster().getExam(examId).catch(() => null))?.name ?? examId.replace(/_/g, ' ');
      const { year, subject, topicWords } = pyqRequestFromGoal(input.query);
      const scope = { examId, ...(year ? { year } : {}), ...(subject ? { subject } : {}) };
      const screen = (list: any[]) => screenPastQuestions(list, { onTopic: (q) => onTopic(q, topicWords) });
      // Only officially confirmed questions can pass, so read those first — a large exam's real
      // questions are then not lost past the first page of templates.
      const confirmed: any[] = await pyqRepo().listQuestions({ ...scope, verificationStatus: 'OFFICIAL_CONFIRMED', limit: FETCH_LIMIT }).catch(() => []);
      let rows = confirmed;
      let truncated = confirmed.length >= FETCH_LIMIT;
      let { usable, excluded } = await screen(rows);
      if (!usable.length) {
        // Nothing passed: read everything in scope, so the refusal can say what the bank holds and why.
        const everything: any[] = await pyqRepo().listQuestions({ ...scope, limit: FETCH_LIMIT }).catch(() => []);
        const byId = new Map<string, any>();
        for (const q of [...everything, ...confirmed]) if (q?.questionId && !byId.has(q.questionId)) byId.set(q.questionId, q);
        rows = [...byId.values()];
        truncated = truncated || everything.length >= FETCH_LIMIT;
        ({ usable, excluded } = await screen(rows));
      }
      // Newest sitting first, then paper order — a real paper's section, as the student would meet it.
      usable.sort(
        (a, b) =>
          String(b.normalizedSittingDate ?? b.year ?? '').localeCompare(String(a.normalizedSittingDate ?? a.year ?? '')) ||
          String(a.shift ?? '').localeCompare(String(b.shift ?? '')) ||
          Number(a.questionNumber ?? 0) - Number(b.questionNumber ?? 0),
      );
      const picked = usable.slice(0, input.count);
      const questions: QuizQuestionDraft[] = picked.map((q, i) => ({
        id: `pyq_${i + 1}`,
        text: clip(plainText(q.questionText), 1_500),
        topic: clip(titleCase(String(q.chapter || q.topic || q.subject || 'General').replace(/-/g, ' ')), 200),
        options: q.options.map((o: any) => clip(plainText(o), 500)),
        correctAnswerIndex: answerIndex(q),
        explanation: clip(plainText(q.solution || q.explanation) || `Official answer: ${String.fromCharCode(65 + answerIndex(q))}.`, 1_200),
        questionOrigin: 'AUTHENTIC_PYQ',
        identityStatus: q.syllabusNodeId ? 'CANONICAL' : 'UNANCHORED',
        examId: q.examId,
        ...(q.syllabusNodeId ? { syllabusNodeId: q.syllabusNodeId } : {}),
        sourcePyqId: q.questionId,
        sourceYear: q.year,
        ...(q.shift ? { sourceShift: String(q.shift) } : {}),
        ...(q.paper ? { sourcePaper: String(q.paper) } : {}),
      }));
      const topics = new Map<string, number>();
      for (const q of questions) topics.set(q.topic, (topics.get(q.topic) ?? 0) + 1);
      const sittings = [...new Set(picked.map(sittingOf).filter(Boolean))];
      const years = [...new Set(picked.map((q) => q.year).filter(Boolean))].sort();
      const examShort = shortExamName(examId);
      return {
        data: {
          examId,
          examName,
          examShort,
          ...(year ? { year } : {}),
          ...(subject ? { subject } : {}),
          topicWords,
          checked: rows.length,
          checkedAtLeast: truncated,
          ...(questions.length ? { questions } : {}),
          excluded,
          title: clip(`${examShort}${year ? ` ${year}` : ''}${subject ? ` ${subject}` : ''}${topicWords.length ? ` · ${titleCase(topicWords.join(' '))}` : ''} — past-year questions`, 120),
          topics: [...topics.entries()].map(([topic, n]) => ({ topic, count: n })),
          origin: questions.length
            ? [{ label: `Real ${examShort} papers (${years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}); answers as recorded from the official key`, count: questions.length }]
            : [],
          sittings,
          answerSources: [...new Set(picked.map((q) => String(q.correctAnswerSource ?? '')).filter(Boolean))].slice(0, 4),
        },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ exam: out?.examId, questions: out?.questions?.length ?? 0, checked: out?.checked ?? 0 }),
  };

  const paper: ToolDefinition<any, any> = {
    name: 'find_real_past_paper',
    description:
      'Mock test: the multiple-choice part of one real past paper the student has not taken, in paper order — only a paper whose source passes the past-paper screen. Numerical-answer questions and questions that need a figure are counted and left out.',
    category: 'assessment',
    inputSchema: z.object({ query: z.string().min(3).max(400) }),
    outputSchema: z
      .object({
        examId: z.string(),
        examName: z.string(),
        examShort: z.string(),
        checked: z.number(),
        excluded: z.record(z.string(), z.number()),
        sitting: z.object({ year: z.number().optional(), shift: z.string().optional(), paper: z.string().optional(), label: z.string() }).optional(),
        /** Absent when no real paper qualifies, so the save step is skipped rather than failing. */
        questions: z.array(quizQuestionSchema).min(1).max(MAX_PAPER_QUESTIONS).optional(),
        sections: z.array(z.object({ topic: z.string(), count: z.number() })),
        origin: z.array(z.object({ label: z.string(), count: z.number() })),
        title: z.string(),
        durationMinutes: z.number().optional(),
        /** Within the chosen paper: what the quiz could not take, by reason. */
        leftOut: z.record(z.string(), z.number()),
        paperQuestions: z.number().optional(),
        answerSources: z.array(z.string()),
        /** Every real paper found overlaps what the student has already taken; the least-seen one was chosen. */
        alreadySeen: z.number().optional(),
      })
      .passthrough(),
    permissions: ['read:shared-corpus', 'read:own-history'],
    costClass: 'free',
    timeoutMs: 60_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      const examId: string | null = await examIndex().detectExamId(input.query).catch(() => null);
      if (!examId) throw new ToolError('validation', 'Which exam’s paper? For example: “JEE Main mock test”.');
      const examName: string = (await examMaster().getExam(examId).catch(() => null))?.name ?? examId.replace(/_/g, ' ');
      const examShort = shortExamName(examId);
      const { year, subject } = pyqRequestFromGoal(input.query);
      const paperWanted = /\b(paper\s*2a?|b\.?\s*arch)\b/i.test(input.query) ? /2a|arch/i : /\b(paper\s*2b|b\.?\s*plan)/i.test(input.query) ? /2b|plan/i : null;

      // 1. Which real papers are there: officially confirmed questions, screened, grouped by source.
      const sample: any[] = await pyqRepo().listQuestions({ examId, ...(year ? { year } : {}), verificationStatus: 'OFFICIAL_CONFIRMED', limit: FETCH_LIMIT }).catch(() => []);
      const screened = await screenPastQuestions(sample);
      const bySource = new Map<string, any[]>();
      for (const q of screened.usable) {
        if (paperWanted && !paperWanted.test(String(q.paper ?? ''))) continue;
        const k = sourceKey(q);
        const list = bySource.get(k);
        if (list) list.push(q);
        else bySource.set(k, [q]);
      }
      const base = { examId, examName, examShort, checked: sample.length, excluded: screened.excluded, sections: [], origin: [], leftOut: {}, answerSources: [] };
      if (!bySource.size) {
        // Nothing passed: read everything for the exam, so the refusal can say what the bank holds and why.
        const everything: any[] = await pyqRepo().listQuestions({ examId, ...(year ? { year } : {}), limit: FETCH_LIMIT }).catch(() => []);
        const why = await screenPastQuestions(everything.length ? everything : sample);
        return { data: { ...base, checked: Math.max(everything.length, sample.length), excluded: why.excluded, title: `${examShort} — real past paper` }, provenance: 'VERIFIED_CORPUS' };
      }

      // 2. Prefer a paper the student has not met: their recent past-paper quizzes' questions.
      const seen = new Set<string>();
      const recent: any[] = ((await quizAttempts().listAttempts(ctx.userId).catch(() => [])) as any[]).filter((a) => a.source === 'pyq-paper').slice(0, 8);
      for (const s of recent) {
        const a = await quizAttempts().getAttempt(ctx.userId, s.id).catch(() => null);
        for (const q of a?.questions ?? []) if (q.sourcePyqId) seen.add(String(q.sourcePyqId));
      }
      const ranked = [...bySource.values()]
        .map((qs) => ({ first: qs[0], overlap: qs.filter((q) => seen.has(String(q.questionId))).length }))
        .sort((a, b) => a.overlap - b.overlap || String(b.first.normalizedSittingDate ?? b.first.year ?? '').localeCompare(String(a.first.normalizedSittingDate ?? a.first.year ?? '')));
      const chosen = ranked[0].first;

      // 3. The whole sitting, as the paper has it.
      const sitting: any[] = (await pyqRepo().listQuestions({ examId, year: chosen.year, shift: chosen.shift, limit: 400 }).catch(() => [])).filter(
        (q: any) => sourceKey(q) === sourceKey(chosen) && (!subject || String(q.subject ?? '').toLowerCase() === subject.toLowerCase()),
      );
      const inPaper = await screenPastQuestions(sitting);
      const ordered = inPaper.usable.sort((a, b) => Number(a.questionNumber ?? 0) - Number(b.questionNumber ?? 0)).slice(0, MAX_PAPER_QUESTIONS);
      const questions: QuizQuestionDraft[] = ordered.map((q, i) => ({
        id: `paper_${i + 1}`,
        text: clip(plainText(q.questionText), 1_500),
        topic: clip(titleCase(String(q.chapter || q.topic || q.subject || 'General').replace(/-/g, ' ')), 200),
        options: q.options.map((o: any) => clip(plainText(o), 500)),
        correctAnswerIndex: answerIndex(q),
        explanation: clip(plainText(q.solution || q.explanation) || `Official answer: ${String.fromCharCode(65 + answerIndex(q))}.`, 1_200),
        questionOrigin: 'AUTHENTIC_PYQ',
        identityStatus: q.syllabusNodeId ? 'CANONICAL' : 'UNANCHORED',
        examId: q.examId,
        ...(q.syllabusNodeId ? { syllabusNodeId: q.syllabusNodeId } : {}),
        sourcePyqId: q.questionId,
        sourceYear: q.year,
        ...(q.shift ? { sourceShift: String(q.shift) } : {}),
        ...(q.paper ? { sourcePaper: String(q.paper) } : {}),
      }));
      // Per subject as the bank labels it, in order of first appearance. (Some labels are wrong — JEE
      // Main 2022's vector-algebra questions are tagged Physics inside the Maths block — so a label
      // interrupting a block is counted with its label, not re-guessed from its position.)
      const bySubject = new Map<string, number>();
      for (const q of ordered) {
        const name = titleCase(String(q.subject || 'General'));
        bySubject.set(name, (bySubject.get(name) ?? 0) + 1);
      }
      const sections = [...bySubject.entries()].map(([topic, count]) => ({ topic, count }));
      const label = [chosen.year, chosen.shift].filter(Boolean).join(' · ');
      return {
        data: {
          ...base,
          sitting: { ...(chosen.year ? { year: chosen.year } : {}), ...(chosen.shift ? { shift: String(chosen.shift) } : {}), ...(chosen.paper ? { paper: String(chosen.paper) } : {}), label },
          ...(questions.length ? { questions } : {}),
          sections,
          origin: questions.length ? [{ label: `A real ${examShort} paper (${label}); answers as recorded from the official key`, count: questions.length }] : [],
          title: clip(`${examShort} ${label}${subject ? ` ${titleCase(subject)}` : ''} — real paper (multiple-choice part)`, 120),
          ...(questions.length ? { durationMinutes: Math.min(300, questions.length * PAPER_PACE_MINUTES) } : {}),
          leftOut: inPaper.excluded,
          paperQuestions: sitting.length,
          answerSources: [...new Set(ordered.map((q) => String(q.correctAnswerSource ?? '')).filter(Boolean))].slice(0, 4),
          ...(ranked[0].overlap ? { alreadySeen: ranked[0].overlap } : {}),
        },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ exam: out?.examId, paper: out?.sitting?.label, questions: out?.questions?.length ?? 0 }),
  };

  registry.register(find);
  registry.register(paper);
  return registry;
}
