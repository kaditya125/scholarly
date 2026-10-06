/**
 * Reference-book registry: canonical book ids, aliases, and which exams a book may serve.
 * ======================================================================================
 *
 * Grounded in a read-only audit of the live Qdrant `reference_books` namespace (2 Oct 2026,
 * 44 book keys, 113,246 points in the collection). Vectors are NEVER deleted or rewritten here —
 * duplicates are handled at query time, so the decision is reversible by editing this file.
 *
 * When a book is ingested with a new key or new exam tags, update CANONICAL_REFERENCE_BOOKS /
 * TAGGED_EXAM_CODES (scripts/reference/books/audit-coverage.ts prints both from live data);
 * tests/unit/referenceBookRegistry.test.ts keeps the router and manifests consistent with it.
 */

/** Every book key that holds live reference vectors and is served as itself. */
export const CANONICAL_REFERENCE_BOOKS = [
  'bihar_special_crash_course', 'bihar_through_the_ages', 'bipan_chandra_freedom_struggle', 'campbell_biology',
  'forouzan_networks', 'galvin_os', 'gc_leong_geography', 'hall_knight_algebra', 'hc_verma_physics_vol1',
  'hc_verma_physics_vol2', 'irodov_physics_problems', 'jd_lee_inorganic', 'laxmikanth_polity', 'lexicon_ethics',
  'lipschutz_dsa', 'lucent_english', 'lucent_gk', 'lucent_science', 'mano_architecture', 'ms_chouhan_organic',
  'ncert_cs_11', 'ncert_cs_12', 'ncert_physics_11', 'neetu_singh_english', 'nitin_singhania_art_culture',
  'norman_lewis_word_power', 'rakesh_yadav_maths', 'ramesh_singh_economy', 'rs_sharma_ancient_history',
  'satish_chandra_medieval_history', 'schand_quant', 'schand_reasoning', 'shankar_environment', 'silberschatz_dbms',
  'skinner_educational_psychology', 'sl_loney_trigonometry', 'sp_bakshi_english', 'spectrum_history',
  'stet_pedagogy_guide', 'trueman_biology_vol1', 'trueman_biology_vol2',
] as const;

export interface BookAlias {
  canonical: (typeof CANONICAL_REFERENCE_BOOKS)[number];
  /** Exclude this key's own vectors from retrieval (they duplicate the canonical book's). */
  excludeFromRetrieval: boolean;
  reason: string;
}

/**
 * Keys that are NOT separate books. Investigated against live data, 2 Oct 2026.
 */
export const BOOK_ALIASES: Record<string, BookAlias> = {
  irodov_physics: {
    canonical: 'irodov_physics_problems',
    excludeFromRetrieval: true,
    reason: 'Same book (I.E. Irodov, "Problems in General Physics"), older page-level ingestion: 283 vectors, no parent contexts. irodov_physics_problems (751 vectors) is the parent-linked re-ingestion. Serving both returns the same pages twice.',
  },
  hc_verma_vol1: {
    canonical: 'hc_verma_physics_vol1',
    excludeFromRetrieval: true,
    reason: '3 stray vectors (~44 words each) from an early test write under a non-standard key.',
  },
  m_laxmikanth_polity: {
    canonical: 'laxmikanth_polity',
    excludeFromRetrieval: true,
    reason: 'Duplicate reference_sources record for the same book (Indian Polity, 7th ed.); it has no vectors — all 748 are under laxmikanth_polity.',
  },
  jd_lee_inorganic_chemistry: {
    canonical: 'jd_lee_inorganic',
    excludeFromRetrieval: true,
    reason: 'Key used only by an ingestion script/manifest; the book is indexed as jd_lee_inorganic (602 vectors). Never ingested under this key.',
  },
};

/**
 * Keys whose vectors must not be served at all, with the reason. Not aliases: there is no
 * correct copy to redirect to.
 */
export const BROKEN_REFERENCE_BOOKS: Record<string, string> = {
  arihant_csat_reasoning:
    'Mis-ingested: 2 vectors averaging ~279,000 words each (the whole book in two chunks). An embedding of that text is meaningless; re-ingest before serving.',
};

/** Books never returned by retrieval: superseded aliases + broken ingestions. */
export const RETRIEVAL_EXCLUDED_BOOKS: string[] = [
  ...Object.entries(BOOK_ALIASES).filter(([, a]) => a.excludeFromRetrieval).map(([k]) => k),
  ...Object.keys(BROKEN_REFERENCE_BOOKS),
];

export function canonicalBookId(id: string): string {
  return BOOK_ALIASES[id]?.canonical ?? id;
}

/** Map a caller's book filter onto canonical ids, de-duplicated. */
export function resolveBookFilter(books: string | string[] | undefined): string[] | undefined {
  if (!books) return undefined;
  const list = (Array.isArray(books) ? books : [books]).map(canonicalBookId).filter((b) => !(b in BROKEN_REFERENCE_BOOKS));
  return [...new Set(list)];
}

/** Computer-science reference books (tagged for BPSC TRE / Bihar STET at ingestion). */
export const CS_REFERENCE_BOOKS = [
  'silberschatz_dbms', 'galvin_os', 'forouzan_networks', 'mano_architecture', 'lipschutz_dsa', 'ncert_cs_11', 'ncert_cs_12',
];

/** Every exam_relevance tag present on live reference vectors (2 Oct 2026). */
export const TAGGED_EXAM_CODES = new Set([
  'BANKING', 'BIHAR_STET', 'BPSC', 'BPSC_CCE', 'BPSC_TRE', 'CTET', 'GENERAL', 'JEE_ADVANCED', 'JEE_MAIN', 'NEET',
  'NEET_UG', 'RAILWAY', 'SSC_CGL', 'SSC_CHSL', 'SSC_MTS', 'STATE_PSC', 'STET', 'UPSC', 'UPSC_CSE',
]);

/**
 * Exams whose reference material is defined by a BOOK LIST rather than chunk tags. Used where the
 * right books exist but were tagged for other exams at ingestion; scoping by book list needs no
 * data rewrite. `subjects`: the scope applies only when the question's subject matches (UGC NET is
 * one exam id across ~80 subject papers; the CS books serve only its Computer Science paper).
 */
export const EXAM_BOOK_SCOPES: Array<{ examIds: string[]; subjects?: RegExp; books: string[]; reason: string }> = [
  {
    examIds: ['SSC_IMD_CS', 'GATE_CS', 'ISRO_CS', 'NIC_NIELIT_CS', 'DRDO_CEPTAM_CS'],
    books: CS_REFERENCE_BOOKS,
    reason: 'Computer-science exams; the standard CS references (Silberschatz, Galvin, Forouzan, Mano, Lipschutz, NCERT CS) cover their syllabus.',
  },
  {
    examIds: ['UGC_NET'],
    subjects: /comput|^cs$|data ?base|dbms|operating|network|data structure|algorithm|architecture|programming|software/i,
    books: CS_REFERENCE_BOOKS,
    reason: 'UGC NET Computer Science and Applications paper only.',
  },
];

export type ReferenceScope =
  | { kind: 'ANY' }
  | { kind: 'TAGS'; examCodes: string[] }
  | { kind: 'BOOKS'; books: string[]; reason: string }
  | { kind: 'NO_SUPPORTED_REFERENCE_BOOKS'; reason: string };

/**
 * How reference retrieval is scoped for an exam (+ optional subject). `aliasCodes` is the
 * resolver-id → ingestion-tag mapping (referenceBooks.service examRelevanceCodes).
 */
export function referenceScopeFor(examCode: string | undefined, subject: string | undefined, aliasCodes: (e: string) => string[]): ReferenceScope {
  if (!examCode) return { kind: 'ANY' };
  for (const s of EXAM_BOOK_SCOPES) {
    if (!s.examIds.includes(examCode)) continue;
    if (!s.subjects || (subject && s.subjects.test(subject))) return { kind: 'BOOKS', books: s.books, reason: s.reason };
  }
  const codes = aliasCodes(examCode);
  if (!codes.some((c) => TAGGED_EXAM_CODES.has(c))) {
    return {
      kind: 'NO_SUPPORTED_REFERENCE_BOOKS',
      reason: `No reference book is tagged for ${examCode}${subject ? ` (${subject})` : ''}; not falling back to books for other exams.`,
    };
  }
  return { kind: 'TAGS', examCodes: codes };
}
