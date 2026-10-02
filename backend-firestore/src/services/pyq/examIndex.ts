/**
 * Resolves the exam a student named in prose to a canonical `examId`.
 *
 * Built from live data rather than a hardcoded list, because the corpus grows without the code
 * changing: UGC NET holds 27,640 questions but has no row in the `exams` collection, so an index
 * derived from `exams` alone would be unable to answer a UGC NET request at all. The index is
 * therefore the union of three live sources — the `exams` collection, the exam ids present in the
 * source registry, and the ids present on questions themselves — so a corpus that gains an exam
 * becomes answerable the moment it is ingested.
 *
 * Cached for an hour. A student's phrasing ("ssc cgl", "UGC-NET", "jee mains") is normalised to
 * the same token shape as the ids, so matching needs no per-exam rules.
 */
import { db } from '../../config/firebase';
import { cacheService } from '../cache.service';
import { logger } from '../../utils/logger';

const CACHE_KEY = 'exam_alias_index_v1';
const TTL_SECONDS = 3600;

export interface ExamIndex {
  /** normalised alias -> canonical examId */
  aliases: Record<string, string>;
  examIds: string[];
  builtAt: number;
}

/** "SSC-CGL", "ssc cgl", "SSC_CGL" all collapse to "ssccgl". */
export function normaliseExamToken(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Phrasings that do not fall out of the id itself.
 *
 * Deliberately small: anything derivable from the id (spacing, hyphens, case) is handled by
 * normalisation, and anything exam-specific that is NOT a genuine synonym belongs in the data,
 * not here.
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  UGC_NET: ['ugcnet', 'ugc', 'net', 'nta ugc net'],
  SSC_CGL: ['cgl', 'combined graduate level'],
  SSC_CHSL: ['chsl', 'combined higher secondary'],
  UPSC_CSE: ['upsc', 'ias', 'civil services', 'cse'],
  JEE_MAIN: ['jee', 'jee mains', 'jeemain'],
  JEE_ADVANCED: ['jee adv', 'advanced'],
  NEET_UG: ['neet'],
  BPSC_CCE: ['bpsc'],
  RRB_NTPC: ['ntpc', 'rrb'],
  IBPS_PO: ['ibps', 'ibpspo'],
  BPSC_TRE: ['tre', 'bpsctre', 'bpsc teacher', 'bihar teacher', 'bihar tre', 'bpsc tre 1', 'bpsc tre 2', 'bpsc tre 3', 'tre 1', 'tre 2', 'tre 3', 'tre1', 'tre2', 'tre3'],
  BIHAR_STET: ['stet', 'bihar stet', 'bseb stet', 'stet paper 1', 'stet paper 2', 'stet 1', 'stet 2', 'stet1', 'stet2'],
};

async function build(): Promise<ExamIndex> {
  const ids = new Set<string>();

  const collect = async (collection: string, field: string | null) => {
    try {
      // Only the one field is needed; registry documents are large, and every Firestore round
      // trip from the server costs 0.3–1.5 s.
      const base = db.collection(collection);
      const snap = await (field ? base.select(field) : base.select()).limit(1000).get();
      for (const d of snap.docs) {
        const v = field ? (d.data() as any)[field] : d.id;
        if (v && typeof v === 'string') ids.add(v);
      }
    } catch (e: any) {
      logger.warn(`[ExamIndex] could not read ${collection}: ${e?.message}`);
    }
  };

  await Promise.all([
    collect('exams', null),
    collect('pyq_source_registry', 'examId'),
    collect('pyq_questions', 'examId'),
  ]);

  const aliases: Record<string, string> = {};
  for (const id of ids) {
    aliases[normaliseExamToken(id)] = id;
    for (const extra of EXTRA_ALIASES[id] ?? []) aliases[normaliseExamToken(extra)] = id;
  }
  // Aliases for exams that exist in EXTRA_ALIASES but were not found in any live source are
  // deliberately NOT added — claiming to know an exam the corpus has never seen is how a request
  // for it ends up answered from general knowledge.

  return { aliases, examIds: [...ids].sort(), builtAt: Date.now() };
}

// Last good index, kept past its TTL. An expired index is served while a refresh runs in the
// background, so only the very first build after boot ever makes a student wait for it.
let lastGood: ExamIndex | null = null;
let refreshing: Promise<ExamIndex> | null = null;

function refresh(): Promise<ExamIndex> {
  if (!refreshing) {
    refreshing = build()
      .then(async (built) => {
        if (built.examIds.length) lastGood = built;
        await cacheService.set(CACHE_KEY, built, TTL_SECONDS).catch(() => {});
        logger.info('[ExamIndex] built', { examCount: built.examIds.length });
        return built;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function getExamIndex(): Promise<ExamIndex> {
  const cached = await cacheService.get<ExamIndex>(CACHE_KEY).catch(() => null);
  if (cached?.aliases) return cached;
  if (lastGood) {
    refresh().catch((e) => logger.warn(`[ExamIndex] background refresh failed: ${e?.message}`));
    return lastGood;
  }
  return refresh();
}

/** Build the index at boot so the first student question does not pay for it. */
export function warmExamIndex(): void {
  getExamIndex().catch((e) => logger.warn(`[ExamIndex] warm-up failed: ${e?.message}`));
}

/**
 * Exam families: the issuing body a student names on its own ("GATE", "UPSC"). An examId's family
 * is its first segment (UPSC_CSE -> upsc). When a query names a family, only exams of that family
 * may match — "GATE CSE" shares the token "cse" with UPSC CSE, and a GATE Computer Science student
 * must not be served UPSC content.
 *
 * Only true issuing bodies belong here. "bihar" is not one (BIHAR_STET and BPSC_TRE are both
 * Bihar exams), nor are "nda"/"cds" (they are UPSC_NDA and UPSC_CDS).
 */
const EXAM_FAMILIES = new Set(['upsc', 'ssc', 'gate', 'cuet', 'jee', 'neet', 'bpsc', 'rrb', 'ibps', 'ugc', 'sbi', 'rbi', 'ctet']);

/**
 * What a bare family goal (onboarding offers "SSC", "UPSC", "GATE", "CUET") resolves to: the
 * family's flagship exam, and only if that exam is in the index — a family whose corpus Sadhya
 * does not hold (GATE and CUET, as of 2026-09-27: no examId in `exams`, the registry or
 * `pyq_questions`) resolves to nothing rather than to a neighbour. UPSC needs no entry; its
 * "upsc" alias already names UPSC_CSE.
 */
const FAMILY_DEFAULT: Record<string, string> = {
  ssc: 'SSC_CGL',
};

/** Longest alias is three words ("combined higher secondary", "nta ugc net"); leave headroom. */
const MAX_ALIAS_TOKENS = 5;

/**
 * Word tokens of a query, also split between letters and digits so "tre1" and "cgl2023" behave
 * like "tre 1" and "cgl 2023".
 */
function queryTokens(query: string): string[] {
  return String(query)
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const familyOf = (examId: string) => examId.split(/[_\s-]/)[0].toLowerCase();

/**
 * Pure matcher behind {@link detectExamId}, exported for tests.
 *
 * An alias matches a run of whole words, joined ("ssc cgl", "ssc-cgl" and "SSCCGL" all give
 * "ssccgl") — never a fragment of a word, so "internet" does not name UGC NET. The longest match
 * wins, so "ssc chsl" is not swallowed by an alias sharing a prefix and "jee advanced" wins over
 * "jee".
 */
export function matchExamId(query: string, aliases: Record<string, string>): string | null {
  const tokens = queryTokens(query);
  const named = new Set(tokens.filter((t) => EXAM_FAMILIES.has(t)));

  let best: { alias: string; examId: string } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    let alias = '';
    for (let j = i; j < Math.min(tokens.length, i + MAX_ALIAS_TOKENS); j++) {
      alias += tokens[j];
      if (alias.length < 3) continue; // "net" is the shortest alias strong enough to claim an exam
      const examId = aliases[alias];
      if (!examId) continue;
      // Never cross families: the query named one, and this exam belongs to another.
      if (named.size && !named.has(familyOf(examId))) continue;
      if (!best || alias.length > best.alias.length) best = { alias, examId };
    }
  }
  if (best) return best.examId;

  // A bare family goal ("SSC"), nothing else.
  if (tokens.length === 1) {
    const flagship = FAMILY_DEFAULT[tokens[0]];
    if (flagship && Object.values(aliases).includes(flagship)) return flagship;
  }
  return null;
}

/** Resolve the exam a query names, against the live index. See {@link matchExamId}. */
export async function detectExamId(query: string): Promise<string | null> {
  const index = await getExamIndex();
  return matchExamId(query, index.aliases);
}
