"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalPyqRetrievalService = exports.CanonicalPyqRetrievalService = void 0;
/**
 * Canonical PYQ retrieval — structured lookup of real papers from the verified corpus.
 *
 * This is a retrieval *source*, not an orchestrator: `RetrievalOrchestrator` calls it the same way
 * it calls `referenceBooksService`. There is still exactly one orchestration path.
 *
 * ── Why this is not vector search ───────────────────────────────────────────────────────────
 * "Give me the complete SSC CGL 2022 Shift 1 paper" is a request for a specific, ordered set of
 * records. Nearest-neighbour search answers a different question — it returns whatever is
 * semantically closest, in similarity order, from any sitting. Assembling a "paper" that way
 * produces a plausible-looking set of questions that never sat together, which is a fabrication
 * even when every individual question is real. So exact requests go to Firestore by
 * `canonicalPaperId` and come back ordered by `questionNumber`. Semantic search keeps its place
 * for topic discovery, where "close enough" is exactly what the student wants.
 *
 * ── Why it reports partial papers ───────────────────────────────────────────────────────────
 * Some sittings are only partly ingested. Returning 73 of 100 questions under the heading of a
 * complete paper is the same class of error as inventing the other 27 — the student cannot tell.
 * Every result therefore carries counts and an explicit status.
 */
const firebase_1 = require("../../config/firebase");
const logger_1 = require("../../utils/logger");
const paperIdentity_1 = require("./paperIdentity");
const MAX_PAPER_QUESTIONS = 400;
/**
 * How many questions go into one prompt.
 *
 * A full SSC CGL 2022 Shift 1 group is 299 records — 137KB of context, which made generation fail
 * outright: the student got citations and then silence. A capped, explicitly-labelled slice is
 * both answerable and honest; the count of what was withheld is stated so nothing looks complete
 * when it is not.
 */
const MAX_CONTEXT_QUESTIONS = 40;
/** Firestore equality queries only; no ordering constraint that would need a composite index. */
async function queryQuestions(filters, limit) {
    let q = firebase_1.db.collection('pyq_questions');
    for (const [field, op, value] of filters)
        q = q.where(field, op, value);
    const snap = await q.limit(limit).get();
    return snap.docs.map((d) => d.data());
}
/**
 * Canonical exam order.
 *
 * `questionNumber` is the paper's own numbering and is the only defensible order. Records without
 * one sort last rather than being dropped — a question with no number is still a real question,
 * and discarding it would understate the paper.
 */
function byQuestionNumber(a, b) {
    const an = typeof a.questionNumber === 'number' ? a.questionNumber : Number.MAX_SAFE_INTEGER;
    const bn = typeof b.questionNumber === 'number' ? b.questionNumber : Number.MAX_SAFE_INTEGER;
    if (an !== bn)
        return an - bn;
    return String(a.questionId).localeCompare(String(b.questionId));
}
class CanonicalPyqRetrievalService {
    /**
     * Find the papers matching a request, narrowing only by what the student actually specified.
     *
     * Candidates come from the questions themselves (grouped by `canonicalPaperId`) rather than from
     * the registry, because the registry describes documents while the student is asking for
     * content. A sitting with no resolved identity is still reported, so a request never silently
     * misses questions that exist but are unattributed.
     */
    async resolvePapers(params) {
        const { examId, year, shift, paper } = params;
        const filters = [['examId', '==', examId]];
        if (year)
            filters.push(['year', '==', year]);
        const rows = await queryQuestions(filters, 5000);
        if (rows.length === 0)
            return [];
        const groups = new Map();
        for (const r of rows) {
            // Narrow by the question's own normalized shift/paper, falling back gracefully
            const questionShift = r.normalizedShift ?? (r.shift ? (0, paperIdentity_1.normalizeShift)(r.shift).shift : null);
            if (shift !== null && shift !== undefined && questionShift !== shift)
                continue;
            if (paper && !(0, paperIdentity_1.matchesPaper)(paper, r))
                continue;
            const derivedId = r.canonicalPaperId || (0, paperIdentity_1.canonicalPaperIdFor)({
                examId: r.examId || examId,
                year: r.year || year || 0,
                session: r.session,
                shift: r.shift,
                paper: r.paper,
                subject: r.subject,
            });
            const key = derivedId;
            const existing = groups.get(key);
            if (existing) {
                existing.questionCount++;
                existing.questions?.push(r);
            }
            else {
                groups.set(key, {
                    canonicalPaperId: derivedId,
                    examId: r.examId,
                    year: r.year ?? null,
                    session: r.session ?? null,
                    shift: r.shift ?? null,
                    paper: r.paper ?? null,
                    questionCount: 1,
                    questions: [r],
                });
            }
        }
        return [...groups.values()].sort((a, b) => b.questionCount - a.questionCount);
    }
    /** Every question on one canonical paper, in exam order. */
    async fetchPaper(canonicalPaperId) {
        let rows = await queryQuestions([['canonicalPaperId', '==', canonicalPaperId]], MAX_PAPER_QUESTIONS);
        if (rows.length === 0) {
            // Fallback if canonicalPaperId was not written to Firestore docs
            const parts = canonicalPaperId.split(':');
            if (parts.length >= 6) {
                const [, examId, yearStr, , sh, pap] = parts;
                const year = yearStr !== 'na' && !isNaN(Number(yearStr)) ? Number(yearStr) : undefined;
                const shiftNum = sh.startsWith('sh') ? Number(sh.slice(2)) : null;
                const candidateRows = await queryQuestions([['examId', '==', examId], ...(year ? [['year', '==', year]] : [])], MAX_PAPER_QUESTIONS);
                rows = candidateRows.filter((r) => {
                    const qShift = r.normalizedShift ?? (r.shift ? (0, paperIdentity_1.normalizeShift)(r.shift).shift : null);
                    if (shiftNum !== null && qShift !== shiftNum)
                        return false;
                    if (pap !== 'na' && !(0, paperIdentity_1.matchesPaper)(pap, r))
                        return false;
                    return true;
                });
            }
        }
        return rows.sort(byQuestionNumber);
    }
    /**
     * A paper as a document the UI can render, paged — not as LLM context.
     *
     * These are two different problems that were being solved by one mechanism. The 40-question cap
     * exists because a 299-record paper is 137KB of prompt and generation returns nothing; it should
     * never have been the limit on what a *student* can see. This path has no model in it, so it
     * carries the whole paper a page at a time with every field intact.
     *
     * `sittingId` narrows further than `canonicalPaperId` can: a registry paper group such as
     * "Session 1, Shift 1" spans several dated sittings, and asking for one of them should return
     * that sitting rather than the group.
     */
    async getPaperPage(params) {
        const page = Math.max(1, Number(params.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(params.pageSize ?? 40)));
        const field = params.sittingId ? 'sittingId' : 'canonicalPaperId';
        const value = params.sittingId ?? params.canonicalPaperId;
        if (!value) {
            return { paper: null, totalQuestions: 0, page, pageSize, totalPages: 0, incompleteCount: 0, distinctSittings: [], questions: [] };
        }
        let all = (await queryQuestions([[field, '==', value]], MAX_PAPER_QUESTIONS)).sort(byQuestionNumber);
        if (all.length === 0 && params.canonicalPaperId) {
            all = await this.fetchPaper(params.canonicalPaperId);
        }
        if (all.length === 0) {
            return { paper: null, totalQuestions: 0, page, pageSize, totalPages: 0, incompleteCount: 0, distinctSittings: [], questions: [] };
        }
        const first = all[0];
        const incompleteCount = all.filter((q) => !q.questionText || String(q.questionText).trim().length < 5).length;
        const distinctSittings = [...new Set(all.map((q) => q.sittingId).filter(Boolean))];
        return {
            paper: {
                canonicalPaperId: first.canonicalPaperId ?? null,
                sittingId: params.sittingId ?? (distinctSittings.length === 1 ? distinctSittings[0] : null),
                examId: first.examId ?? null, examName: first.examName ?? null, year: first.year ?? null,
                session: first.session ?? null, shift: first.shift ?? null, paper: first.paper ?? null,
                sittingDate: first.normalizedSittingDate ?? null, sittingSource: first.sittingSource ?? null,
            },
            totalQuestions: all.length,
            page, pageSize,
            totalPages: Math.ceil(all.length / pageSize),
            incompleteCount,
            distinctSittings,
            questions: all.slice((page - 1) * pageSize, page * pageSize),
        };
    }
    /** The registry's own expectation for a paper, when it records one. */
    async expectedCountFor(examId, year) {
        if (!year)
            return null;
        try {
            const snap = await firebase_1.db.collection('pyq_source_registry')
                .where('examId', '==', examId).where('year', '==', year).limit(20).get();
            const counts = snap.docs
                .map((d) => d.data().questionCountDiscovered)
                .filter((n) => typeof n === 'number' && n > 0);
            return counts.length ? Math.max(...counts) : null;
        }
        catch {
            return null;
        }
    }
    /**
     * The entry point the orchestrator calls.
     *
     * Returns NOT_AVAILABLE_IN_VERIFIED_CORPUS rather than an empty success when the corpus holds
     * nothing — the caller must be able to tell "we have none" from "we found none this time", so
     * that the prompt can forbid reconstruction instead of inviting it.
     */
    async retrieve(params) {
        const { examId, year = null, shift = null, paper = null } = params;
        const empty = (diagnostics) => ({
            status: 'NOT_AVAILABLE_IN_VERIFIED_CORPUS',
            papers: [], questions: [], retrievedCount: 0,
            expectedCount: null, missingCount: null, incompleteCount: 0, diagnostics,
        });
        const papers = await this.resolvePapers({ examId, year, shift, paper });
        if (papers.length === 0) {
            return empty(`No ${examId}${year ? ` ${year}` : ''} questions in the verified corpus.`);
        }
        // More than one sitting matched and the student did not say which.
        if (papers.length > 1 && shift === null && !paper) {
            return {
                status: 'AMBIGUOUS_PAPER',
                papers, questions: [], retrievedCount: 0,
                expectedCount: null, missingCount: null, incompleteCount: 0,
                diagnostics: `${papers.length} ${examId}${year ? ` ${year}` : ''} papers are available; the request did not name one.`,
            };
        }
        const chosen = papers[0];
        let questions = chosen.questions ?? [];
        if (questions.length === 0 && chosen.canonicalPaperId) {
            questions = await this.fetchPaper(chosen.canonicalPaperId);
        }
        questions = questions.sort(byQuestionNumber);
        if (questions.length > MAX_PAPER_QUESTIONS) {
            questions = questions.slice(0, MAX_PAPER_QUESTIONS);
        }
        const incompleteCount = questions.filter((q) => !q.questionText || String(q.questionText).trim().length < 5).length;
        const expectedCount = await this.expectedCountFor(examId, year);
        const missingCount = expectedCount ? Math.max(0, expectedCount - questions.length) : null;
        const status = questions.length === 0 ? 'NOT_AVAILABLE_IN_VERIFIED_CORPUS'
            : (missingCount && missingCount > 0) || incompleteCount > 0 ? 'PARTIAL_CANONICAL_PAPER'
                : 'CANONICAL_RETRIEVED';
        logger_1.logger.info('[CanonicalPYQ] retrieval', {
            examId, year, shift, paper: chosen.canonicalPaperId,
            retrieved: questions.length, expected: expectedCount, incomplete: incompleteCount, status,
        });
        return {
            status, papers, questions,
            retrievedCount: questions.length,
            expectedCount, missingCount, incompleteCount,
            diagnostics: `${questions.length} canonical questions from ${chosen.canonicalPaperId}` +
                (expectedCount ? `; registry expects ${expectedCount}` : '') +
                (incompleteCount ? `; ${incompleteCount} record(s) lack question text` : ''),
        };
    }
    /**
     * Renders retrieved questions for the model, preserving the fields that make them canonical.
     *
     * Metadata is kept inline rather than flattened away: the model is being asked to present
     * records, not to recall them, and the question number, options, answer and source are the
     * difference between presenting and reciting.
     */
    toContextBlock(result, maxQuestions = MAX_CONTEXT_QUESTIONS) {
        if (result.questions.length === 0)
            return '';
        const first = result.questions[0];
        const header = [
            first.examName || first.examId,
            first.year,
            first.session,
            first.shift ? (/shift/i.test(String(first.shift)) ? first.shift : `Shift ${first.shift}`) : null,
            first.paper,
        ].filter(Boolean).join(' · ');
        let out = `=== CANONICAL PREVIOUS-YEAR QUESTIONS (VERIFIED CORPUS) ===\n`;
        out += `Paper: ${header}\n`;
        out += `Canonical paper id: ${first.canonicalPaperId || (result.papers[0] && result.papers[0].canonicalPaperId)}\n`;
        out += `Records retrieved: ${result.retrievedCount}`;
        if (result.expectedCount)
            out += ` of ${result.expectedCount} expected`;
        out += `\nStatus: ${result.status}\n\n`;
        for (const q of result.questions) {
            out += `Q${q.questionNumber ?? '?'}. ${q.questionText ?? '(question text not extracted)'}\n`;
            const opts = Array.isArray(q.options)
                ? q.options.map((t, i) => `${String.fromCharCode(65 + i)}. ${t}`)
                : Object.entries(q.options ?? {}).map(([k, v]) => `${String(k).toUpperCase()}. ${v}`);
            for (const o of opts)
                out += `   ${o}\n`;
            if (q.correctAnswer)
                out += `   Answer: ${q.correctAnswer}\n`;
            const meta = [q.subject, q.topic, q.difficulty, q.verificationStatus].filter(Boolean).join(' | ');
            if (meta)
                out += `   [${meta}]\n`;
            out += `   [questionId: ${q.questionId}]\n\n`;
        }
        return out;
    }
}
exports.CanonicalPyqRetrievalService = CanonicalPyqRetrievalService;
exports.canonicalPyqRetrievalService = new CanonicalPyqRetrievalService();
