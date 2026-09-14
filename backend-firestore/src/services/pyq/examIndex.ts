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
};

async function build(): Promise<ExamIndex> {
  const ids = new Set<string>();

  const collect = async (collection: string, field: string | null) => {
    try {
      const snap = await db.collection(collection).limit(1000).get();
      for (const d of snap.docs) {
        const v = field ? (d.data() as any)[field] : d.id;
        if (v && typeof v === 'string') ids.add(v);
      }
    } catch (e: any) {
      logger.warn(`[ExamIndex] could not read ${collection}: ${e?.message}`);
    }
  };

  await collect('exams', null);
  await collect('pyq_source_registry', 'examId');

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

export async function getExamIndex(): Promise<ExamIndex> {
  const cached = await cacheService.get<ExamIndex>(CACHE_KEY).catch(() => null);
  if (cached?.aliases) return cached;
  const built = await build();
  await cacheService.set(CACHE_KEY, built, TTL_SECONDS).catch(() => {});
  logger.info('[ExamIndex] built', { examCount: built.examIds.length });
  return built;
}

/**
 * Longest-match exam detection over the raw query.
 *
 * Longest first so "ssc chsl" is not swallowed by the "ssc cgl" alias sharing a prefix, and so
 * "jee advanced" wins over "jee".
 */
export async function detectExamId(query: string): Promise<string | null> {
  const index = await getExamIndex();
  const flat = normaliseExamToken(query);
  let best: { alias: string; examId: string } | null = null;
  for (const [alias, examId] of Object.entries(index.aliases)) {
    if (alias.length < 3) continue; // "net" alone is too weak to claim an exam
    if (!flat.includes(alias)) continue;
    if (!best || alias.length > best.alias.length) best = { alias, examId };
  }
  return best?.examId ?? null;
}
