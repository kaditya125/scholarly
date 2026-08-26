import { db } from '../../config/firebase';
import { validateSyllabusNodeIdsBatch } from '../exam/syllabusNodeIdentity';
import { logger } from '../../utils/logger';

/**
 * The single authoritative gate for putting a past-year question in front of a student.
 *
 * Every consumer — planner, quiz generator, chat, the PYQ practice surface — asks this and only
 * this. Separate eligibility rules per consumer is how a question ends up excluded from one
 * surface and served by another.
 *
 * ── Why the declared governance state is NOT sufficient ─────────────────────────────────────
 * A live audit of the corpus on 2026-08-27 found all 774 questions declaring the highest possible
 * trust: verificationStatus OFFICIAL_CONFIRMED, rightsStatus OFFICIAL_SOURCE_REVIEWED,
 * redistributionAllowed true, and not one QUARANTINED. If those fields were the gate, the gate
 * would pass everything.
 *
 * The same audit found, against the same records:
 *   · 0 of 12 sampled cited source URLs resolve — every one returns 404
 *   · 188 question texts occur more than once (570 distinct texts across 774 questions), including
 *     the same text under different question numbers of the same paper, which cannot happen in a
 *     real exam
 *   · 10 records carry a contentHash that is the literal string "hash_…" rather than a digest
 *
 * A record asserting its own authenticity is a claim, not evidence. So eligibility requires
 * INDEPENDENT corroboration that something outside the record itself confirms: a source that
 * actually resolves, verified by us and stamped with when. Until that pass has run, nothing is
 * eligible — which is the correct and safe default, not a bug.
 *
 * The alternative — trusting the self-assertion — would put questions citing dead NTA URLs into a
 * student's mastery record as evidence of what they know about a real exam they are about to sit.
 */

/** Why a question may not be served. Structured so callers branch on a code. */
export type PyqIneligibilityCode =
  | 'NOT_VERIFIED'
  | 'RIGHTS_NOT_CLEARED'
  | 'QUARANTINED'
  | 'PROVENANCE_UNVERIFIED'
  | 'SOURCE_UNREACHABLE'
  | 'DUPLICATE_TEXT'
  | 'NODE_MISSING'
  | 'NODE_INVALID'
  | 'WRONG_EXAM';

export interface PyqEligibility {
  eligible: boolean;
  reasons: PyqIneligibilityCode[];
}

/** Declared states that are necessary — but, as above, nowhere near sufficient. */
const ACCEPTED_VERIFICATION = new Set(['OFFICIAL_CONFIRMED', 'MULTI_SOURCE_CONFIRMED']);
const ACCEPTED_RIGHTS = new Set(['OFFICIAL_SOURCE_REVIEWED', 'PUBLIC_DOMAIN_OR_CLEAR', 'LICENSED']);
const BLOCKED_INGESTION = new Set(['QUARANTINED', 'DISCOVERED', 'SOURCE_REVIEWED', 'EXTRACTED']);

/**
 * The independent-corroboration stamp.
 *
 * Written only by a verification pass that actually fetched the cited source and confirmed it
 * resolves. Deliberately a DIFFERENT field from anything the ingestion pipeline sets, so a
 * generator cannot mark its own output as corroborated by filling in the fields it already
 * controls.
 */
export interface ProvenanceStamp {
  sourceVerifiedAt: number;
  sourceHttpStatus: number;
  verifiedBy: string;
}

export interface PyqRecordForGate {
  id?: string;
  examId?: string;
  syllabusNodeId?: string;
  verificationStatus?: string;
  rightsStatus?: string;
  ingestionState?: string;
  redistributionAllowed?: boolean;
  sourceUrl?: string;
  questionText?: string;
  /** Absent on every record today. See the note above — that is why nothing is eligible yet. */
  provenanceStamp?: ProvenanceStamp;
}

/**
 * Evaluate one question against every gate.
 *
 * `nodeValid` and `textIsDuplicate` are passed in rather than looked up, so a batch can resolve
 * both once for the whole corpus instead of per question.
 */
export function evaluatePyqEligibility(
  pyq: PyqRecordForGate,
  ctx: { examId: string; nodeValid: boolean; nodeCode?: string; textIsDuplicate: boolean },
): PyqEligibility {
  const reasons: PyqIneligibilityCode[] = [];

  // ── declared governance: necessary ────────────────────────────────────────────────────
  if (!ACCEPTED_VERIFICATION.has(String(pyq.verificationStatus))) reasons.push('NOT_VERIFIED');
  if (!ACCEPTED_RIGHTS.has(String(pyq.rightsStatus)) || pyq.redistributionAllowed !== true) {
    reasons.push('RIGHTS_NOT_CLEARED');
  }
  if (BLOCKED_INGESTION.has(String(pyq.ingestionState))) reasons.push('QUARANTINED');

  // ── independent corroboration: the part that is actually load-bearing ─────────────────
  if (!pyq.provenanceStamp?.sourceVerifiedAt) {
    reasons.push('PROVENANCE_UNVERIFIED');
  } else {
    const s = pyq.provenanceStamp.sourceHttpStatus;
    if (!(s >= 200 && s < 400)) reasons.push('SOURCE_UNREACHABLE');
  }

  /*
   * Two different questions of one paper cannot share their text. Where they do, at least one is
   * generated, and there is no way to tell which — so neither is served.
   */
  if (ctx.textIsDuplicate) reasons.push('DUPLICATE_TEXT');

  // ── syllabus identity ────────────────────────────────────────────────────────────────
  if (!pyq.syllabusNodeId) reasons.push('NODE_MISSING');
  else if (ctx.nodeCode === 'WRONG_EXAM') reasons.push('WRONG_EXAM');
  else if (!ctx.nodeValid) reasons.push('NODE_INVALID');

  const wantExam = ctx.examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  if (pyq.examId && pyq.examId.toUpperCase() !== wantExam) {
    if (!reasons.includes('WRONG_EXAM')) reasons.push('WRONG_EXAM');
  }

  return { eligible: reasons.length === 0, reasons };
}

export interface EligibilityReport {
  examId: string;
  total: number;
  eligible: number;
  excluded: number;
  byReason: Record<string, number>;
  eligibleIds: string[];
  firestoreReads: number;
  tookMs: number;
}

/**
 * Evaluate a whole exam's corpus in bulk.
 *
 * One collection read plus one node-graph read per referenced version — never per question, which
 * for 774 records would be 774 round trips. Zero embeddings: every gate is metadata.
 */
export async function getEligiblePyqReport(examId: string): Promise<EligibilityReport> {
  const started = Date.now();
  const canonical = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  let reads = 0;

  const snap = await db.collection('pyq_questions').where('examId', '==', canonical).get();
  reads++;
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PyqRecordForGate[];

  const nodeResults = await validateSyllabusNodeIdsBatch(
    rows.map((r) => ({ examId: r.examId || canonical, syllabusNodeId: r.syllabusNodeId })),
  );
  reads++;

  // Duplicate detection across the whole exam, computed once.
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const t = String(r.questionText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  });

  const byReason: Record<string, number> = {};
  const eligibleIds: string[] = [];
  rows.forEach((r, i) => {
    const t = String(r.questionText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const res = evaluatePyqEligibility(r, {
      examId: canonical,
      nodeValid: nodeResults[i].valid,
      nodeCode: nodeResults[i].code,
      textIsDuplicate: (counts.get(t) ?? 0) > 1,
    });
    if (res.eligible) eligibleIds.push(r.id!);
    else res.reasons.forEach((x) => { byReason[x] = (byReason[x] ?? 0) + 1; });
  });

  const report: EligibilityReport = {
    examId: canonical, total: rows.length, eligible: eligibleIds.length,
    excluded: rows.length - eligibleIds.length, byReason, eligibleIds,
    firestoreReads: reads, tookMs: Date.now() - started,
  };
  logger.info('[PYQ] eligibility evaluated', {
    examId: canonical, total: report.total, eligible: report.eligible, reads, ms: report.tookMs,
  });
  return report;
}

/**
 * Questions servable for one syllabus node.
 *
 * Exact canonical node only. Semantic similarity is deliberately not a fallback: "close enough"
 * is how a student ends up practising a topic they did not choose, and the whole point of the
 * coordinate system is that closeness is not identity.
 */
export async function getEligiblePyqsForNode(
  examId: string, syllabusNodeId: string, limit = 20,
): Promise<{ questions: any[]; available: number; reasonIfEmpty?: string }> {
  const report = await getEligiblePyqReport(examId);
  if (!report.eligible) {
    return {
      questions: [], available: 0,
      // Student-facing copy lives at the UI layer; this stays a machine reason.
      reasonIfEmpty: 'NO_ELIGIBLE_PYQS_FOR_EXAM',
    };
  }
  const snap = await db.collection('pyq_questions')
    .where('examId', '==', examId.trim().toUpperCase().replace(/[\s_-]+/g, '_'))
    .where('syllabusNodeId', '==', syllabusNodeId)
    .limit(limit).get();

  const eligible = new Set(report.eligibleIds);
  const questions = snap.docs.filter((d) => eligible.has(d.id)).map((d) => ({ id: d.id, ...(d.data() as any) }));
  return {
    questions, available: questions.length,
    reasonIfEmpty: questions.length ? undefined : 'NO_ELIGIBLE_PYQS_FOR_NODE',
  };
}
