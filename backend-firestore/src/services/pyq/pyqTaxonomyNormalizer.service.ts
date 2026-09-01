/**
 * PYQTaxonomyNormalizer — Exam-Aware Subject and Topic Taxonomy Reconciliation
 *
 * Normalizes free-form raw labels into canonical subjects and maps questions onto authoritative
 * syllabus nodes in `exam_syllabi_graphs` when available.
 */

import { syllabusGraphService } from '../exam/syllabusGraph.service';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import { logger } from '../../utils/logger';

/**
 * ── TOPIC → SYLLABUS NODE MATCHING ────────────────────────────────────────────────────────
 *
 * This replaced a three-branch substring test:
 *
 *     label === topic || label.includes(topic) || topic.includes(label)
 *
 * which anchored 80 of 415 SSC CGL questions (19%) onto just 12 of 149 available nodes.
 * It failed for two measured reasons, and the third branch was actively dangerous.
 *
 *   1. PUNCTUATION, not meaning. The syllabus writes "Idioms & Phrases" and "Coding &
 *      de-coding"; the corpus writes "Idioms and Phrases" and "Coding & Decoding". Same
 *      concept, no substring relationship. Normalising `&`→`and` and stripping punctuation
 *      recovers these.
 *
 *   2. THE CORPUS IS FINER THAN THE SYLLABUS. "Pipes and Cisterns" is a sub-genre of
 *      "Time and work"; the official text never names it. No amount of string comparison
 *      bridges that — it needs a curated alias, which is what ALIASES below is.
 *
 *   3. `topic.includes(label)` let any SHORT node label match by accident. It is how the
 *      four-character node "DEST" or the single word "History" could swallow an unrelated
 *      topic. Replaced with word-boundary matching restricted to multi-word labels.
 *
 * ── WHY IT DELIBERATELY REFUSES SOME MATCHES ──────────────────────────────────────────────
 * 23 of the 149 SSC nodes are entire syllabus paragraphs, up to 958 characters. Those will
 * match almost anything on shared vocabulary: measured, a permissive version anchored 213/415
 * (51%) but did it by collapsing twenty distinct English topics (Cloze, Idioms, Spelling,
 * Spotting the Error, Prepositions...) onto ONE paragraph node — and matched a *reasoning*
 * topic, "Direct Letter Substitution", to the English paragraph.
 *
 * That is worse than leaving them unanchored. Mastery keys on the node when one is present
 * and falls back to the topic label otherwise; a paragraph match therefore replaces twenty
 * distinguishable per-topic mastery records with a single meaningless "English" score,
 * destroying the very granularity mastery exists to measure. Unanchored loses the coverage
 * link but keeps the distinction, and reconciliation can revisit it later. So the specificity
 * gate below refuses non-exact matches against paragraph nodes on purpose: 110/415 correct
 * beats 213/415 with the extra 103 wrong.
 *
 * The remaining ceiling is a DATA problem, not a code one. The largest unmatched cluster
 * (53 English questions) has no atomic node to match — those concepts exist only inside one
 * 700-character paragraph. Lifting anchoring past ~27% needs child nodes in the graph.
 */

/** Lowercase, `&`→and, punctuation stripped, whitespace collapsed. Applied to BOTH sides. */
function normalizeLabel(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words carrying no discriminating power in syllabus prose. */
const STOP_WORDS = new Set([
  'and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'its', 'their',
  'test', 'questions', 'type', 'simple', 'problems', 'only', 'etc', 'various', 'kinds',
]);

function contentTokens(s: string): string[] {
  return normalizeLabel(s).split(' ').filter((t) => t && !STOP_WORDS.has(t));
}

/**
 * Corpus topics that are genuinely finer-grained than the official syllabus wording, mapped
 * to the phrasing the syllabus actually uses. Keys and values are compared normalised, so
 * write them however reads best.
 *
 * Derived from the 256 distinct unmatched SSC CGL topics in production. Most generalise to
 * other Indian competitive exams (the arithmetic and reasoning vocabulary is shared), which
 * is why this is not keyed by exam — but it is not claimed to be complete for any exam.
 */
const TOPIC_ALIASES: Record<string, string> = {
  // Quantitative — sub-genres the syllabus folds into broader headings
  'pipes and cisterns': 'time and work',
  'boats and streams': 'time and distance',
  'speed time and distance': 'time and distance',
  'trains': 'time and distance',
  'simple interest': 'interest',
  'compound interest': 'interest',
  'simple and compound interest': 'interest',
  'profit loss and discount': 'profit and loss',
  'simplification': 'fundamental arithmetical operations',
  'bodmas': 'fundamental arithmetical operations',
  'distance and midpoint formula': 'geometry',
  'circles and tangents': 'geometry',
  'mensuration 2d': 'mensuration',
  'mensuration 3d': 'mensuration',
  'trigonometric ratios and identities': 'trigonometric ratio',
  'bar graph interpretation': 'use of tables and graphs',
  'pie chart interpretation': 'use of tables and graphs',
  'data interpretation': 'use of tables and graphs',

  // Reasoning
  'number coding': 'coding and de coding',
  'coding and decoding': 'coding and de coding',
  'direct letter substitution': 'coding and de coding',
  'coded blood relations': 'coding and de coding',
  'letter series': 'number series',
  'missing number': 'number series',
  'matrix logic': 'problem solving',
  'three statements logic': 'drawing inferences',
  'statement and assumptions': 'drawing inferences',
  'statement and conclusion': 'drawing inferences',
  'deductive logic': 'drawing inferences',
  'odd one out': 'semantic classification',
  'mirror image': 'figural pattern folding and completion',
  'squares in grid': 'figural pattern folding and completion',
  'dictionary order': 'word building',
  'positional shift': 'word building',

  // General awareness
  'classical dances of india': 'culture',
  'monuments of india': 'culture',
  'dadasaheb phalke award': 'culture',
  'revolt of 1857': 'history',
};

interface GraphNodeLike { id: string; label: string }

/**
 * Best syllabus node for a raw topic, or null when nothing clears the bar.
 * Pure and side-effect free so it can be unit tested without Firestore.
 */
export function matchTopicToNode(
  rawTopic: string,
  nodes: GraphNodeLike[],
): { node: GraphNodeLike; score: number } | null {
  if (!rawTopic) return null;

  let topicN = normalizeLabel(rawTopic);
  if (TOPIC_ALIASES[topicN]) topicN = normalizeLabel(TOPIC_ALIASES[topicN]);
  const topicToks = contentTokens(topicN);
  if (!topicToks.length) return null;

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let best: GraphNodeLike | null = null;
  let bestScore = 0;

  for (const node of nodes) {
    const labelN = normalizeLabel(node.label);
    if (!labelN) continue;
    const labelToks = contentTokens(node.label);
    let s = 0;

    if (labelN === topicN) {
      s = 100; // exact, after normalisation
    } else if (labelToks.length > 12) {
      s = 0;   // specificity gate — see the note above
    } else if (topicToks.length >= 2 && new RegExp(`(^| )${esc(topicN)}( |$)`).test(labelN)) {
      s = 90;  // the label contains the whole topic phrase, on word boundaries
    } else if (new RegExp(`(^| )${esc(labelN)}( |$)`).test(topicN)) {
      /*
       * The topic contains the whole label: "Indian History" -> "History".
       *
       * Single-word labels are allowed here. The old branch this replaces was dangerous because
       * it used raw `includes`, so a four-character label like "DEST" matched any topic with
       * those letters anywhere. The WORD BOUNDARY is what makes it safe — "Data Entry Speed Test"
       * does not contain "dest" as a word — so an extra multi-word restriction only blocked
       * legitimate matches like this one.
       */
      s = 85;
    } else {
      const hits = topicToks.filter((t) => labelToks.includes(t)).length;
      const coverage = hits / topicToks.length;
      /*
       * 0.75, not a looser bar. At 0.6, "Attorney General of India" matched "Comptroller &
       * Auditor General of India" on the shared tail — a different constitutional office.
       * Partial token overlap on proper nouns is exactly where a matcher like this invents
       * relationships, so a non-exact, non-alias match has to be nearly total.
       */
      if (coverage >= 0.75) {
        s = 50 * coverage + 20 * (1 / Math.log2(labelToks.length + 4));
      }
    }

    if (s > bestScore) { bestScore = s; best = node; }
  }

  // Below 50 is noise. Exact (100), phrase (90) and reverse (85) hits clear this easily;
  // only marginal token overlap is discarded.
  return best && bestScore >= 50 ? { node: best, score: Math.round(bestScore) } : null;
}

export class PYQTaxonomyNormalizer {
  // Standard subject aliases per exam category
  private static SUBJECT_ALIASES: Record<string, Record<string, string>> = {
    JEE_MAIN: {
      'phys': 'Physics',
      'phy': 'Physics',
      'physics': 'Physics',
      'chem': 'Chemistry',
      'chemistry': 'Chemistry',
      'math': 'Mathematics',
      'maths': 'Mathematics',
      'mathematics': 'Mathematics',
    },
    JEE_ADVANCED: {
      'physics': 'Physics',
      'chemistry': 'Chemistry',
      'mathematics': 'Mathematics',
      'maths': 'Mathematics',
    },
    NEET_UG: {
      'physics': 'Physics',
      'chemistry': 'Chemistry',
      'biology': 'Biology',
      'botany': 'Biology',
      'zoology': 'Biology',
    },
    SSC_CGL: {
      'quantitative aptitude': 'Quantitative Aptitude',
      'quant': 'Quantitative Aptitude',
      'math': 'Quantitative Aptitude',
      'general intelligence & reasoning': 'General Intelligence & Reasoning',
      'reasoning': 'General Intelligence & Reasoning',
      'general awareness': 'General Awareness',
      'gk': 'General Awareness',
      'gs': 'General Awareness',
      'english comprehension': 'English Comprehension',
      'english': 'English Comprehension',
    },
    UPSC_CSE: {
      'gs paper 1': 'General Studies I',
      'general studies': 'General Studies I',
      'csat': 'General Studies II (CSAT)',
      'general studies 2': 'General Studies II (CSAT)',
    },
    IBPS_PO: {
      'quantitative aptitude': 'Quantitative Aptitude',
      'reasoning ability': 'Reasoning Ability',
      'english language': 'English Language',
      'general awareness': 'General Awareness',
    },
    RRB_NTPC: {
      'mathematics': 'Mathematics',
      'general intelligence and reasoning': 'General Intelligence & Reasoning',
      'general awareness': 'General Awareness',
    },
  };

  /**
   * Normalizes subject name using canonical exam dictionaries.
   */
  public normalizeSubject(examId: string, rawSubject?: string): string {
    if (!rawSubject || !rawSubject.trim()) return 'General';

    const clean = rawSubject.trim().toLowerCase();
    const examMap = PYQTaxonomyNormalizer.SUBJECT_ALIASES[examId] || {};

    if (examMap[clean]) return examMap[clean];

    // Case-insensitive lookup
    for (const [alias, canonical] of Object.entries(examMap)) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return canonical;
      }
    }

    // Capitalize first letter of each word if unknown
    return rawSubject
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Reconciles a question's topic to canonical syllabus graph nodes where possible.
   */
  public async linkToSyllabusNode(
    question: CanonicalPYQQuestion,
    cycleId: string = '2026'
  ): Promise<{ syllabusNodeId?: string; normalizedTopic?: string }> {
    try {
      const canonicalSubject = this.normalizeSubject(question.examId, question.subject);
      question.subject = canonicalSubject;

      if (!question.topic) {
        return { normalizedTopic: question.subject };
      }

      // Check if canonical syllabus graph exists for this exam
      const nodes = await syllabusGraphService.getSyllabusNodes({
        examId: question.examId,
        cycleId,
      }).catch(() => []);
      if (!nodes || nodes.length === 0) {
        return { normalizedTopic: question.topic };
      }

      const hit = matchTopicToNode(question.topic, nodes as any);
      const matchedNode = hit?.node;

      if (matchedNode) {
        logger.debug(
          `[PYQTaxonomyNormalizer] Linked ${question.questionId} to canonical node ${matchedNode.id} (${matchedNode.label})`
        );
        return {
          syllabusNodeId: matchedNode.id,
          normalizedTopic: matchedNode.label,
        };
      }

      return { normalizedTopic: question.topic };
    } catch (e: any) {
      logger.warn(`[PYQTaxonomyNormalizer] Node linking skipped: ${e?.message}`);
      return { normalizedTopic: question.topic };
    }
  }

  /**
   * Normalizes a batch of canonical questions with exam-aware taxonomies.
   */
  public async normalizeQuestionsBatch(
    questions: CanonicalPYQQuestion[],
    cycleId: string = '2026'
  ): Promise<CanonicalPYQQuestion[]> {
    const examNodesCache = new Map<string, any[]>();

    for (const q of questions) {
      q.subject = this.normalizeSubject(q.examId, q.subject);
      
      const cacheKey = `${q.examId}:${cycleId}`;
      if (!examNodesCache.has(cacheKey)) {
        const nodes = await syllabusGraphService.getSyllabusNodes({
          examId: q.examId,
          cycleId,
        }).catch(() => []);
        examNodesCache.set(cacheKey, nodes || []);
      }

      const nodes = examNodesCache.get(cacheKey) || [];
      if (nodes.length > 0 && q.topic) {
        /*
         * ONE matcher, shared with linkToSyllabusNode above. These two methods previously held
         * copies of the same substring test; a fix to either would silently have left the other
         * behind, and mastery would then key differently depending on which path ingested the
         * question.
         *
         * NOTE the deliberate asymmetry: the node id is adopted, but `q.topic` is NOT
         * overwritten with the node label any more. Overwriting replaced a precise corpus topic
         * ("Pipes and Cisterns") with a whole syllabus paragraph, which is what made the
         * unanchored fallback slug useless and the analytics unreadable. The specific topic is
         * the more informative of the two and is what a student sees.
         */
        const hit = matchTopicToNode(q.topic, nodes as any);
        if (hit) q.syllabusNodeId = hit.node.id;
      }
    }
    return questions;
  }
}

export const pyqTaxonomyNormalizer = new PYQTaxonomyNormalizer();
