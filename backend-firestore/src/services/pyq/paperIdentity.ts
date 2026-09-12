/**
 * Canonical paper identity for PYQs.
 *
 * Paper identity was previously carried only as free-text `session` / `shift` strings whose
 * vocabularies disagree between the two stores that use them. The registry writes `"Shift 1"`;
 * questions write `"1"`, `"29 January Shift 1"`, `"06 Apr Shift 2"`, `"Set A"`, `"Concept Drill"`,
 * or nothing. Registry `sourceId` and question `sourceId` are separate id spaces with zero
 * overlap. The consequence was that no question could be attributed to a sitting at all.
 *
 * ── What is authoritative, and what is not ──────────────────────────────────────────────────
 * The registry is authoritative for *which papers exist*, so `canonicalPaperId` is derived from
 * a registry entry and never invented from a question. But the registry is **coarser than the
 * questions**: 133 of its 173 rows carry no session and 123 carry no shift, and its finest shift
 * vocabulary is `Shift 1..3`. Meanwhile JEE Main 2024 questions name `29 January Shift 1`,
 * `30 January Shift 1`, `31 January Shift 1` — three genuinely distinct sittings that the
 * registry can only describe collectively as "Session 1 (Jan), Shift 1".
 *
 * So a registry paper is a paper *group*, and this module produces two identities rather than
 * pretending one suffices:
 *
 *   canonicalPaperId  the registry group a question demonstrably belongs to, or null
 *   sittingId         the finer identity the question's *own* metadata already carries
 *
 * `sittingId` is read off the question and never guessed. `canonicalPaperId` is assigned only
 * when exactly one registry paper is consistent with the question; more than one yields
 * AMBIGUOUS and none yields UNRESOLVED. Neither is ever assigned on exam+year alone.
 *
 * ── Raw values are never destroyed ─────────────────────────────────────────────────────────
 * Every normalisation keeps its input. `rawSession` / `rawShift` / `rawPaper` are the strings as
 * ingested; the normalized fields are derived views; the canonical id is the relationship. A
 * future correction to normalisation can be re-derived from the raw values at any time.
 */

/** Practice and drill material is not from a sitting, and must never be given paper identity. */
const PRACTICE_MARKERS =
  /\b(practice|vocab|concept drill|drill|mock|solved practice|question bank|test series)\b/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

export type PaperIdentityStatus =
  | 'RESOLVED'        // exactly one registry paper is consistent
  | 'AMBIGUOUS'       // several are consistent; we refuse to pick one
  | 'UNRESOLVED'      // none is consistent, or the registry has no such paper
  | 'NOT_APPLICABLE'; // practice / drill / generated material, which has no sitting

export interface NormalizedPaperFields {
  rawExam?: string;
  rawYear?: number;
  rawSession?: string;
  rawShift?: string;
  rawPaper?: string;
  normalizedExam?: string;
  normalizedYear?: number;
  /** `s1`, `s2`, `s1+2`, `tier1`, `prelims`, or a slug of the raw value. */
  normalizedSession?: string;
  /** The shift ordinal alone (`1`), date stripped out and preserved separately. */
  normalizedShift?: number | null;
  /** `MM-DD` when the raw shift named a date, so the sitting is not lost to normalisation. */
  normalizedSittingDate?: string | null;
  normalizedPaper?: string | null;
  /** Fine identity from the question's own metadata: `sitting:JEE_MAIN:2024:01-29:1`. */
  sittingId?: string | null;
  isPracticeMaterial: boolean;
}

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * `"Session 1 (Jan)"` → `s1`, `"Session 1 & 2"` → `s1+2`, `"Tier 1 CBT"` → `tier-1-cbt`.
 *
 * A bare session number is only read when the string actually says "session"; `"67th CCE
 * Prelims"` must not become session 67.
 */
export function normalizeSession(raw?: string | null): string | undefined {
  if (!raw || !String(raw).trim()) return undefined;
  const s = String(raw).trim();
  if (/session/i.test(s)) {
    const nums = Array.from(s.matchAll(/\d+/g), (m) => Number(m[0]));
    if (nums.length > 1) return `s${[...new Set(nums)].sort().join('+')}`;
    if (nums.length === 1) return `s${nums[0]}`;
  }
  return slug(s);
}

/** `"29 January Shift 1"` → `{ shift: 1, date: "01-29" }`; `"Set A"` → `{ shift: null, date: null }`. */
export function normalizeShift(raw?: string | null): { shift: number | null; date: string | null } {
  if (!raw || !String(raw).trim()) return { shift: null, date: null };
  const s = String(raw).trim();

  let shift: number | null = null;
  const m = s.match(/shift\s*(\d+)/i) || s.match(/^\s*(\d+)\s*$/);
  if (m) shift = Number(m[1]);
  else if (/fore\s*noon|morning/i.test(s)) shift = 1;
  else if (/after\s*noon|evening/i.test(s)) shift = 2;

  // A date inside the shift string is the only record of which sitting this was.
  let date: string | null = null;
  const dm = s.match(/(\d{1,2})\s*([A-Za-z]+)/);
  if (dm) {
    const mon = MONTHS[dm[2].toLowerCase()];
    if (mon) date = `${String(mon).padStart(2, '0')}-${String(Number(dm[1])).padStart(2, '0')}`;
  }
  return { shift, date };
}

export function normalizePaper(raw?: string | null): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (/csat|paper\s*2/i.test(s)) return 'paper2';
  if (/paper\s*1\s*&\s*2|paper\s*1\s*and\s*2/i.test(s)) return 'paper1+2';
  if (/paper\s*1|gs\s*paper|b\.?e\.?\/?b\.?tech/i.test(s)) return 'paper1';
  return slug(s);
}

/** Is this row practice/drill material rather than a real sitting? */
export function looksLikePractice(x: {
  session?: string | null; shift?: string | null; paper?: string | null;
  corpusBucket?: string | null; origin?: string | null;
}): boolean {
  if (x.corpusBucket === 'PRACTICE_MOCK') return true;
  if (x.origin === 'template' || x.origin === 'authored') return true;
  return [x.session, x.shift, x.paper].some((v) => v && PRACTICE_MARKERS.test(String(v)));
}

export function normalizeFields(x: {
  examId?: string; year?: number; session?: string | null; shift?: string | null;
  paper?: string | null; corpusBucket?: string | null; origin?: string | null;
}): NormalizedPaperFields {
  const { shift, date } = normalizeShift(x.shift);
  const isPractice = looksLikePractice(x);
  const sittingId =
    !isPractice && x.examId && x.year && date && shift !== null
      ? `sitting:${x.examId}:${x.year}:${date}:${shift}`
      : null;

  return {
    rawExam: x.examId,
    rawYear: x.year,
    rawSession: x.session ?? undefined,
    rawShift: x.shift ?? undefined,
    rawPaper: x.paper ?? undefined,
    normalizedExam: x.examId,
    normalizedYear: x.year,
    normalizedSession: normalizeSession(x.session),
    normalizedShift: shift,
    normalizedSittingDate: date,
    normalizedPaper: normalizePaper(x.paper),
    sittingId,
    isPracticeMaterial: isPractice,
  };
}

/** The registry paper's own stable id. Derived from registry semantics, never from a question. */
export function canonicalPaperIdFor(src: {
  examId: string; year: number; session?: string | null; shift?: string | null; paper?: string | null;
}): string {
  const sess = normalizeSession(src.session) ?? 'na';
  const { shift } = normalizeShift(src.shift);
  const pap = normalizePaper(src.paper) ?? 'na';
  return `paper:${src.examId}:${src.year}:${sess}:${shift === null ? 'na' : `sh${shift}`}:${pap}`;
}

/**
 * Is this question consistent with this registry paper?
 *
 * Consistency, not similarity. Exam and year must match exactly. Where *both* sides state a
 * session or a shift, they must agree. Where the registry states one and the question does not,
 * the question cannot be placed in it — silence is not agreement, and treating it as agreement is
 * precisely how a paper ends up claiming another sitting's questions.
 *
 * The one asymmetry that is allowed is granularity: a question naming `29 January Shift 1` is
 * consistent with a registry paper naming `Session 1 (Jan), Shift 1`, because the registry has no
 * finer vocabulary to disagree with. The shift ordinals must still match.
 */
export function isConsistentWithPaper(
  q: { examId?: string; year?: number; session?: string | null; shift?: string | null; paper?: string | null },
  src: { examId: string; year: number; session?: string | null; shift?: string | null; paper?: string | null },
): boolean {
  if (q.examId !== src.examId) return false;
  if (Number(q.year) !== Number(src.year)) return false;

  const qs = normalizeSession(q.session);
  const ss = normalizeSession(src.session);
  if (ss && qs) {
    // "s1+2" covers both halves; otherwise the session tokens must be equal.
    const srcParts = ss.startsWith('s') ? ss.slice(1).split('+') : [ss];
    const qParts = qs.startsWith('s') ? qs.slice(1).split('+') : [qs];
    const overlap = qParts.some((p) => srcParts.includes(p));
    if (!overlap && ss !== qs) return false;
  } else if (ss && !qs) {
    return false; // registry distinguishes sessions; this question does not say which
  }

  const { shift: qShift } = normalizeShift(q.shift);
  const { shift: sShift } = normalizeShift(src.shift);
  if (sShift !== null && qShift !== null && sShift !== qShift) return false;
  if (sShift !== null && qShift === null) return false; // registry splits shifts; question does not

  // Paper names vary far more than they disagree — the registry says "Tier 1 CBT" where a question
  // says "Tier 1 Combined Paper". Only the recognised tokens carry a real distinction (Paper 1 is
  // not Paper 2); two arbitrary slugs differing is naming drift, not evidence of a different paper.
  const qp = normalizePaper(q.paper);
  const sp = normalizePaper(src.paper);
  const KNOWN = new Set(['paper1', 'paper2', 'paper1+2']);
  if (sp && qp && KNOWN.has(sp) && KNOWN.has(qp) && sp !== qp) {
    if (!(sp === 'paper1+2' && (qp === 'paper1' || qp === 'paper2'))) return false;
  }

  return true;
}

/**
 * How many constraints a registry paper actually states.
 *
 * The registry carries umbrella rows — "Session 1 & 2" with no shift — alongside the specific
 * sittings they contain. A question is legitimately consistent with both, which made every JEE
 * Main question ambiguous on the first pass. Ambiguity should mean "two papers genuinely compete",
 * not "one paper is a coarser description of the other", so the most specific consistent paper
 * wins and ambiguity is reserved for a genuine tie.
 */
function specificity(src: { session?: string | null; shift?: string | null; paper?: string | null }): number {
  const { shift } = normalizeShift(src.shift);
  return (normalizeSession(src.session) ? 1 : 0) + (shift !== null ? 1 : 0) + (normalizePaper(src.paper) ? 1 : 0);
}

export interface PaperResolution {
  canonicalPaperId: string | null;
  paperIdentityStatus: PaperIdentityStatus;
  /** Every registry paper that was consistent — kept so AMBIGUOUS is auditable, not just a label. */
  candidatePaperIds: string[];
}

/**
 * Resolve a question against the registry.
 *
 * Registry rows describe *documents* (question paper, answer key, solution set) and several rows
 * can describe the same sitting, so candidates are collapsed by canonical id before deciding
 * whether the answer is ambiguous — three documents for one paper is not ambiguity.
 */
export function resolvePaperIdentity(
  q: { examId?: string; year?: number; session?: string | null; shift?: string | null; paper?: string | null; corpusBucket?: string | null; origin?: string | null },
  registry: Array<{ examId: string; year: number; session?: string | null; shift?: string | null; paper?: string | null }>,
): PaperResolution {
  if (looksLikePractice(q)) {
    return { canonicalPaperId: null, paperIdentityStatus: 'NOT_APPLICABLE', candidatePaperIds: [] };
  }
  const consistent = registry.filter((s) => isConsistentWithPaper(q, s));
  const allIds = [...new Set(consistent.map(canonicalPaperIdFor))];
  if (allIds.length === 0) return { canonicalPaperId: null, paperIdentityStatus: 'UNRESOLVED', candidatePaperIds: [] };

  // Keep only the most specific consistent papers; a coarser umbrella row describing the same
  // sitting is not a competing candidate.
  const best = Math.max(...consistent.map(specificity));
  const bestIds = [...new Set(consistent.filter((s) => specificity(s) === best).map(canonicalPaperIdFor))];

  if (bestIds.length === 1) {
    return { canonicalPaperId: bestIds[0], paperIdentityStatus: 'RESOLVED', candidatePaperIds: allIds };
  }
  return { canonicalPaperId: null, paperIdentityStatus: 'AMBIGUOUS', candidatePaperIds: bestIds };
}

// ─── Provenance classification ───────────────────────────────────────────────────────────────

/**
 * What a question actually is, as opposed to what its metadata claims.
 *
 * A live audit found 2,916 questions sitting in `corpusBucket: PRACTICE_MOCK` while carrying
 * `sourceType: TIER_A_OFFICIAL`, `verificationStatus: OFFICIAL_CONFIRMED` and
 * `rightsStatus: OFFICIAL_SOURCE_REVIEWED` — their own `shift: "Concept Drill"` and
 * `paper: "Practice Set"` give them away. This class is derived from the strongest *negative*
 * evidence first, so a practice question can never reach an official class by having had an
 * official-looking label written onto it.
 */
export type ProvenanceClass =
  | 'VERIFIED_OFFICIAL_PYQ'
  | 'VERIFIED_SECONDARY_PYQ'
  | 'PYQ_INSPIRED'
  | 'PRACTICE_MOCK'
  | 'GENERATED'
  | 'SYNTHETIC'
  | 'UNKNOWN'
  | 'UNRESOLVED';

export function classifyProvenance(q: {
  corpusBucket?: string | null; origin?: string | null; sourceType?: string | null;
  verificationStatus?: string | null; session?: string | null; shift?: string | null;
  paper?: string | null; provenanceRecords?: unknown[] | null; sourceId?: string | null;
  restorationState?: string | null;
}): ProvenanceClass {
  // Negative evidence first: nothing below can be overridden by a label.
  if (q.origin === 'template' || q.restorationState === 'SYNTHETIC_TEMPLATE') return 'GENERATED';
  if (q.origin === 'authored') return 'SYNTHETIC';
  if (q.corpusBucket === 'PRACTICE_MOCK') return 'PRACTICE_MOCK';
  if (PRACTICE_MARKERS.test(`${q.session ?? ''} ${q.shift ?? ''} ${q.paper ?? ''}`)) return 'PRACTICE_MOCK';

  const verified = q.verificationStatus === 'OFFICIAL_CONFIRMED' || q.verificationStatus === 'MULTI_SOURCE_CONFIRMED';
  const hasProvenance = Array.isArray(q.provenanceRecords) && q.provenanceRecords.length > 0;

  if (q.corpusBucket === 'OFFICIAL_PYQ') {
    if (q.sourceType === 'TIER_A_OFFICIAL' && verified && hasProvenance) return 'VERIFIED_OFFICIAL_PYQ';
    if (verified || q.verificationStatus === 'SECONDARY_CONFIRMED') return 'VERIFIED_SECONDARY_PYQ';
    return 'UNKNOWN';
  }
  if (!q.corpusBucket) return hasProvenance ? 'UNKNOWN' : 'UNRESOLVED';
  return 'UNKNOWN';
}

/** Only a verified official PYQ may be ranked as an authentic past paper. */
export function isAuthenticPyq(cls: ProvenanceClass): boolean {
  return cls === 'VERIFIED_OFFICIAL_PYQ';
}
