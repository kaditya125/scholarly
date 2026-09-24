/**
 * Reference-books corpus — ISOLATION CONTRACT + BOOK REGISTRY
 * =========================================================
 *
 * One place that defines (a) where reference-book vectors and rows are allowed to land, (b) the
 * guards that make "isolated from the PYQ / mock corpora" a checked property, and (c) the
 * per-book registry (title, publisher, taxonomy, chapter detection, exam relevance).
 *
 * Rule:
 *   Reference books (Lucent GK, Lucent Science, S. Chand Quantitative Aptitude, …)
 *                            -> ONE dedicated Pinecone namespace `reference_books`
 *                               + Firestore reference_sources / reference_chunks / reference_concepts
 *   Authentic PYQs           -> untouched, in env.PINECONE_NAMESPACE / pyq_questions
 *   Generated questions      -> untouched, in the generated-mock corpus
 *
 * Every existing retrieval path queries `namespace = env.PINECONE_NAMESPACE`, so it cannot return
 * a reference-book vector even with a broken filter. Per-vector `book` metadata separates the
 * books from each other within the shared reference namespace.
 */

import type { RecordMetadata } from '@pinecone-database/pinecone';
import * as crypto from 'crypto';
import { env } from '../../../src/config/env';

/* ─────────────────────────────────────────────────────────────────────────────
 * Physical location
 * ──────────────────────────────────────────────────────────────────────────── */

/** Dedicated Pinecone namespace for ALL reference-book vectors. Not derived from any env var. */
export const REFERENCE_NAMESPACE = 'reference_books';

export const REF_SOURCE_COLLECTION = 'reference_sources';
export const REF_CHUNK_COLLECTION = 'reference_chunks';
export const REF_CONCEPT_COLLECTION = 'reference_concepts';

/** Collections this pipeline must NEVER write to. Asserted before any Firestore batch commits. */
export const PROTECTED_FIRESTORE_COLLECTIONS = Object.freeze([
  'pyq_questions',
  'question_bank',
  'practice_bank',
  'canonical_pyq_questions',
  'pyq_papers',
  'syllabus_nodes',
  'generated_mocks',
  'mock_reference',
]);

export const CORPUS_BUCKET = 'REFERENCE_BOOK';
export const VECTOR_KIND = 'REFERENCE_BOOK_CHUNK';

/* ─────────────────────────────────────────────────────────────────────────────
 * Guards
 * ──────────────────────────────────────────────────────────────────────────── */

/** Throws unless `ns` is the dedicated reference namespace. Call before every upsert. */
export function assertReferenceNamespace(ns: string | undefined): asserts ns is string {
  if (ns !== REFERENCE_NAMESPACE) {
    throw new Error(
      `[reference/contract] refusing to write to namespace "${ns ?? '(default)'}". ` +
        `Reference-book vectors go to "${REFERENCE_NAMESPACE}" ONLY.`,
    );
  }
  if (ns === env.PINECONE_NAMESPACE) {
    throw new Error(
      `[reference/contract] env.PINECONE_NAMESPACE is "${ns}", which collides with the reference ` +
        `namespace. Unset it or point it back at the shared corpus.`,
    );
  }
}

/** Throws if a Firestore collection path touches a protected store. */
export function assertWritableCollection(collectionPath: string): void {
  const root = collectionPath.split('/')[0];
  if (PROTECTED_FIRESTORE_COLLECTIONS.includes(root)) {
    throw new Error(`[reference/contract] refusing to write "${collectionPath}" — protected trusted-corpus store.`);
  }
  const allowed = [REF_SOURCE_COLLECTION, REF_CHUNK_COLLECTION, REF_CONCEPT_COLLECTION];
  if (!allowed.includes(root)) {
    throw new Error(`[reference/contract] collection "${collectionPath}" is not one of ${allowed.join(', ')}.`);
  }
}

/**
 * Distributor-watermark / piracy-overlay patterns — a property of the SOURCE FILE, handled as
 * provenance + a review flag, never by altering content to hide it (stage 01 marks covered text
 * `[obscured-by-overlay]`; stage 02 flags the page; stage 05 routes the chunk to
 * chunks.flagged.json). `source_status` is never set to `licensed` by the pipeline.
 */
export const OBSCURED_MARKER = '[obscured-by-overlay]';
export const WATERMARK_PATTERNS: RegExp[] = [
  /\bdownload(?:ed)?\s+from\s*:?/i,
  /\b[\w.-]+\.blog(?:spot)?\.com\b/i,
  /\b(?:t|telegram)\.me\/[\w]+/i,
  /\btelegram\b.*\b(channel|group|@)/i,
  /\bwww\.[\w.-]+\.(?:in|com|net|org)\b\s*$/i,
  /\bfor\s+more\s+(?:books|pdfs?|material)\b/i,
  /\bjoin\s+(?:our\s+)?(?:telegram|whatsapp)\b/i,
];

export function findWatermarks(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const re of WATERMARK_PATTERNS) if (re.test(line)) hits.push(line.trim().slice(0, 140));
  }
  return [...new Set(hits)];
}

/**
 * Publisher-advertisement / piracy-site promo patterns. Unlike a watermark (which flags a page
 * for review), an ad PAGE is simply not book content — the chunk is excluded as `boilerplate`.
 * Seen heavily in the S. Chand reasoning scan (thecsspoint.com dumps a stack of ad pages up
 * front, with phone numbers and "cash on delivery").
 */
export const AD_PATTERNS: RegExp[] = [
  /\b(thecsspoint|cssbooks\.net|the css point)\b/i,
  /cash on delivery|call\s*\/\s*sms|order now|for or?der (and|&)? ?inquiry/i,
  /\bbest online free\b|\bfree web source\b/i,
  /\bvisit now\b|\bvisit\s*:?\s*(https?:\/\/|www\.)/i,
  /\b0\d{3}[\s-]?\d{6,7}\b/, // Pakistani mobile format e.g. "0333 6042057"
  /whatsapp\s*\d/i,
  /\bemporium publishers\b|\bpublishers?\b.*\border now\b/i,
];

export function findAds(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const re of AD_PATTERNS) if (re.test(line)) hits.push(line.trim().slice(0, 140));
  }
  return [...new Set(hits)];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Shared taxonomy
 * ──────────────────────────────────────────────────────────────────────────── */

/** knowledge_type — spec §20, plus aptitude-book extensions. */
export type KnowledgeType =
  | 'factual'
  | 'conceptual'
  | 'definition'
  | 'classification'
  | 'timeline'
  | 'table'
  | 'formula'
  | 'example'
  | 'rule' // a stated method / property (aptitude & reasoning chapter intros)
  | 'shortcut' // a stated speed trick
  | 'worked_example'; // a solved problem with steps

export type ExamCode =
  | 'SSC_CGL'
  | 'SSC_CHSL'
  | 'SSC_MTS'
  | 'BPSC'
  | 'BPSC_TRE'
  | 'BIHAR_STET'
  | 'UPSC'
  | 'RAILWAY'
  | 'BANKING'
  | 'STATE_PSC'
  | 'GENERAL';

export type RelevanceTier = 'high_relevance' | 'medium_relevance' | 'low_relevance';

/**
 * Ingestion relevance. Only `content` is embedded. Everything else is written to
 * chunks.excluded.json with its reason — kept on disk, never silently discarded, never ingested.
 */
export type RelevanceClass =
  | 'content'
  | 'front-matter'
  | 'navigation'
  | 'index'
  | 'boilerplate'
  | 'exercise' // unsolved practice-question / exercise block — not reference knowledge
  | 'low';

/** A non-table / non-definition / non-formula chunk shorter than this is treated as `low`. */
export const RELEVANCE_MIN_CHARS = 120;

/* ─────────────────────────────────────────────────────────────────────────────
 * Book registry
 * ──────────────────────────────────────────────────────────────────────────── */

export type BookDomain = 'gk' | 'science' | 'aptitude' | 'reasoning' | 'english';

export interface ReferenceBook {
  key: string; // CLI --book=<key>, also parent_document_id
  title: string;
  publisher: string;
  author?: string;
  language: 'English' | 'Hindi';
  domain: BookDomain;
  stagingDir: string; // under dataset_staging/  (e.g. "lucent/gk", "schand/quant")
  categories: readonly string[];
  /** A "#" heading is a real CHAPTER only if its (number-stripped) title matches this. */
  chapterHeading: RegExp;
  /** chapter / topic keyword → category. Prefix matches — NOT `\b`-terminated. */
  chapterCategory: Array<[RegExp, string]>;
  /** category → the `subject` metadata value. */
  subjectFor: (category: string) => string;
  examRelevance: ExamCode[];
  /** stage 06 retrieval probes (spec §22 style). */
  probeQueries: string[];
}

const GK: ReferenceBook = {
  key: 'lucent_gk',
  title: "Lucent's General Knowledge",
  publisher: 'Lucent Publication',
  language: 'English',
  domain: 'gk',
  stagingDir: 'lucent/gk',
  categories: ['History', 'Geography', 'Indian Polity', 'Economy', 'Art & Culture', 'General Science', 'Static GK', 'Miscellaneous'],
  chapterHeading:
    /^(?:\d{1,2}[.)]?\s*)?(indian history|world history|(?:indian|world|physical)?\s*geography|indian polity(?:\s+and\s+constitution)?|indian economy|general science|physics|chemistry|biology|botany|zoology|miscellany|miscellaneous|computer(?:\s+(?:knowledge|awareness))?)\s*$/i,
  chapterCategory: [
    [/\b(histor|ancient|medieval|modern india|freedom|national movement|dynast|sultanate|mughal|maurya|gupta|british raj|revolt|congress)/i, 'History'],
    [/\b(geograph|river|mountain|lake|soil|climate|monsoon|plateau|desert|ocean|continent|volcano|earthquake|latitude|longitude|solar system|planet)/i, 'Geography'],
    [/\b(polit|constitution|parliament|president|prime minister|judiciar|fundamental right|directive principle|amendment|election|panchayat|governor|supreme court)/i, 'Indian Polity'],
    [/\b(econom|banking|inflation|budget|taxation|gdp|national income|\brbi\b|fiscal|monetar|planning commission|niti aayog|poverty|census)/i, 'Economy'],
    [/\b(cultur|dance|music|festival|architectur|painting|literatur|religio|philosoph|heritage|temple|monument)/i, 'Art & Culture'],
    [/\b(physics|chemistr|biolog|botan|zoolog|scientif|human body|disease|vitamin|\belement|compound|\bforce|\bmotion|\benergy|\bcell)/i, 'General Science'],
    [/\b(book|author|award|sport|olympic|currenc|capital|organi[sz]ation|important day|abbreviation|first in|superlative|national symbol|invention|discover|miscellan|computer|internet)/i, 'Static GK'],
  ],
  subjectFor: () => 'General Knowledge',
  examRelevance: ['SSC_CGL', 'SSC_CHSL', 'BPSC', 'UPSC', 'RAILWAY', 'STATE_PSC', 'GENERAL'],
  probeQueries: [
    'Explain Fundamental Rights.',
    'Which Indian rivers are described in the geography section?',
    'Explain the functions of the Reserve Bank of India.',
    'What are the important constitutional amendments?',
    'List the classical dances of India.',
  ],
};

const SCIENCE: ReferenceBook = {
  key: 'lucent_science',
  title: "Lucent's General Science",
  publisher: 'Lucent Publication',
  language: 'English',
  domain: 'science',
  stagingDir: 'lucent/science',
  categories: ['physics', 'chemistry', 'biology', 'miscellaneous_science'],
  // This edition's real headings are structural, not a fixed topic list: every actual chapter is
  // "<digit(s)>. Title" (e.g. "2. Motion and Force", "3. Atomic Structure") or a roman-numeral
  // sub-part ("I. General Physics (Mechanics)", "VI. Modern Physics (Atomic & Nuclear Physics)"),
  // confirmed against all 176 distinct level-2 headings the OCR actually produced across the
  // book. A bare topic word ("physics"/"chemistry"/"biology"/"general science"/"astronomy") is
  // deliberately NOT matched here — those are the book's own running header, re-OCR'd on nearly
  // every page (sometimes at heading level 1, sometimes level 2), and matching them as chapters
  // repeatedly reset the real chapter to a single subject name across ~800 chunks. The two
  // negative lookaheads drop table-of-contents lines that got OCR'd as headings too ("I. Physical
  // Chemistry ... 265-318" — dotted leader + trailing page range).
  chapterHeading:
    /^(?:\d{1,2}[.)]|[IVX]{1,7}[.)])\s+(?!.*\.\.\.)(?!.*\d+\s*-\s*\d+\s*$).{2,70}$/i,
  chapterCategory: [
    // Astronomy and Computer are their own TOC parts (02., 03.) in this edition, not sub-parts
    // of Physics — checked first since "planet"/"computer" don't collide with the science
    // keywords below, so order wouldn't otherwise matter.
    [/\b(astronom|\bplanet|celestial|\bstar|galax|cosmos|universe|computer|software|hardware)/i, 'miscellaneous_science'],
    [/\b(physics|physicist|motion|\bforce|work|energ|power|gravitation|pressure|\bheat|thermodynamic|thermal expansion|kinetic theory|states? of matter|properties of matter|sound|wave|light|optic|human eye|electric|magnet|electronic|nuclear|radioactiv|measurement|\bunit)/i, 'physics'],
    [/\b(chemistr|\batom|periodic|element|compound|mixture|reaction|\bacid|\bbase|\bsalt|metal|alloy|carbon|organic|polymer|electrochem|hydrocarbon|fuel|\bcoal\b|petroleum|soap|detergent|\bwax|plastic|explosive|\bdrugs?\b|solution|gas(?:es)? law|kinetics|equilibrium|oxidation|reduction|sulphide|\boxide|cement|composition of.*matter|chemical (?:composition|symbol|formula|equation)|magnesium|alcohol|\bwater\b)/i, 'chemistry'],
    [/\b(biolog|\bcell|tissue|\borgan|human body|physiolog|genetic|evolution|plant|animal|disease|nutrition|vitamin|hormone|reproduction|ecolog|microb|biotech|blood|digest|respir|nervous)/i, 'biology'],
  ],
  subjectFor: (c) => c || 'miscellaneous_science',
  examRelevance: ['SSC_CGL', 'SSC_CHSL', 'BPSC', 'UPSC', 'RAILWAY', 'STATE_PSC', 'GENERAL'],
  probeQueries: [
    'What are the deficiency diseases of vitamins?',
    "State Newton's second law of motion.",
    'Explain photosynthesis — inputs, requirements and products.',
    'What are the SI units of common physical quantities?',
    'Describe the structure and function of the human digestive system.',
  ],
};

const SCHAND_QUANT: ReferenceBook = {
  key: 'schand_quant',
  title: 'Quantitative Aptitude for Competitive Examinations',
  publisher: 'S. Chand',
  author: 'R.S. Aggarwal',
  language: 'English',
  domain: 'aptitude',
  stagingDir: 'schand/quant',
  categories: [
    'Number System',
    'Arithmetic',
    'Time & Work',
    'Speed & Distance',
    'Interest & Discount',
    'Mensuration',
    'Geometry & Trigonometry',
    'Permutation, Combination & Probability',
    'Data Interpretation',
    'Miscellaneous',
  ],
  chapterHeading:
    /^(?:\d{1,2}[.)]?\s*)?(number system|h\.?\s?c\.?\s?f\.?(?:\s*(?:and|&)\s*l\.?\s?c\.?\s?m\.?)?|l\.?\s?c\.?\s?m\.?|decimal fractions?|simplification|square roots?(?:\s*(?:and|&)\s*cube roots?)?|cube roots?|average|problems on (?:numbers|ages)|surds(?:\s*(?:and|&)\s*indices)?|indices|percentage|profit (?:and|&) loss|ratio (?:and|&) proportion|partnership|chain rule|time (?:and|&) work|pipes (?:and|&) cisterns|time (?:and|&) distance|problems on trains|boats (?:and|&) streams|alligation(?:\s*or\s*mixtures?)?|mixtures?|simple interest|compound interest|logarithms?|area|volumes?(?:\s*(?:and|&)\s*surface areas?)?|races (?:and|&) games|calendar|clocks?|stocks (?:and|&) shares|permutations?(?:\s*(?:and|&)\s*combinations?)?|combinations?|probability|true discount|banker'?s discount|heights (?:and|&) distances|trigonometr\w*|geometr\w*|data interpretation|tabulation|bar graphs?|pie charts?|line graphs?)\s*$/i,
  chapterCategory: [
    [/\b(number system|h\.?c\.?f|l\.?c\.?m|decimal|simplification|square root|cube root|surd|indice|logarithm|problems? on numbers?)/i, 'Number System'],
    [/\b(average|percentage|profit|loss|ratio|proportion|partnership|chain rule|alligation|mixture|problems? on ages?)/i, 'Arithmetic'],
    [/\b(time (and|&) work|pipes? (and|&) cisterns?)/i, 'Time & Work'],
    [/\b(time (and|&) distance|speed|trains?|boats? (and|&) streams?|races? (and|&) games?)/i, 'Speed & Distance'],
    [/\b(simple interest|compound interest|true discount|banker'?s discount|stocks? (and|&) shares?)/i, 'Interest & Discount'],
    [/\b(area|volume|surface area|mensuration)/i, 'Mensuration'],
    [/\b(geometr|trigonometr|heights? (and|&) distances?)/i, 'Geometry & Trigonometry'],
    [/\b(permutation|combination|probability)/i, 'Permutation, Combination & Probability'],
    [/\b(data interpretation|tabulation|bar graph|pie chart|line graph)/i, 'Data Interpretation'],
    [/\b(calendar|clocks?|series)/i, 'Miscellaneous'],
  ],
  subjectFor: () => 'quantitative_aptitude',
  examRelevance: ['SSC_CGL', 'SSC_CHSL', 'SSC_MTS', 'BPSC', 'UPSC', 'RAILWAY', 'BANKING', 'STATE_PSC', 'GENERAL'],
  probeQueries: [
    'What is the formula for compound interest?',
    'Shortcut for solving time and work problems.',
    'How do you find the HCF of two numbers?',
    'Formula for the area and circumference of a circle.',
    'What is the formula for average speed over two equal distances?',
    'How to calculate profit and loss percentage?',
    'Difference between permutations and combinations with formulas.',
  ],
};

const SCHAND_REASONING: ReferenceBook = {
  key: 'schand_reasoning',
  title: 'A Modern Approach to Verbal & Non-Verbal Reasoning',
  publisher: 'S. Chand',
  author: 'R.S. Aggarwal',
  language: 'English',
  domain: 'reasoning',
  stagingDir: 'schand/reasoning',
  categories: ['Verbal Reasoning', 'Logical Deduction', 'Non-Verbal Reasoning', 'Miscellaneous'],
  chapterHeading:
    /^(?:\d{1,2}[.)]?\s*)?(series completion|analog(?:y|ies)|classification|coding[- ]?decoding|blood relations?|puzzle test|sequential output|direction sense test|(?:logical )?venn diagrams?|alphabet test|alpha[- ]?numeric sequence|number,? ranking (?:and|&) time sequence|number series|ranking test|mathematical operations|logical sequence of words|arithmetical reasoning|inserting the missing character|data sufficiency|eligibility test|assertion (?:and|&) reason|situation reaction test|verification of truth|logical deduction|syllogism|logic|statement[- ](?:arguments?|assumptions?|conclusions?|course of action)|cause (?:and|&) effect|analytical reasoning|mirror[- ]?images?|water[- ]?images?|(?:spotting (?:out )?the )?embedded figures?|completion of (?:incomplete )?pattern|figure matrix|paper folding|paper cutting|rule detection|grouping of identical figures|cubes? (?:and|&) dice|dot situation|construction of squares? (?:and|&) triangles?|figure formation(?: (?:and|&) analysis)?|dice)\s*$/i,
  chapterCategory: [
    [/\b(mirror[- ]?images?|water[- ]?images?|embedded figures?|incomplete pattern|figure matrix|figure series|paper folding|paper cutting|rule detection|grouping of identical|cubes?\b|\bdice\b|dot situation|construction of squares|figure formation|non[- ]?verbal|analytical reasoning)/i, 'Non-Verbal Reasoning'],
    [/\b(logical deduction|syllogism|statement.*(argument|assumption|conclusion|course of action)|cause (and|&) effect|assertion (and|&) reason|\blogic\b)/i, 'Logical Deduction'],
    [/\b(series|analog|classification|coding|decoding|blood relation|direction sense|puzzle|venn|alphabet|alpha[- ]?numeric|ranking|number.*sequence|mathematical operation|logical sequence of words|arithmetical reasoning|missing character|data sufficiency|eligibility|situation reaction|verification of truth)/i, 'Verbal Reasoning'],
  ],
  subjectFor: () => 'reasoning',
  examRelevance: ['SSC_CGL', 'SSC_CHSL', 'SSC_MTS', 'BPSC', 'UPSC', 'RAILWAY', 'BANKING', 'STATE_PSC', 'GENERAL'],
  probeQueries: [
    'How do you solve blood relations problems?',
    'Shortcut methods for coding-decoding.',
    'Rules for syllogism and logical deduction.',
    'How to approach a seating-arrangement puzzle.',
    'Method for the direction sense test.',
    'Rules for cubes and dice problems.',
    'How to identify the odd one out in a classification.',
  ],
};

const LUCENT_ENGLISH: ReferenceBook = {
  key: 'lucent_english',
  title: "Lucent's General English",
  publisher: 'Lucent Publication',
  language: 'English',
  domain: 'english',
  stagingDir: 'lucent/english',
  categories: ['Grammar', 'Vocabulary', 'Usage & Composition', 'Comprehension', 'Miscellaneous'],
  // Chapter list is the ACTUAL contents page of this scanned copy (A.K. Thakur / Lucent, Hindi-
  // English bilingual edition) — 39 chapters, extracted from its own OCR'd TOC rather than
  // guessed. Kept alongside the earlier generic patterns (the sentence, parts of speech, direct/
  // indirect speech, …) so a different edition's headings still match.
  chapterHeading:
    /^(?:(?:section|chapter|unit|part)\s*[-\dA-Z.:]*\s*)?(?:\d{1,2}[.)]?\s*)?(the sentence|parts? of speech|syntax|the noun|noun(?: and the (?:number|gender|case))?|the pronoun|pronoun|the adjective|adjective|the article|articles?|the verb|verb(?: form)?|auxiliary verbs?|the adverb|adverb|the preposition|preposition|the conjunction|conjunction|the interjection|the tense[s]?|time and tense|tenses?|sequence of tenses|interchange of degrees of comparison|degrees of comparison|narration|direct (?:and|&) indirect (?:speech|narration)|reported speech|the voice|voice|active (?:and|&) passive voice|removal of too|subject[- ]verb agreement|concord|the non[- ]?finites?|non-?finites?|infinitive[s]?|gerund[s]?|participle[s]?|question tags?|emphatic with do\s*\/?\s*does\s*\/?\s*did|conditional sentences?|modals?|clauses?|determiners?|synonyms?|antonyms?|one word substitutions?|words often confused|idioms? (?:and|&) phrases?|proverbs?|phrasal verbs?|homophones?|homonyms?|spelling(?: tes?t?)?|foreign words?(?: (?:and|&) phrases?)?|spotting errors?|error (?:detection|spotting)|common errors?|correction of (?:the )?sentences?|transformation of sentences?(?:-?[iI]{1,2})?|analysis of sentences?|synthesis of sentences?|sentence improvement|sentence correction|fill in the blanks?|cloze test|(?:sentence |para )?(?:jumbles?|rearrangement)|reading comprehension|comprehension|precis writing|letter writing|essay writing|the same word used as different parts of speech|miscellan\w*)\s*$/i,
  chapterCategory: [
    [/\b(synonym|antonym|one word substitution|words often confused|idiom|\bphrase\b|proverb|phrasal verb|homophone|homonym|spelling|foreign words?)/i, 'Vocabulary'],
    [/\b(spotting error|error detection|error spotting|common error|correction of (?:the )?sentence|transformation of sentence|analysis of sentence|synthesis of sentence|sentence improvement|sentence correction|fill in the blank|cloze|jumble|rearrangement|question tag|emphatic with)/i, 'Usage & Composition'],
    [/\b(comprehension|precis|letter writing|essay writing|passage)/i, 'Comprehension'],
    [/\b(sentence|parts? of speech|syntax|\bnoun|\bpronoun|adjective|article|\bverb\b|verb form|auxiliary verb|\badverb|preposition|conjunction|interjection|tense|narration|reported speech|direct (and|&) indirect|\bvoice\b|active (and|&) passive|removal of too|subject[- ]verb|concord|non[- ]?finite|infinitive|gerund|participle|conditional|modal|\bclause|determiner|degrees of comparison|same word used as different parts of speech)/i, 'Grammar'],
    [/\bmiscellan/i, 'Miscellaneous'],
  ],
  subjectFor: () => 'english',
  examRelevance: ['SSC_CGL', 'SSC_CHSL', 'SSC_MTS', 'BPSC', 'UPSC', 'RAILWAY', 'BANKING', 'STATE_PSC', 'GENERAL'],
  probeQueries: [
    'Rules for converting direct speech to indirect speech.',
    'Rules for changing active voice to passive voice.',
    'Difference between a gerund and an infinitive with examples.',
    'Subject-verb agreement rules.',
    'Rules for using the articles a, an and the.',
    'Common idioms and phrases with their meanings.',
    'One-word substitutions for common phrases.',
  ],
};

export const BOOKS: Record<string, ReferenceBook> = {
  [GK.key]: GK,
  [SCIENCE.key]: SCIENCE,
  [SCHAND_QUANT.key]: SCHAND_QUANT,
  [SCHAND_REASONING.key]: SCHAND_REASONING,
  [LUCENT_ENGLISH.key]: LUCENT_ENGLISH,
  // aliases so the earlier `--book=gk|science` invocations still resolve
  gk: GK,
  science: SCIENCE,
};

export function resolveBook(key: string): ReferenceBook {
  const b = BOOKS[key];
  if (!b) {
    throw new Error(`Unknown --book=${key}. Known: ${[...new Set(Object.values(BOOKS).map((x) => x.key))].join(', ')}`);
  }
  return b;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Chunk + source record shapes
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReferenceSourceRecord {
  id: string; // = book.key
  book: string; // = book.key
  publisher: string;
  author: string;
  book_title: string;
  source_filename: string;
  source_path_at_ingest: string;
  edition: string; // 'UNSPECIFIED' until known — never invented
  publication_year: string; // 'UNSPECIFIED' until known
  language: 'English' | 'Hindi';
  source_type: 'reference_book';
  /** NEVER set to 'licensed' by the pipeline. Starts 'user-provided'. */
  source_status: 'user-provided' | 'licensed' | 'authorized';
  source_sha256: string;
  pdf_page_count: number;
  watermark_present: boolean;
  watermark_note: string;
  ingestedAt: string;
  notes: string;
}

export interface ReferenceChunk {
  chunk_id: string;
  parent_document_id: string; // = book.key
  book: string; // = book.key
  book_title: string;
  publisher: string;

  part: string;
  chapter: string;
  section: string;
  topic: string;
  subtopic: string;

  category: string;
  subject: string;

  text: string;
  knowledge_type: KnowledgeType;

  page_start: number;
  page_end: number;
  pdf_page: number; // OCR-slice midpoint
  pdf_page_start?: number; // OCR-slice page range — used to rasterise the figure page(s)
  pdf_page_end?: number;
  language: 'English' | 'Hindi';

  exam_relevance: ExamCode[];
  relevance_tier: RelevanceTier;

  needs_review?: boolean;
  review_reason?: string;
  relevance?: RelevanceClass;
  relevance_drop_reason?: string;

  // Option A — figure-dependent chunks (non-verbal reasoning, DI charts, geometry). The chunk
  // text is embedded so it stays searchable; `figure_asset` (a Firebase Storage path) points at
  // a rendered page image the retrieval layer surfaces alongside it. Set by stage 07.
  has_figure?: boolean;
  figure_asset?: string; // storage path, e.g. "reference-assets/schand_reasoning/p0123-p0124.png"

  content_hash?: string;
  near_duplicate_of?: string;
  cross_corpus_overlap?: string[];
}

/** Builds the Pinecone metadata record — undefined-free, isolation flags hard-set. */
export function buildReferenceVectorMetadata(
  chunk: ReferenceChunk,
  source: ReferenceSourceRecord,
  book: ReferenceBook,
): RecordMetadata {
  return {
    chunk_id: chunk.chunk_id,
    parent_document_id: chunk.parent_document_id,
    content_hash: chunk.content_hash || sha256(chunk.text),

    // ── source / provenance — preserved exactly, never embellished ──
    source_type: 'reference_book',
    source_name: book.publisher,
    publisher: book.publisher,
    author: book.author || '',
    book: book.key,
    book_title: book.title,
    source_filename: source.source_filename || '',
    edition: source.edition || 'UNSPECIFIED',
    publication_year: source.publication_year || 'UNSPECIFIED',
    source_status: source.source_status || 'user-provided',
    watermark_present: !!source.watermark_present,
    needs_review: !!chunk.needs_review,

    page_number: chunk.page_start || 0,
    page_end: chunk.page_end || chunk.page_start || 0,
    pdf_page: chunk.pdf_page || 0,
    chapter: chunk.chapter || '',
    section: chunk.section || '',
    subject: chunk.subject || '',
    topic: chunk.topic || '',
    subtopic: chunk.subtopic || '',
    category: chunk.category || '',
    language: chunk.language || 'English',

    text: chunk.text,
    knowledge_type: chunk.knowledge_type,

    exam_relevance: chunk.exam_relevance,
    relevance_tier: chunk.relevance_tier,
    relevance: chunk.relevance || 'content',
    has_figure: !!chunk.has_figure,
    figure_asset: chunk.figure_asset || '', // Firebase Storage path; retrieval mints a signed URL

    authority: 'secondary_reference',
    authority_score: 0.9,

    // ── HARD isolation flags ──
    content_type: 'reference_book',
    corpusBucket: CORPUS_BUCKET,
    vectorKind: VECTOR_KIND,
    is_pyq: false,
    is_generated: false,
    is_mock: false,
    public: true,
    owner: 'sadhya-reference',
    userId: '',

    indexedAt: new Date().toISOString(),
  };
}

/** Text that actually gets embedded — hierarchy prepended so the vector is self-describing. */
export function buildReferenceEmbeddingText(chunk: ReferenceChunk): string {
  const path = [chunk.book_title, chunk.part, chunk.chapter, chunk.section, chunk.topic, chunk.subtopic]
    .filter(Boolean)
    .join(' › ');
  return [`Reference: ${path}`, `Category: ${chunk.category} | Type: ${chunk.knowledge_type}`, '', chunk.text].join('\n');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s.replace(/\s+/g, ' ').trim()).digest('hex');
}

export function makeChunkId(sourceId: string, pdfPage: number, text: string): string {
  return `${sourceId}_p${String(pdfPage).padStart(4, '0')}_${sha256(text).slice(0, 12)}`;
}

/**
 * Decide whether a chunk is substantive knowledge, or navigation / front-matter / index /
 * boilerplate / advertisement to exclude. Conservative — drops only clear non-content; every
 * drop carries a reason and is written to chunks.excluded.json for review.
 */
export function classifyRelevance(
  chunk: Pick<ReferenceChunk, 'text' | 'knowledge_type' | 'pdf_page' | 'chapter' | 'has_figure'>,
  pdfPageCount: number,
  book: ReferenceBook,
): { relevance: RelevanceClass; reason: string } {
  const keep = { relevance: 'content' as RelevanceClass, reason: '' };
  const t = chunk.text.trim();
  const lines = t.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const words = t.split(/\s+/).filter(Boolean);
  const drop = (relevance: RelevanceClass, reason: string) => ({ relevance, reason });

  // A figure-dependent chunk (Option A) is a complete unit once its page image is attached — the
  // text can be thin (a directions line + question numbers) but the picture carries it. Exempt it
  // from the near-empty / exercise / low-density drops. Stage 05 still routes it to review if
  // stage 07 could not produce an asset.
  if (chunk.has_figure && words.length >= 4) return keep;

  if (words.length < 6) return drop('boilerplate', 'heading-only or near-empty chunk');

  // publisher advert / piracy-site promo page
  if (findAds(t).length >= 1 && (findAds(t).length >= 2 || words.length < 60)) {
    return drop('boilerplate', 'publisher advertisement / piracy-site promo page');
  }

  // running header / footer / lone page-number furniture (whole chunk is furniture)
  const titleWords = book.title.replace(/[^\w\s]/g, '').trim();
  const furniture = new RegExp(
    `^(${titleWords.replace(/\s+/g, '\\s+')}|general\\s+(knowledge|science)|chapter\\s+\\d+|exercise\\s*\\d*[a-z]?|\\d{1,4})$`,
    'i',
  );
  if (lines.every((l) => furniture.test(l))) return drop('boilerplate', 'running header / page furniture only');

  // front matter
  if (
    chunk.pdf_page > 0 &&
    chunk.pdf_page <= 8 &&
    /\b(copyright|all rights reserved|no part of this (publication|book)|ISBN|printed at|published by|first edition|reprinted|preface|foreword|acknowledgement|about the (book|author)|price\s*[:₹])\b/i.test(t)
  ) {
    return drop('front-matter', 'copyright / preface / publisher front matter');
  }

  // table of contents
  const tocLine = /(\.\s?){4,}|…{2,}|\s\d{1,3}\s*[-–]\s*\d{1,3}\s*$/;
  const tocCount = lines.filter((l) => tocLine.test(l)).length;
  if (tocCount >= 3 && tocCount / lines.length > 0.4) return drop('navigation', 'table-of-contents listing');

  if (/^\(?\s*see\s+(details\s+)?(on\s+)?page\s+\d+\s*\)?\.?$/i.test(t)) return drop('navigation', 'cross-reference stub');

  if (!chunk.chapter) {
    return chunk.pdf_page > 0 && chunk.pdf_page <= 12
      ? drop('navigation', 'no chapter context on an early page — table-of-contents / front matter')
      : drop('low', 'no chapter context — not a self-describing retrievable unit');
  }

  // Unsolved practice-question / exercise block. Aptitude & reasoning books devote most of their
  // pages to these — numbered stems with (a)…(e) option groups and NO worked solution. The book's
  // *solved* examples and its facts/formulae are numbered too, so the discriminator is a run of
  // MCQ option-groups without any "Sol."/"Solution"/"Explanation". Not reference knowledge.
  // `science` added here 2026-09-12: lucent_science ends nearly every part (Physics, Astronomy,
  // Computer, Chemistry, Biology) with an unsolved "Objective Questions" MCQ block, same shape as
  // the aptitude/reasoning books — confirmed via exam-tag density ([NDA 2010], [BPSC 2011], etc.)
  // on the pages that were tripping this. `gk` likely has the same gap (same publisher, same
  // "Objective Questions" convention) but lucent_gk is already ingested — not touched here without
  // being asked, since this domain list only affects books not yet executed.
  if (book.domain === 'aptitude' || book.domain === 'reasoning' || book.domain === 'english' || book.domain === 'science') {
    const optionGroups = (t.match(/\(\s*[a-e]\s*\)\s*\S/g) || []).length;
    const numberedStems = (t.match(/(^|\n)\s*\d{1,3}\.\s+[A-Z(]/g) || []).length;
    const examTags = (t.match(/\([A-Z][A-Z.&/ ]{1,28},?\s*(?:19|20)\d{2}\)/g) || []).length; // "(S.S.C., 2010)"
    // R.S. Aggarwal marks every solved example with "Sol." — its absence + an MCQ layout = exercise.
    const hasSolution = /\bsol\s*\.|\bsolution\s*[:.]|\bexplanation\s*[:.]|\bwe have\b|\bclearly[,\s]|\brequired (?:answer|value|number)\b/i.test(t);
    const looksLikeExerciseSet =
      optionGroups >= 8 || (optionGroups >= 4 && numberedStems >= 3) || (numberedStems >= 4 && examTags >= 2);
    if (!hasSolution && looksLikeExerciseSet) {
      return drop('exercise', 'unsolved practice-question block — numbered MCQ stems with options, no worked solution');
    }
  }

  // back-of-book index
  const idxLine = /[A-Za-z].*,\s*\d{1,4}(\s*,\s*\d{1,4})+\s*$/;
  const idxCount = lines.filter((l) => idxLine.test(l)).length;
  const nearEnd = pdfPageCount > 0 && chunk.pdf_page > pdfPageCount * 0.9;
  if (idxCount >= 4 && idxCount / lines.length > 0.5) return drop('index', 'back-of-book index listing');
  if (nearEnd && idxCount >= 2 && idxCount / lines.length > 0.35) return drop('index', 'back-of-book index listing (tail of book)');

  // low information density (tables exempt)
  const alpha = (t.match(/[A-Za-zÀ-ɏ]/g) || []).length;
  if (chunk.knowledge_type !== 'table' && t.length > 0 && alpha / t.length < 0.4) {
    return drop('low', 'low text density (mostly punctuation / numbers / whitespace)');
  }

  // too short (tables / definitions / formulas / worked examples exempt)
  if (t.length < RELEVANCE_MIN_CHARS && !['table', 'definition', 'formula', 'worked_example'].includes(chunk.knowledge_type)) {
    return drop('low', `below ${RELEVANCE_MIN_CHARS} chars and not a table / definition / formula`);
  }

  return keep;
}

/** Metadata validation for the dry-run report. Returns a list of problems (empty = valid). */
export function validateVectorMetadata(md: RecordMetadata): string[] {
  const problems: string[] = [];
  const required = [
    'chunk_id', 'parent_document_id', 'content_hash', 'source_type', 'source_name', 'publisher', 'book',
    'book_title', 'source_filename', 'edition', 'publication_year', 'page_number', 'pdf_page',
    'chapter', 'subject', 'text', 'knowledge_type', 'language', 'exam_relevance',
    'content_type', 'corpusBucket', 'vectorKind', 'is_pyq', 'is_generated', 'is_mock',
    'source_status', 'authority',
  ];
  for (const k of required) {
    if (!(k in md) || (md as any)[k] === undefined || (md as any)[k] === null) problems.push(`missing "${k}"`);
  }
  for (const [k, v] of Object.entries(md)) {
    if (v === undefined) problems.push(`undefined value for "${k}" (Pinecone rejects it)`);
    if (typeof v === 'string' && v === '' && ['chunk_id', 'text', 'book_title', 'source_filename', 'chapter', 'book'].includes(k)) {
      problems.push(`empty "${k}"`);
    }
  }
  if ((md as any).content_type !== 'reference_book') problems.push(`content_type = "${(md as any).content_type}"`);
  if ((md as any).corpusBucket !== CORPUS_BUCKET) problems.push(`corpusBucket = "${(md as any).corpusBucket}" (want "${CORPUS_BUCKET}")`);
  if ((md as any).vectorKind !== VECTOR_KIND) problems.push(`vectorKind = "${(md as any).vectorKind}"`);
  if ((md as any).is_pyq !== false) problems.push('is_pyq must be exactly false');
  if ((md as any).is_generated !== false) problems.push('is_generated must be exactly false');
  if ((md as any).is_mock !== false) problems.push('is_mock must be exactly false');
  return problems;
}
