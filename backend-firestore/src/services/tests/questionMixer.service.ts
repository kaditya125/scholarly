/**
 * QuestionMixer — the orchestration layer Phase 1/2 never had: candidate retrieval, ranking,
 * deduplication, distribution enforcement, gap-filling generation, and validation, all driven by
 * a TestBlueprint rather than one LLM prompt asked to invent an entire test.
 *
 * Reuses, does not duplicate:
 *   detectExamId (examIndex.ts)             — exam resolution
 *   blueprintResolverService                — section/difficulty/source distribution
 *   drillTopicsService                      — the exam's real topic vocabulary; CANONICAL_PYQ /
 *                                             PYQ_PATTERN retrieval by stored topic spellings, and
 *                                             indexed REFERENCE_BOOK questions by topic
 *   pyqAnalyticsService                     — pattern grounding text for PYQ_PATTERN generation
 *   referenceBooksService                   — reference passages for REFERENCE_BOOK generation
 *   GeminiProvider                          — the one LLM call site, for gap-filling only
 *
 * canonicalPyqRetrievalService is deliberately NOT used here — "give me the real 2022 Shift 1
 * paper" stays on its own path (quizGeneratorService.getCanonicalPaperQuiz), which retrieves and
 * returns a paper as-is. This mixer CONSTRUCTS a test from candidates; it does not reproduce an
 * existing one.
 */
import { db } from '../../config/firebase';
import { detectExamId } from '../pyq/examIndex';
import { blueprintResolverService } from './testBlueprint.service';
import { pyqAnalyticsService } from '../pyq/pyqAnalytics.service';
import { referenceBooksService } from '../rag/referenceBooks.service';
import { drillTopicsService, topicTokens, tokensOverlap, displayTopic } from './drillTopics.service';
import { RetrievalResult } from '../rag/retrieval.service';
import { GeminiProvider } from '../ai/gemini.provider';
import { logger } from '../../utils/logger';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import {
  QuestionMixRequest, QuestionCandidate, QuestionSourceType, TestBlueprint, SectionBlueprint, MixerTrace,
} from '../../types/questionMixer.types';

const llm = new GeminiProvider();

/** Map a model's "correctAnswer" (index, letter, or option text) to an index — same rule
 *  quizGenerator.service.ts uses, kept identical so scoring behaves the same everywhere. */
function resolveCorrectIndex(correctAnswer: any, options: string[]): number {
  if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) return correctAnswer;
  if (typeof correctAnswer === 'string') {
    const s = correctAnswer.trim();
    const letter = s.toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(letter)) return letter.charCodeAt(0) - 65;
    const idx = options.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
  }
  return 0;
}

/** Normalizes text for duplicate comparison — lowercase, collapsed whitespace, punctuation
 *  stripped. Deliberately not an embedding call: exact/near duplicates in an MCQ corpus are
 *  almost always near-verbatim text matches, which this catches at zero marginal cost per
 *  question, matching "don't introduce an expensive embedding op if an existing mechanism works." */
function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** 3-word shingle Jaccard similarity — same algorithm family already proven in the reference-books
 *  pipeline's near-dup detector (04-metadata-and-dedupe.ts), reapplied here rather than reinvented. */
function shingleJaccard(a: string, b: string): number {
  const shingles = (s: string) => {
    const words = s.split(' ').filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i < words.length - 2; i++) out.add(words.slice(i, i + 3).join(' '));
    return out;
  };
  const sa = shingles(a), sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

const NEAR_DUP_THRESHOLD = 0.6;

/** Same numbers + mostly the same words = the same question reworded ("marks up 20%, discount
 *  10%" written twice by two generation calls) — which 3-word shingles alone miss. */
function isRewordedDuplicate(a: string, b: string): boolean {
  const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) || []).sort().join(',');
  const na = nums(a);
  if (!na || na.split(',').length < 2 || na !== nums(b)) return false;
  const words = (s: string) => new Set(s.split(' ').filter((w) => w.length > 2 && !/^\d/.test(w)));
  const wa = words(a), wb = words(b);
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter || 1) >= 0.45;
}

/** Where a section's questions may come from, resolved against the exam's real corpus vocabulary
 *  (drillTopics.service). `rawTopics` set = a real corpus topic; null with `subjectOnly` = a
 *  whole-subject drill; null otherwise = a topic the corpus doesn't tag, so retrieval returns
 *  nothing rather than padding with other topics of the subject. */
interface DrillScope {
  subject: string;
  topic: string;
  rawTopics: string[] | null;
  rawSubjects: string[];
  subjectOnly: boolean;
}

async function resolveDrillScope(examId: string, subjectIn: string | undefined, topicIn: string): Promise<DrillScope> {
  let subject = (subjectIn || '').trim();
  let topic = (topicIn || '').trim();
  // Older clients sent "Quantitative Aptitude - Percentage" as one topic string.
  const split = !subject && topic.match(/^(.+?)\s+-\s+(.+)$/);
  if (split && await drillTopicsService.resolveSubject(examId, split[1]).catch(() => null)) {
    subject = split[1].trim();
    topic = split[2].trim();
  }
  if (!subject || subject === topic) {
    // A topic that is really a whole subject ("Quantitative Aptitude") is a subject-level drill.
    if (await drillTopicsService.isSubjectName(examId, topic).catch(() => false)) {
      const s = await drillTopicsService.resolveSubject(examId, topic);
      return { subject: s!.display, topic: s!.display, rawTopics: null, rawSubjects: s!.rawSubjects, subjectOnly: true };
    }
  }
  const hit = await drillTopicsService.resolveTopic(examId, topic, subject || undefined).catch(() => null);
  if (hit) return { subject: hit.subject, topic: hit.topic, rawTopics: hit.rawTopics, rawSubjects: hit.rawSubjects, subjectOnly: false };
  const s = subject ? await drillTopicsService.resolveSubject(examId, subject).catch(() => null) : null;
  return { subject: s?.display || subject || topic, topic, rawTopics: null, rawSubjects: s?.rawSubjects || [], subjectOnly: false };
}

/** Imported PYQs whose formula or figure didn't survive extraction: zero-width fragments where a
 *  rendered expression was ("the value of ? ​ 35 27 ​ 55"), or a stem that points at a chart/figure
 *  the record doesn't carry. Real, but unanswerable as text — keep them out of drills. */
function isUnrenderablePyq(text: string): boolean {
  if (/​/.test(text)) return true;
  if (/\b(value|values) of\s*\?|=\s*\?\s*$/i.test(text)) return true;
  return /\b(following|given|above|below)\s+(bar\s*graph|graph|chart|pie\s*chart|table|figure|diagram|image)\b/i.test(text);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class QuestionMixerService {
  async buildTest(request: QuestionMixRequest): Promise<{ blueprint: TestBlueprint; questions: QuestionCandidate[]; trace: MixerTrace }> {
    const t0 = performance.now();
    const trace: MixerTrace = {
      examId: '', examResolved: false, mode: request.mode, requestedCount: request.questionCount || 0,
      finalCount: 0, bySource: { CANONICAL_PYQ: 0, PYQ_PATTERN: 0, REFERENCE_BOOK: 0, GENERATED: 0 },
      rejectedCount: 0, rejectionReasons: {}, retrievalMs: 0, rankingMs: 0, generationMs: 0, validationMs: 0, totalMs: 0,
    };

    // ── 1. resolveExamContext ────────────────────────────────────────────────────────────────
    const resolved = await detectExamId(request.examQuery).catch(() => null);
    const examId = resolved || request.examQuery.trim().toUpperCase().replace(/[\s_-]+/g, '_');
    trace.examId = examId;
    trace.examResolved = Boolean(resolved);

    // ── 2. resolveBlueprint ───────────────────────────────────────────────────────────────────
    const blueprint = await blueprintResolverService.resolve({
      examId, examResolved: trace.examResolved, mode: request.mode,
      totalQuestions: request.questionCount,
      subjectIds: request.subjectIds,
      sourceDistributionOverride: request.sourceDistribution,
    });
    trace.requestedCount = blueprint.totalQuestions;

    // ── 3. resolveSyllabusScope: ANY single-topic ask (weak-area drill, an explicit syllabus
    // node, or a plain topic search) narrows to ONE focused section instead of the full
    // multi-subject blueprint — mode only changes the source mix used within it, not whether the
    // request gets narrowed at all. This used to require mode === 'WEAK_AREA_DRILL' specifically,
    // so a PRACTICE-mode topic search silently fell back to the whole exam's section structure.
    const weakScope = (request.studentWeakAreas || []).filter(w => w.syllabusNodeId || w.topic);
    const sections: SectionBlueprint[] = weakScope.length > 0
      ? [{
          sectionId: 'weak-area', name: weakScope.map(w => w.topic).join(', '),
          // subjectId was previously dropped here, so retrieveCanonicalCandidates' broadened
          // fallback queried `subject: <topic name>` instead of the real subject — "Thermodynamics"
          // is never a valid `subject` value in the corpus (only "Physics"/"Chemistry"/
          // "Mathematics" are), so both the exact and the broadened query silently returned
          // nothing. Confirmed live: JEE_MAIN CANONICAL_PYQ went from 0/6 to real retrieved
          // questions once this was wired through.
          subjectId: weakScope[0]?.subject,
          questionCount: blueprint.totalQuestions,
          syllabusNodeIds: weakScope.map(w => w.syllabusNodeId).filter(Boolean) as string[],
          topicNames: weakScope.map(w => w.topic),
          sourceDistribution: blueprint.sourceDistribution,
          difficultyDistribution: blueprint.difficultyDistribution,
        }]
      : blueprint.sections;

    // ── 4-9. Per section: retrieve, rank, dedupe, fill gaps with generation ────────────────────
    const tRetrieveStart = performance.now();
    const excludeIds = new Set(request.excludeQuestionIds || []);
    const accepted: QuestionCandidate[] = [];
    const seenDedupeKeys = new Set<string>();
    const bySection: Record<string, number> = {};

    for (const section of sections) {
      const sourceDist = section.sourceDistribution || blueprint.sourceDistribution!;
      // Resolve the ask against the corpus's real vocabulary once, so every source below searches
      // the same concrete topic (or the same whole subject) — see resolveDrillScope.
      const scope = await resolveDrillScope(examId, section.subjectId, section.topicNames?.[0] || section.name);
      const topic = scope.topic;
      const subject = scope.subject;
      trace.scope = { subject, topic, topicResolved: Boolean(scope.rawTopics), subjectOnly: scope.subjectOnly };

      const wantCanonical = Math.round(section.questionCount * sourceDist.canonicalPyq);
      const wantPattern = Math.round(section.questionCount * sourceDist.pyqPattern);
      const wantReference = Math.round(section.questionCount * sourceDist.referenceBook);
      // Generated fills whatever's left after the others, rather than its own rounded share —
      // this is the "generation fills gaps, doesn't dominate by rounding luck" rule (spec §19).
      const wantGenerated = Math.max(0, section.questionCount - wantCanonical - wantPattern - wantReference);

      const sectionAccepted: QuestionCandidate[] = [];

      // CANONICAL_PYQ — real retrieval, never generated. One pool serves both the real PYQs and the
      // pattern exemplars, so the exemplars are the same topic and the query runs once.
      const pyqPool = await this.retrieveCanonicalCandidates(examId, scope, Math.max(wantCanonical * 3, 12));
      const pickedCanonical = this.pickAndDedupe(pyqPool, wantCanonical, excludeIds, seenDedupeKeys);
      sectionAccepted.push(...pickedCanonical);

      // PYQ_PATTERN — historical questions inform generation; never presented as the PYQ itself.
      if (wantPattern > 0) {
        const usedIds = new Set(pickedCanonical.map((c) => c.id));
        const groundingPool = pyqPool.filter((c) => !usedIds.has(c.id)).slice(0, 8);
        const generated = await this.generatePatternGrounded(examId, subject, topic, groundingPool, wantPattern, section.difficultyDistribution || blueprint.difficultyDistribution);
        sectionAccepted.push(...this.pickAndDedupe(generated, wantPattern, excludeIds, seenDedupeKeys));
      }

      // REFERENCE_BOOK — real passages retrieved, generation grounded in them. examCode-scoped:
      // without it, a JEE Main physics request could surface Lucent GK's General Science section
      // just on semantic similarity — the same cross-exam leak this architecture exists to prevent,
      // just for reference material instead of PYQs. The current reference corpus (Lucent GK/
      // Science, S.Chand Quant/Reasoning/English) only declares SSC/UPSC/state-PSC relevance, so
      // this correctly returns nothing for JEE/NEET today rather than a false-relevant hit.
      if (wantReference > 0) {
        // 1. Real indexed reference-book MCQs (Neetu Singh, S. Chand, Lucent…) on THIS topic — a
        // subject-only match used to hand an Algebra drill Number-System questions. Topic drills
        // only take same-topic questions; subject-level drills take any from the subject.
        let refCandidates: QuestionCandidate[] = [];
        try {
          const bank = await drillTopicsService.referenceQuestions(examId, subject, scope.subjectOnly ? undefined : topic);
          refCandidates = shuffle(bank).map((bq) => ({
            id: `ref_${bq.id}`,
            text: bq.text,
            options: bq.options,
            correctAnswerIndex: bq.correctAnswerIndex,
            explanation: bq.explanation || '',
            topic: bq.topic,
            subject: bq.subject,
            examId,
            difficulty: bq.difficulty as any,
            sourceType: 'REFERENCE_BOOK' as const,
            referenceBookId: bq.book,
            referenceBookTitle: bq.book,
            referenceChapter: bq.chapter || bq.topic,
            referenceChunkId: `question_bank/${bq.id}`,
            dedupeKey: normalizeForDedupe(bq.text),
          }));
        } catch {}

        const pickedRef = this.pickAndDedupe(refCandidates, wantReference, excludeIds, seenDedupeKeys);
        sectionAccepted.push(...pickedRef);

        // 2. If still short, generate from reference passages — but only passages whose chapter is
        // about this topic. Semantic search alone returned "Problems on Ages" for an Algebra drill,
        // and the question was then labelled with that chapter.
        const stillNeedRef = wantReference - pickedRef.length;
        if (stillNeedRef > 0) {
          const retrieved = await referenceBooksService.retrieveReferenceContext(`${subject} ${topic}`, { topK: 8, examCode: examId }).catch(() => []);
          const wanted = topicTokens(topic);
          const passages = scope.subjectOnly ? retrieved : retrieved.filter((p) => {
            const md: any = p.metadata || {};
            return tokensOverlap(wanted, topicTokens(`${md.chapter || ''} ${md.section || ''} ${md.topic || ''} ${md.category || ''}`));
          });
          if (passages.length > 0) {
            const generated = await this.generateReferenceGrounded(
              examId, subject, topic, passages, stillNeedRef, section.difficultyDistribution || blueprint.difficultyDistribution, pyqPool.slice(0, 3)
            );
            sectionAccepted.push(...this.pickAndDedupe(generated, stillNeedRef, excludeIds, seenDedupeKeys));
          }
        }
      }

      // GENERATED — fills whatever's left, including anything the sources above came up short on
      // (a thin corpus for this topic, or a reference lookup that returned nothing).
      const stillShort = section.questionCount - sectionAccepted.length;
      if (stillShort > 0) {
        const generated = await this.generatePlain(examId, subject, topic, stillShort, section.difficultyDistribution || blueprint.difficultyDistribution);
        sectionAccepted.push(...this.pickAndDedupe(generated, stillShort, excludeIds, seenDedupeKeys));
      }

      for (const c of sectionAccepted) (c as any)._section = section.sectionId;
      bySection[section.sectionId] = sectionAccepted.length;
      accepted.push(...sectionAccepted);
    }
    trace.retrievalMs = performance.now() - tRetrieveStart;

    // ── 10. validate ────────────────────────────────────────────────────────────────────────
    const tValidateStart = performance.now();
    const validated = accepted.filter((c) => {
      const reason = this.validateCandidate(c, examId);
      if (reason) {
        trace.rejectedCount++;
        trace.rejectionReasons[reason] = (trace.rejectionReasons[reason] || 0) + 1;
        return false;
      }
      trace.bySource[c.sourceType]++;
      return true;
    });
    trace.validationMs = performance.now() - tValidateStart;
    trace.finalCount = validated.length;
    trace.bySection = bySection;
    trace.totalMs = performance.now() - t0;

    logger.info('[QuestionMixer] built', {
      examId, mode: request.mode, requested: trace.requestedCount, final: trace.finalCount,
      bySource: trace.bySource, rejected: trace.rejectedCount, totalMs: Math.round(trace.totalMs),
    });

    return { blueprint, questions: validated, trace };

    function bySectionKey(c: QuestionCandidate): string { return (c as any)._section; }
  }

  // ── Retrieval ────────────────────────────────────────────────────────────────────────────

  private async retrieveCanonicalCandidates(examId: string, scope: DrillScope, limit: number): Promise<QuestionCandidate[]> {
    if (limit <= 0) return [];
    // Match the corpus's own stored values: every spelling of the resolved topic ("Percentage",
    // "Percentage — RS Aggarwal / Lucent Maths"), or every spelling of the subject for a
    // subject-level drill. A topic the corpus doesn't tag gets NO PYQs — it used to broaden to the
    // whole subject, which is how an Algebra drill could be padded with any Quant question.
    const field = scope.rawTopics ? 'topic' : scope.subjectOnly ? 'subject' : null;
    const values = scope.rawTopics || (scope.subjectOnly ? scope.rawSubjects : []);
    if (!field || values.length === 0) return [];

    // Over-fetch then sample, so repeating a drill doesn't serve the same first N documents.
    const fetchN = Math.min(Math.max(limit * 4, 40), 120);
    const rows: CanonicalPYQQuestion[] = [];
    for (let i = 0; i < values.length; i += 30) {
      const snap = await db.collection('pyq_questions')
        .where('examId', '==', examId)
        .where(field, 'in', values.slice(i, i + 30))
        .limit(fetchN)
        .get()
        .catch((e: any) => { logger.warn('[QuestionMixer] PYQ retrieval failed', { examId, field, error: e?.message }); return null; });
      snap?.docs.forEach((d) => rows.push({ questionId: d.id, ...(d.data() as any) }));
      if (rows.length >= fetchN) break;
    }
    return shuffle(rows)
      // Template rows are unverified "Practice Set" items with no source — never a PYQ.
      .filter(q => (q as any).origin !== 'template')
      .filter(q => Array.isArray(q.options) && q.options.length >= 2 && q.questionText)
      .filter(q => !isUnrenderablePyq(q.questionText))
      .map(q => ({
        id: `pyq_${q.questionId}`,
        text: q.questionText,
        options: q.options as string[],
        correctAnswerIndex: resolveCorrectIndex(q.correctAnswer, q.options as string[]),
        explanation: q.explanation || q.solution || '',
        // "Percentage — RS Aggarwal / Lucent Maths" → "Percentage": the importer's note isn't the topic.
        topic: displayTopic(q.topic || q.chapter) || scope.topic,
        subject: q.subject,
        examId: q.examId,
        syllabusNodeId: q.syllabusNodeId,
        difficulty: q.difficulty,
        sourceType: 'CANONICAL_PYQ' as const,
        sourcePyqId: q.questionId,
        sourceYear: q.year,
        sourceShift: q.shift,
        sourcePaper: q.paper,
        canonicalPaperId: (q as any).canonicalPaperId,
        dedupeKey: q.contentHash || normalizeForDedupe(q.questionText),
      }));
  }

  // ── Generation (gap-filling only) ───────────────────────────────────────────────────────────

  private async generatePatternGrounded(
    examId: string, subject: string, topic: string, groundingPool: QuestionCandidate[], count: number, difficulty: any,
  ): Promise<QuestionCandidate[]> {
    // No real exemplars → nothing to pattern on. Return nothing and let the GENERATED slot fill the
    // gap in ONE call; generating here too made two independent calls that wrote the same question.
    if (groundingPool.length === 0) return [];
    const groundingText = groundingPool.slice(0, 6).map((c, i) =>
      `[${i + 1}] ${c.text}\nOptions: ${c.options.join(' | ')}\nAnswer: ${c.options[c.correctAnswerIndex]}`
    ).join('\n\n');
    const questions = await this.callLlm({
      count, examId, subject, topic, difficulty,
      instruction: `Study the real historical questions below and write NEW questions that match their topic, structure, difficulty and style. Do NOT copy any of them verbatim — write genuinely new questions in the same pattern.\n\nHistorical reference questions (for pattern only — do not reproduce):\n${groundingText}`,
    });
    return questions.map((q) => ({
      ...q, sourceType: 'PYQ_PATTERN' as const, examId, subject, topic,
      groundingQuestionIds: groundingPool.slice(0, 6).map(c => c.sourcePyqId).filter(Boolean) as string[],
      dedupeKey: normalizeForDedupe(q.text),
    }));
  }

  private async generateReferenceGrounded(
    examId: string, subject: string, topic: string, passages: RetrievalResult[], count: number, difficulty: any, groundingPyqs?: QuestionCandidate[],
  ): Promise<QuestionCandidate[]> {
    const groundingText = passages.slice(0, 5).map((p, i) => `[Textbook Excerpt ${i + 1}] ${p.text || ''}`).join('\n\n');
    let exemplarText = '';
    if (groundingPyqs && groundingPyqs.length > 0) {
      exemplarText = `\n\nReal ${examId} previous-year question exemplars (format & difficulty):\n` +
        groundingPyqs.slice(0, 3).map((q, i) => `[Exemplar ${i + 1}] ${q.text}\nOptions: ${q.options.join(' | ')}\nAnswer: ${q.options[q.correctAnswerIndex]}`).join('\n\n');
    }

    const questions = await this.callLlm({
      count, examId, subject, topic, difficulty,
      instruction: `Base every question strictly on the factual concepts, formulas, and rules in the reference textbook material below, and only on the topic "${topic}". Match the concise style, 4-option structure, and difficulty level of the previous-year exemplars.\n\nReference material:\n${groundingText}${exemplarText}`,
    });
    // Label with the passage these questions were grounded in (already filtered to this topic).
    const first: any = passages[0]?.metadata || {};
    return questions.map((q) => ({
      ...q, sourceType: 'REFERENCE_BOOK' as const, examId, subject, topic,
      referenceBookId: first.book,
      referenceBookTitle: first.book_title || first.title,
      referenceChapter: first.chapter,
      referenceChunkId: first.chunk_id || first.chunkId || passages[0]?.source,
      dedupeKey: normalizeForDedupe(q.text),
    }));
  }

  private async generatePlain(examId: string, subject: string, topic: string, count: number, difficulty: any): Promise<QuestionCandidate[]> {
    if (count <= 0) return [];
    const questions = await this.callLlm({
      count, examId, subject, topic, difficulty,
      instruction: `Write exam-realistic questions for this exam and topic using your general knowledge of the subject.`,
    });
    return questions.map((q) => ({ ...q, sourceType: 'GENERATED' as const, examId, subject, topic, dedupeKey: normalizeForDedupe(q.text) }));
  }

  private async callLlm(args: { count: number; examId: string; subject: string; topic: string; difficulty: any; instruction: string }): Promise<Omit<QuestionCandidate, 'sourceType' | 'dedupeKey'>[]> {
    if (args.count <= 0) return [];
    const system = 'You are an expert exam question writer. You output STRICTLY valid JSON only — no markdown fences, no commentary, no trailing text.';
    const prompt = `Create exactly ${args.count} multiple-choice questions for the exam "${args.examId}", subject "${args.subject}", topic "${args.topic}".

${args.instruction}

Rules:
- Each question has EXACTLY 4 options, exactly one correct.
- "correctAnswerIndex" is the 0-based index of the correct option.
- Keep each explanation to 1-2 sentences.

Output ONLY a JSON array: [{"text":"...","options":["a","b","c","d"],"correctAnswerIndex":0,"explanation":"..."}]`;

    try {
      const resp = await llm.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }], system, { userId: 'question-mixer', operation: 'question_mixer_generation' });
      let raw = (resp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = raw.indexOf('['), end = raw.lastIndexOf(']');
      if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
      // Raw newlines/tabs inside string values are invalid JSON and used to drop a whole slot
      // ("Bad control character in string literal"); outside strings they're just whitespace.
      raw = raw.replace(/[\u0000-\u001F]+/g, ' ');
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed) ? parsed : [])
        .filter((q: any) => q && Array.isArray(q.options) && q.options.length >= 2 && q.text)
        .slice(0, args.count)
        .map((q: any, i: number) => {
          const options = q.options.map((o: any) => String(o));
          return {
            id: `gen_${Date.now()}_${i}`, text: String(q.text || '').trim(), options,
            correctAnswerIndex: resolveCorrectIndex(q.correctAnswerIndex ?? q.correctAnswer, options),
            explanation: String(q.explanation || '').trim(), topic: args.topic,
          };
        });
    } catch (e: any) {
      logger.warn('[QuestionMixer] generation call failed, returning no candidates for this slot', { error: e?.message });
      return [];
    }
  }

  // ── Ranking / dedup / distribution ──────────────────────────────────────────────────────────

  private pickAndDedupe(pool: QuestionCandidate[], want: number, excludeIds: Set<string>, seenKeys: Set<string>): QuestionCandidate[] {
    if (want <= 0) return [];
    const picked: QuestionCandidate[] = [];
    for (const c of pool) {
      if (picked.length >= want) break;
      if (c.sourcePyqId && excludeIds.has(c.sourcePyqId)) continue;
      if (seenKeys.has(c.dedupeKey)) continue;
      // Near-duplicate check against everything already accepted this run — cheap since pools per
      // section are small (tens, not thousands), so O(n^2) shingle comparison here is negligible.
      const isNearDup = [...seenKeys].some((k) => shingleJaccard(k, c.dedupeKey) >= NEAR_DUP_THRESHOLD || isRewordedDuplicate(k, c.dedupeKey));
      if (isNearDup) continue;
      seenKeys.add(c.dedupeKey);
      picked.push(c);
    }
    return picked;
  }

  private validateCandidate(c: QuestionCandidate, examId: string): string | null {
    if (!c.text || c.text.trim().length < 5) return 'empty_text';
    if (!Array.isArray(c.options) || c.options.length < 2) return 'insufficient_options';
    if (c.correctAnswerIndex < 0 || c.correctAnswerIndex >= c.options.length) return 'invalid_correct_index';
    if (c.examId && c.examId !== examId) return 'exam_mismatch'; // cross-exam firewall, per-candidate
    if (c.sourceType === 'CANONICAL_PYQ' && !c.sourcePyqId) return 'canonical_missing_provenance';
    if (c.sourceType === 'REFERENCE_BOOK' && !c.referenceChunkId && !c.referenceBookId) return 'reference_missing_provenance';
    if (c.sourceType === 'PYQ_PATTERN' && (!c.groundingQuestionIds || c.groundingQuestionIds.length === 0)) return 'pattern_missing_grounding';
    return null;
  }
}

export const questionMixerService = new QuestionMixerService();
