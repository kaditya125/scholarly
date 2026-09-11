/**
 * Kruti Dev 010 → Unicode Devanagari.
 *
 * The NCERT Hindi PDFs carry no Unicode text layer. They were typeset in Kruti Dev, a legacy
 * font that maps Devanagari glyphs onto ASCII code points, so a text extractor pulls out
 * "eSaus gSjku gksdj ns[kk" where the page reads "मैंने हैरान होकर देखा". The bytes are not
 * corrupt — they are a substitution cipher, and it is reversible.
 *
 * Two things make it more than a lookup table:
 *
 *   i-matra   Kruti stores ि in *visual* order, before its consonant cluster ("fr" = ति).
 *             Unicode stores it in *logical* order, after. It has to move right.
 *   reph      Kruti stores र् after the cluster it belongs to ("dk;Z" = कार्य). It has to
 *             move left, past the consonant but not past that consonant's matra.
 *
 * Both are handled with private-use placeholders rather than the real characters, so the
 * reordering passes can't confuse a moved ि with one that was already in the right place, or
 * a reph with a genuine standalone र + ्.
 *
 * Scope: this converts Kruti Dev only. It is not a general legacy-font decoder — DevLys,
 * Chanakya and Shusha use different tables and would need their own, and Unicode text that is
 * merely badly *ordered* (some of the Sanskrit books) is a separate problem entirely.
 */

const I_MATRA = ''; // stands in for ि until it has been moved right
const REPH = '';    // stands in for र् until it has been moved left
const HALANT = '';  // an author's own '~' halant, exempt from stray-halant cleanup
const SLASH = '';   // a literal '/', which Kruti otherwise spends on ध्
const I_MATRA_ANUSVARA = ''; // pre-base ि carrying an anusvara: अहिंसा, हिंदी

/**
 * Ordered longest-first. Order is load-bearing: "Fk" must be tried before "F", or थ decodes
 * as a half-pha followed by a stray ka.
 */
const KRUTI_MAP: [string, string][] = [
  // ── The oQ family ──────────────────────────────────────────────────────────────────────
  // Kruti draws क with most matras as two glyphs that bracket the matra, so क cannot be a
  // single-character mapping. These have to be matched before "o" is read as व or "Q" as फ.
  ['oksQ', 'को'], ['okSQ', 'कौ'], ['o`Q', 'कृ'], ['osQ', 'के'], ['oSQ', 'कै'],
  ['oqQ', 'कु'], ['owQ', 'कू'], ['oaQ', 'कं'], ['oQ', 'क'],

  // फ brackets its matra exactly the same way ("isaQd" = फेंक, "xqiQk" = गुफा), so it needs the
  // same treatment. These must stay ahead of the bare 'i' (प) and 'Q' (फ) in the table, or
  // "iQy" decodes as पफल instead of फल — and behind the oQ family, so "vkiosQ" stays आपके.
  ['iszQ', 'फ्रे'], ['iSaQ', 'फैं'], ['isaQ', 'फें'], ['iwQ', 'फू'], ['iSQ', 'फै'],
  ['isQ', 'फे'], ['iqQ', 'फु'], ['iQ', 'फ'],

  // ── Conjuncts and ligatures ────────────────────────────────────────────────────────────
  ['{k', 'क्ष'], ['{', 'क्ष्'], ['=k', 'त्र'], ['=', 'त्र्'], ['K', 'ज्ञ'], ['J', 'श्र'], ['Ùk', 'त्त'], ['Ù', 'त्त्'],
  ['Ø', 'क्र'], ['æ', 'द्र'], ['|', 'द्य'], ['}', 'द्व'], ['Ò', 'द्ध'], ['#', 'रु'],
  [':', 'रू'], ['z', '्र'],

  // ── Nuktas ─────────────────────────────────────────────────────────────────────────────
  ['M+', 'ड़'], ['<+', 'ढ़'], ['Q+', 'फ़'], ['t+', 'ज़'], ['x+', 'ग़'], ['[k+', 'ख़'],
  ['d+', 'क़'],

  // ── Consonants, full forms ─────────────────────────────────────────────────────────────
  ['?k', 'घ'], ['Hk', 'भ'], ["'k", 'श'], ['"k', 'ष'], ['.k', 'ण'], ['Fk', 'थ'],
  ['/k', 'ध'], ['èk', 'ध'], ['[k', 'ख'],
  ['Ük', 'श'], ['Xk', 'ग'],
  ['d', 'क'], ['x', 'ग'], ['p', 'च'], ['N', 'छ'], ['t', 'ज'], ['>', 'झ'],
  ['V', 'ट'], ['B', 'ठ'], ['M', 'ड'], ['<', 'ढ'], ['r', 'त'], ['n', 'द'],
  ['u', 'न'], ['i', 'प'], ['Q', 'फ'], ['c', 'ब'], ['e', 'म'], [';', 'य'],
  ['j', 'र'], ['y', 'ल'], ['o', 'व'], ['l', 'स'], ['g', 'ह'],

  // ── Consonants, half forms (bare stem, no vertical bar) ────────────────────────────────
  ['D', 'क्'], ['X', 'ग्'], ['?', 'घ्'], ['P', 'च्'], ['T', 'ज्'],
  ['R', 'त्'], ['F', 'थ्'], ['/', 'ध्'], ['è', 'ध्'], ['U', 'न्'], ['I', 'प्'],
  ['C', 'ब्'], ['H', 'भ्'], ['E', 'म्'], ['Y', 'ल्'], ['O', 'व्'], ["'", 'श्'],
  ['"', 'ष्'], ['L', 'स्'], ['.', 'ण्'], [',', 'ए'],

  // ── Independent vowels ─────────────────────────────────────────────────────────────────
  // "vk" before "v", and ",s" before ",", for the same longest-first reason.
  ['vkS', 'औ'], ['vks', 'ओ'], ['vk', 'आ'], ['bZ', 'ई'], [',s', 'ऐ'],
  ['v', 'अ'], ['b', 'इ'], ['m', 'उ'], ['Å', 'ऊ'], ['_', 'ऋ'],

  // ── Matras ─────────────────────────────────────────────────────────────────────────────
  ['kas', 'ों'], ['ks', 'ो'], ['kS', 'ौ'], ['k', 'ा'], ['h', 'ी'], ['q', 'ु'], ['w', 'ू'],
  ['`', 'ृ'], ['s', 'े'], ['S', 'ै'], ['kW', 'ॉ'], ['W', 'ॉ'], ['a', 'ं'], ['¡', 'ँ'], ['%', 'ः'],
  ['+', '़'],


  // ── Extended block: conjuncts drawn as a single glyph ──────────────────────────────────
  // Read off the corpus in context, not guessed — "laLÑfr" is संस्कृति, so Ñ is कृ.
  ['Ñ', 'कृ'],      // laLÑfr  संस्कृति
  ['¼', 'द्ध'],      // ckS¼    बौद्ध
  ['ç', 'प्र'],      // çdV     प्रकट
  ['ª', '्र'],       // jk"Vªh; राष्ट्रीय
  ['â', 'हृ'],       // ân;     हृदय
  ['Ý+', 'फ़्'], ['Ý', 'फ़्'],  // g-Ýrs  हफ़्ते
  ['”k', 'ज़'], ['”', 'ज़्'],   // g”kkjksa हज़ारों
  ['¶', '“'], ['¸', '”'],      // ¶D;k\¸  “क्या?”

  // ── Punctuation and symbols ────────────────────────────────────────────────────────────
  ['A', '।'], [']', ','], ['@', '/'], ['\\', '?'], ['µ', '—'], ['μ', '—'], ['&', '-'],
  ['^', '‘'], ['*', '’'], ['ß', '“'], ['Þ', '”'],
];

/**
 * Resolved before 'Z' is swapped for the reph placeholder, because these sequences contain a
 * 'Z' that is not a reph. Miss this and "bZ" (ई) decodes as इ with a reph hung off it.
 */
const PRE_MAP: [string, string][] = [
  ['bZ', 'ई'],   // ई
  ['iZQ', 'र्फ'],     // fliZQ  सिर्फ  — reph already sits where Unicode wants it
  ['oZQ', 'र्क'],     // laioZQ संपर्क
  ['~', HALANT],        // an explicitly typed halant, kept through dropStrayHalants
  ['¯', I_MATRA_ANUSVARA], // v¯glk  अहिंसा — a pre-base ि that also carries an anusvara
  ['±', REPH + 'ं'],       // o"kks±  वर्षों — a reph that also carries one
  ['Z', REPH],          // every remaining Z really is a reph
  ['f', I_MATRA],
];

const CONSONANT = /[क-हक़-य़]/;
const COMBINING = /[ऀ-ःऺ-्॑-ॗॢॣ]/;

/**
 * Move each i-matra placeholder to the right of the consonant cluster that follows it.
 * " स ् थ" → "स ् थ ि", giving स्थि.
 */
function reorderIMatra(text: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    const trailing = text[i] === I_MATRA ? 'ि' : text[i] === I_MATRA_ANUSVARA ? 'िं' : null;
    if (trailing === null) {
      out.push(text[i++]);
      continue;
    }

    i++; // step over the placeholder
    const cluster: string[] = [];

    // A cluster is one consonant, plus any number of halant-joined consonants after it.
    while (i < text.length && CONSONANT.test(text[i])) {
      cluster.push(text[i++]);
      if (text[i] === '्' && i + 1 < text.length && CONSONANT.test(text[i + 1])) {
        cluster.push(text[i++]); // the halant
        continue;
      }
      break;
    }

    // Nukta belongs to the consonant, so it stays ahead of the matra.
    if (text[i] === '़') cluster.push(text[i++]);

    out.push(...cluster, cluster.length ? trailing : '');
  }

  return out.join('');
}

/**
 * Move each reph placeholder to the left of the consonant it sits on — but not past that
 * consonant's own matra. "क ा य ⟨reph⟩" → "क ा र् य", giving कार्य.
 */
function reorderReph(text: string): string {
  const chars = text.split('');

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== REPH) continue;

    let j = i - 1;
    while (j >= 0 && COMBINING.test(chars[j])) j--; // skip the matras it was parked behind

    // Consume one consonant cluster, walking back over halant joins.
    while (j >= 0 && CONSONANT.test(chars[j])) {
      if (j - 1 >= 0 && chars[j - 1] === '्') { j -= 2; continue; }
      break;
    }

    if (j < 0 || !CONSONANT.test(chars[j])) { chars[i] = ''; continue; } // nothing to attach to

    chars.splice(i, 1);
    chars.splice(j, 0, 'र्');
  }

  return chars.join('');
}

/**
 * Longest key first. KRUTI_MAP is written grouped by category for readability; applying it in
 * that order would let a one-character key shadow a longer one further down the table.
 */
const SORTED_MAP: [string, string][] = [...KRUTI_MAP].sort((a, b) => b[0].length - a[0].length);

/**
 * Drop halants that cannot legally be there.
 *
 * Kruti's half-form glyphs ('/' = ध्, 'L' = स्) are what a typist reaches for whenever the next
 * letter joins, and they get used at the end of a word too, where nothing joins. Decoded
 * literally that yields "संबंध्" for संबंध and "संध्ू" for संधू. In Devanagari a halant is only
 * meaningful before a consonant, so anywhere else it is an artifact of the encoding.
 *
 * A halant the author actually typed comes through as '~' and is carried on a placeholder until
 * after this pass, so "सन्" keeps its halant while "संबंध्" loses one.
 */
function collapseVowelSigns(text: string): string {
  // A consonant takes exactly one vowel sign, so a run of two is always wrong. What is left
  // after the table is right is source-side: "gkssrk" and "vkèkqqfud" have a key struck twice
  // in the original NCERT files. Keeping the first sign is the only repair available, and it
  // beats emitting होेता for होता.
  return text.replace(/([ा-ौॎॏ])[ा-ौॎॏ]+/g, '$1');
}

function dropStrayHalants(text: string): string {
  return text.replace(/्(?![क-हक़-य़ॹ-ॿ])/g, '');
}

/** Convert one run of Kruti Dev text to Unicode Devanagari. */
export function krutiDevToUnicode(input: string): string {
  if (!input) return input;

  let text = input;

  // A '/' touching a digit is a real slash ("खतरनाक/139"), not a half-dha. Park it out of the
  // way before the table turns every '/' into ध्.
  text = text.replace(/(?<=\d)\/|\/(?=\d)/g, SLASH);

  for (const [from, to] of PRE_MAP) text = text.split(from).join(to);
  for (const [from, to] of SORTED_MAP) text = text.split(from).join(to);

  text = reorderIMatra(text);
  text = reorderReph(text);
  text = dropStrayHalants(text);
  text = collapseVowelSigns(text);

  return text.split(HALANT).join('्').split(SLASH).join('/');
}

/**
 * Kruti Dev encodings of the commonest Hindi words. Any real Hindi page hits several of these;
 * English prose hits none, because "osQ" and "vkSj" are not English letter sequences. That
 * makes them a far safer signal than a character-frequency score, which flags any text with an
 * unusual letter distribution — code listings and tables included.
 *
 * Deliberately excluded: "ml" (उस), "fd" (कि) and "ls" (से). Two plain lowercase letters occur
 * on their own in scientific notation, and a sweep of the whole index caught exactly that —
 * "n = 4, l = 1, ml = 0" in a chemistry chapter (the magnetic quantum number) and "fd" in a
 * geography chapter's frequency-times-deviation tables, both scoring high enough to be called
 * Hindi. Real Kruti pages hit the remaining signatures dozens to hundreds of times, so dropping
 * three costs nothing and closes the only false-positive route found.
 */
const SIGNATURES = [
  'osQ',    // के
  'gS',     // है
  'esa',    // में
  'vkSj',   // और
  'ugha',   // नहीं
  'dks',    // को
  'gksrk',  // होता
  'oqQN',   // कुछ
  ';g',     // यह
  'Fkk',    // था
  'djus',   // करने
  'fy,',    // लिए
];

export interface KrutiDetection {
  isKruti: boolean;
  hits: number;
  score: number;   // signature hits per 1000 characters
  devanagariRatio: number;
}

/**
 * Decide whether a run of text is Kruti Dev encoded.
 *
 * Deliberately conservative: converting text that was never Kruti would destroy it, and the
 * corpus is mixed — some of these books have real Unicode pages sitting next to legacy ones.
 * So a page must both look like Kruti (several signature words) and not already be Devanagari.
 */
export function detectKrutiDev(text: string): KrutiDetection {
  const empty = { isKruti: false, hits: 0, score: 0, devanagariRatio: 0 };
  if (!text || text.length < 40) return empty;

  const devanagari = (text.match(/[ऀ-ॿ]/g) || []).length;
  const devanagariRatio = devanagari / text.length;

  let hits = 0;
  for (const sig of SIGNATURES) {
    // Word-ish boundaries: "gS" inside a longer Latin word is noise, "gS" as a token is signal.
    const re = new RegExp(`(^|[^A-Za-z])${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`, 'g');
    const found = text.match(re);
    if (found) hits += found.length;
  }

  const score = (hits / text.length) * 1000;

  // Already Unicode Hindi — leave it alone whatever the Latin residue looks like.
  if (devanagariRatio > 0.2) return { isKruti: false, hits, score, devanagariRatio };

  // Three distinct hits is the ordinary bar. A short run — a single poem page, one chunk — can
  // only fit two, so density stands in for count there: two of these sequences in a few hundred
  // characters is not something English produces, now that the two-letter signatures which
  // could are gone.
  return { isKruti: hits >= 3 || (hits >= 2 && score >= 2), hits, score, devanagariRatio };
}

/**
 * Decode a document's pages in place, and report what happened.
 *
 * Shared by every extraction path so they cannot drift apart. A page is converted when either
 * test says so, because each catches what the other misses:
 *
 *   the document scores   carries the short pages — a half-page of Kruti may not hit three
 *                         signature words on its own, but it is not in a different font from
 *                         the chapter around it.
 *   the page scores       catches Hindi embedded in an English book. The Class 7 English reader
 *                         prints Maithili Sharan Gupt's "Chaah Nahi" in Kruti Dev, and a Class 5
 *                         EVS chapter has a Hindi passage on malaria; judged as whole documents
 *                         both are overwhelmingly English and would never be looked at.
 *
 * A page that is already Devanagari vetoes either way, which is what protects the mixed books
 * where Unicode pages sit beside legacy ones.
 *
 * Returns null when nothing was converted, so callers can skip logging entirely.
 */
export function decodeKrutiDevPages<T extends { text: string }>(
  pages: T[],
  fullText?: string,
): { convertedPages: number; totalPages: number; hits: number } | null {
  const whole = fullText ?? pages.map((p) => p.text).join('\n');
  const document = detectKrutiDev(whole);

  let convertedPages = 0;
  for (const page of pages) {
    if (!page.text) continue;
    const detection = detectKrutiDev(page.text);
    if (detection.devanagariRatio > 0.2) continue; // already Unicode, leave it
    if (!document.isKruti && !detection.isKruti) continue;
    page.text = krutiDevToUnicode(page.text);
    convertedPages++;
  }

  if (convertedPages === 0) return null;
  return { convertedPages, totalPages: pages.length, hits: document.hits };
}
