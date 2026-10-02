import { z } from 'zod';
import { DocumentSpec, documentSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';

/**
 * Compose tools: deterministic assembly of a document from what earlier steps retrieved.
 *
 * No model is involved, which is the point: every line in the output traces back to a tool
 * result from the same run. They are also where step references meet the "top-level refs only"
 * rule — a compose step takes whole step outputs (`{ $ref: 'graph' }`) and returns the flat
 * document fields a render step can reference one by one.
 */

/** Section headings every NCERT chapter carries that say nothing about its content. */
const FURNITURE = /^(introduction|summary|points to ponder|exercises|additional exercises|appendix|answers)$/i;

const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'by', 'at', 'with']);

/** "WORK, ENERGY AND POWER" → "Work, Energy and Power". Mixed-case text is left as written. */
export function displayCase(text: string): string {
  const t = String(text ?? '').trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Section headings a student would find useful: numbering stripped, furniture dropped, de-duplicated. */
export function cleanHeadings(headings: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of headings) {
    const text = displayCase(String(raw ?? '').replace(/^\s*\d+(\.\d+)*\s*/, '').trim());
    const key = text.toLowerCase();
    if (!text || FURNITURE.test(text) || seen.has(key) || looksLikeFormula(text)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Concept labels are sometimes whole sentences ("Newton's First Law: 'Everybody continues…'"). */
export function conceptName(label: string): string {
  const head = String(label ?? '').split(/:\s/)[0].trim();
  const name = head.length > 90 ? `${head.slice(0, 87).trimEnd()}…` : head;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * True for text that is really a formula or a worked calculation. The graph extractor sometimes
 * files these as CONCEPT nodes ("Change in momentum = 0.15 × 12 – (–0.15 × 12) = 3.6 N s"), and
 * a handout that promises to leave unchecked formulae out has to catch them wherever they appear.
 */
export function looksLikeFormula(text: string): boolean {
  const t = String(text ?? '');
  return /[=≈≤≥<>∝]/.test(t) || /\d\s*[×x*/+\-–−^]\s*[\d(–−-]/.test(t) || /[a-z]\s*\^\s*\d/i.test(t);
}

const ASSET_NAMES: Record<string, string> = {
  KEY_FORMULAE: 'Key formulae',
  FLASHCARDS: 'Flashcards',
  QUIZ: 'Quiz',
  SUMMARY: 'Chapter summary',
  REVISION_NOTES: 'Revision notes',
  EXAM_QUESTIONS: 'Exam-style questions',
  EXAM_TIPS: 'Exam tips',
  COMMON_MISTAKES: 'Common mistakes',
  HIGH_YIELD_FACTS: 'High-yield facts',
  LEARNING_OBJECTIVES: 'Learning objectives',
  DOCUMENTARY_ARTICLE: 'Background article',
  YOUTUBE_LINKS: 'Video links',
};

/** Sentence case like the named ones ("Key formulae"), for types added after this list was written. */
const humanAsset = (type: string) => {
  if (ASSET_NAMES[type]) return ASSET_NAMES[type];
  const words = type.replace(/_/g, ' ').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export interface HandoutInputs {
  chapter: { resolved?: boolean; chapterName?: string; bookTitle?: string; chapterTitle?: string; headings?: string[] };
  graph: { nodes?: Array<{ label: string; type: string }>; relationships?: Array<{ from: string; to: string }> };
  assets: { types?: string[] };
}

/**
 * The chapter handout. Formulae are deliberately NOT included: the ones Sadhya holds were
 * extracted automatically and have never been checked, and the verified formula chart is its own
 * workflow. A handout that printed an unchecked formula would be worse than one that leaves it out.
 */
export function composeChapterHandout({ chapter, graph, assets }: HandoutInputs): DocumentSpec {
  if (!chapter?.resolved || !chapter.chapterName) {
    throw new ToolError('validation', 'The chapter was not identified, so there is nothing to compose.');
  }

  const title = displayCase(chapter.chapterName);
  const sections: DocumentSpec['sections'] = [];

  const covers = cleanHeadings(chapter.headings);
  if (covers.length) {
    sections.push({ heading: 'What this chapter covers', blocks: [{ type: 'bullets', items: covers.slice(0, 20) }] });
  }

  const seenConcepts = new Set<string>();
  const concepts = (graph?.nodes ?? [])
    .filter((n) => n.type === 'CONCEPT' && !looksLikeFormula(n.label))
    .map((n) => conceptName(n.label))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seenConcepts.has(key)) return false;
      seenConcepts.add(key);
      return true;
    });
  if (concepts.length) {
    sections.push({ heading: 'Key concepts', blocks: [{ type: 'bullets', items: concepts.slice(0, 15) }] });
  }

  // A relationship is listed once whichever way the graph stored it ("A — B" and "B — A" are the
  // same pairing to a reader), and never when either end is really a formula.
  const seenPairs = new Set<string>();
  const links: string[] = [];
  for (const r of graph?.relationships ?? []) {
    if (looksLikeFormula(r.from) || looksLikeFormula(r.to)) continue;
    const from = conceptName(r.from);
    const to = conceptName(r.to);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue;
    const pair = [from.toLowerCase(), to.toLowerCase()].sort().join('\u0000');
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    links.push(`${from} — ${to}`);
  }
  if (links.length) {
    sections.push({ heading: 'How the ideas connect', blocks: [{ type: 'bullets', items: links.slice(0, 10) }] });
  }

  // One line, not a bullet per item: it is a pointer to other material, not content to study,
  // and as a list of eleven it pushed two stray bullets onto a second page.
  const available = (assets?.types ?? []).map(humanAsset);
  if (available.length) {
    sections.push({
      heading: 'Also on Sadhya for this chapter',
      blocks: [{ type: 'paragraph', text: `${available.slice(0, 12).join(' · ')}.` }],
    });
  }

  if (sections.length === 0) {
    throw new ToolError('not_found', 'Sadhya holds too little about this chapter to build a handout from it.');
  }

  return {
    title,
    subtitle: chapter.bookTitle || 'NCERT',
    sourceNote: "Built from Sadhya's NCERT corpus — the chapter's own section headings and the concepts extracted from its text.",
    footerNote: `${title} · ${chapter.bookTitle || 'NCERT'} · Sadhya`,
    sections,
  };
}

export function registerComposeTools(registry: ToolRegistry): ToolRegistry {
  const handout: ToolDefinition<any, any> = {
    name: 'compose_chapter_handout',
    description:
      "Assembles a printable handout for a resolved NCERT chapter from its section headings, concept graph and existing study material. No model call; every line comes from those inputs.",
    category: 'document',
    inputSchema: z.object({
      chapter: z.object({}).passthrough().describe('The output of resolve_curriculum_chapter.'),
      graph: z.object({}).passthrough().describe('The output of get_chapter_knowledge_graph.'),
      assets: z.object({}).passthrough().describe('The output of get_chapter_assets.'),
    }),
    outputSchema: documentSpecSchema,
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      return { data: composeChapterHandout(input as unknown as HandoutInputs), provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ sections: out?.sections?.length ?? 0 }),
  };
  return registry.register(handout);
}
