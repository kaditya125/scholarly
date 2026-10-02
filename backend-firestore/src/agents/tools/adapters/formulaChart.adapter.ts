import { z } from 'zod';
import { DocumentSpec, documentSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { displayCase, looksLikeFormula } from './compose.adapter';
import { ChapterTextError, loadChapterPages } from './chapterText';
import {
  REFUTED_SECTION,
  VerifiedFormula,
  buildChapterIndex,
  buildGlossary,
  citeSection,
  extractCandidates,
  verifyDefinition,
  verifyFormula,
} from './formulaVerify';

/**
 * The flagship formula chart (Phase 5), as three tools the plan chains:
 *
 *   extract_chapter_formulae         candidates from the study notes and the knowledge graph
 *   verify_formulae_against_chapter  each checked against the chapter's own PDF text
 *   compose_formula_chart            the §13 structure, from verified material only
 *
 * No model call anywhere. A formula reaches the chart only if it was found in the chapter's text,
 * and every one carries the page it was found on — the brief's "verify every formula against
 * trusted sources; do not allow the model to hallucinate formulas", made mechanical.
 */

const candidateSchema = z.object({
  formula: z.string(),
  meaning: z.string().optional(),
  sources: z.array(z.enum(['study_notes', 'knowledge_graph'])),
  equation: z.string().optional(),
});

const verifiedSchema = candidateSchema.extend({
  status: z.literal('verified'),
  match: z.enum(['exact', 'chain', 'loose', 'equation']),
  section: z.string().optional(),
  page: z.number().optional(),
});

const definitionSchema = z.object({ term: z.string(), definition: z.string(), section: z.string().optional(), page: z.number().optional() });

/** Items in a study-notes asset, whatever its content key (mistakes, tips, facts, formulae). */
function assetItems(notes: any, type: string): any[] {
  const asset = (notes?.assets ?? []).find((a: any) => a?.type === type);
  const content = asset?.content;
  if (!content || typeof content !== 'object') return [];
  const list = content.formulae ?? content.mistakes ?? content.tips ?? content.facts ?? content.items ?? Object.values(content)[0];
  return Array.isArray(list) ? list : [];
}

export function registerFormulaChartTools(registry: ToolRegistry): ToolRegistry {
  const extract: ToolDefinition<any, any> = {
    name: 'extract_chapter_formulae',
    description:
      "Collects candidate formulae for a chapter from Sadhya's study notes (KEY_FORMULAE) and the formula nodes of its knowledge graph, " +
      'de-duplicated, with worked-example arithmetic removed. Candidates are NOT verified — pass them to verify_formulae_against_chapter.',
    category: 'knowledge',
    inputSchema: z.object({
      graph: z.object({ nodes: z.array(z.object({ label: z.string(), type: z.string() }).passthrough()) }).passthrough(),
      notes: z.object({ assets: z.array(z.object({ type: z.string() }).passthrough()) }).passthrough(),
    }),
    outputSchema: z
      .object({
        candidates: z.array(candidateSchema),
        fromStudyNotes: z.number(),
        fromGraph: z.number(),
        dropped: z.object({ worked_example: z.number(), not_a_formula: z.number() }),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const studyNotes = assetItems(input.notes, 'KEY_FORMULAE')
        .filter((f: any) => typeof f?.formula === 'string')
        .map((f: any) => ({ formula: f.formula, meaning: typeof f.meaning === 'string' ? f.meaning : undefined }));
      const graph = (input.graph?.nodes ?? []).filter((n: any) => n.type === 'FORMULA').map((n: any) => n.label);
      const { candidates, dropped } = extractCandidates({ studyNotes, graph });
      if (candidates.length === 0) {
        throw new ToolError('not_found', 'Sadhya holds no formulae for this chapter to check.');
      }
      return { data: { candidates, fromStudyNotes: studyNotes.length, fromGraph: graph.length, dropped }, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ candidates: out?.candidates?.length ?? 0, droppedWorkedExamples: out?.dropped?.worked_example ?? 0 }),
  };

  const verify: ToolDefinition<any, any> = {
    name: 'verify_formulae_against_chapter',
    description:
      "Checks each candidate formula (and each extracted definition) against the text of the chapter's own NCERT PDF. " +
      'Returns only what was found there, with the page and section it was found in; everything else is reported as rejected.',
    category: 'knowledge',
    inputSchema: z.object({
      notebookId: z.string(),
      sourceId: z.string(),
      headings: z.array(z.string()).max(60),
      definitions: z.array(z.object({ term: z.string(), definition: z.string() })).max(60),
      candidates: z.array(candidateSchema).max(120),
    }),
    outputSchema: z
      .object({
        verified: z.array(verifiedSchema),
        rejected: z.array(candidateSchema.extend({ status: z.string() })),
        definitions: z.array(definitionSchema),
        glossary: z.array(z.object({ symbol: z.string(), name: z.string(), unit: z.string() })),
        pages: z.number(),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'low',
    timeoutMs: 60_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1_000 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      let chapter;
      try {
        chapter = await loadChapterPages(input.notebookId, input.sourceId);
      } catch (e: any) {
        if (e instanceof ChapterTextError) {
          throw new ToolError(e.code === 'NOT_CURRICULUM' ? 'permission' : 'not_found', e.message);
        }
        throw e;
      }
      const index = buildChapterIndex(chapter.pages, input.headings);
      const results = input.candidates.map((c: any) => verifyFormula(c, index));
      const verified = results.filter((r: any) => r.status === 'verified') as VerifiedFormula[];
      const rejected = results.filter((r: any) => r.status !== 'verified');

      // Definitions under a heading like "Aristotle's Fallacy" state what the chapter disproves.
      const definitions = input.definitions
        .map((d: any) => verifyDefinition(d, index))
        .filter((d: any) => d && !REFUTED_SECTION.test(d.section ?? ''));

      return {
        data: {
          verified,
          rejected,
          definitions,
          glossary: buildGlossary(verified.map((v) => v.formula), index),
          pages: chapter.pages.length,
        },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ verified: out?.verified?.length ?? 0, rejected: out?.rejected?.length ?? 0, definitions: out?.definitions?.length ?? 0 }),
  };

  const compose: ToolDefinition<any, any> = {
    name: 'compose_formula_chart',
    description:
      'Assembles the formula chart from verified material only: overview, core laws, definitions, formulae by section with page citations, ' +
      'symbols and units, limits and conditions, then clearly labelled study notes. No model call.',
    category: 'document',
    inputSchema: z.object({
      chapter: z.object({}).passthrough(),
      verification: z.object({}).passthrough(),
      notes: z.object({}).passthrough(),
    }),
    outputSchema: documentSpecSchema.extend({
      stats: z.object({ formulae: z.number(), definitions: z.number(), sections: z.number(), rejected: z.number() }),
    }),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      return { data: composeFormulaChart(input as any), provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ formulae: out?.stats?.formulae ?? 0, sections: out?.sections?.length ?? 0 }),
  };

  for (const tool of [extract, verify, compose]) registry.register(tool);
  return registry;
}

/** Inequalities and limiting values: the chart's "Special cases". */
const LIMIT = /≤|≥|<|>|max|min/;

const pageNote = (f: { section?: string; page?: number; match?: string; equation?: string }) =>
  [f.match === 'equation' && f.equation ? `Eq. (${f.equation})` : null, citeSection(f.section), f.page ? `p. ${f.page} of the chapter PDF` : null]
    .filter(Boolean)
    .join(' · ');

export function composeFormulaChart(input: {
  chapter: any;
  verification: any;
  notes: any;
}): DocumentSpec & { stats: { formulae: number; definitions: number; sections: number; rejected: number } } {
  const { chapter, verification, notes } = input;
  if (!chapter?.resolved) throw new ToolError('validation', 'The chapter was not identified, so there is nothing to chart.');
  const verified: VerifiedFormula[] = verification?.verified ?? [];
  if (verified.length === 0) {
    throw new ToolError('not_found', 'None of the formulae Sadhya holds for this chapter could be found in the chapter text, so there is nothing verified to chart.');
  }

  const title = displayCase(chapter.chapterName);
  const sections: DocumentSpec['sections'] = [];

  // Chapter overview — the chapter's own section list.
  const overview = (chapter.headings ?? [])
    .map((h: string) => displayCase(String(h).replace(/^\s*\d+(\.\d+)*\s*/, '').trim()))
    .filter((h: string) => h && !/^(introduction|summary|points to ponder|exercises|additional exercises|appendix)$/i.test(h));
  if (overview.length) sections.push({ heading: 'Chapter overview', blocks: [{ type: 'bullets', items: [...new Set<string>(overview)].slice(0, 16) }] });

  // Core laws and definitions — in the chapter's own words, each cited.
  const defs: any[] = verification?.definitions ?? [];
  // Capped to the document schema (labels 120, values 400) so a long extract cannot fail the render.
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const asItems = (list: any[]) =>
    list
      .map((d) => ({ label: clip(displayCase(d.term), 120), value: clip(`${d.definition}${d.page ? ` (p. ${d.page})` : ''}`, 400) }))
      .slice(0, 12);
  const laws = defs.filter((d) => /\blaws?\b|principle/i.test(d.term));
  const others = defs.filter((d) => !/\blaws?\b|principle/i.test(d.term));
  if (laws.length) sections.push({ heading: 'Core laws', blocks: [{ type: 'keyValue', items: asItems(laws) }] });
  if (others.length) sections.push({ heading: 'Definitions', blocks: [{ type: 'keyValue', items: asItems(others) }] });

  // Formulae, grouped by the chapter section they were found in, in the chapter's order.
  const general = verified.filter((f) => !LIMIT.test(f.formula));
  const limits = verified.filter((f) => LIMIT.test(f.formula));
  const bySection = new Map<string, VerifiedFormula[]>();
  for (const f of general) {
    const key = f.section ?? '';
    bySection.set(key, [...(bySection.get(key) ?? []), f]);
  }
  const order = (key: string) => {
    const m = key.match(/^\s*(\d+)\.(\d+)/);
    return m ? Number(m[1]) * 1000 + Number(m[2]) : Number.MAX_SAFE_INTEGER;
  };
  for (const key of [...bySection.keys()].sort((a, b) => order(a) - order(b))) {
    const cited = citeSection(key);
    sections.push({
      heading: cited ? `Formulae: ${cited.replace(/^§[\d.]+\s*/, '')}` : 'Formulae',
      blocks: [
        {
          type: 'formulae',
          items: bySection
            .get(key)!
            .slice(0, 20)
            .map((f) => ({ formula: clip(f.formula, 300), meaning: f.meaning ? clip(f.meaning, 400) : undefined, note: pageNote(f) || undefined })),
        },
      ],
    });
  }

  // Variables and units — only symbols that appear above, with meanings the chapter attests.
  const glossary: any[] = verification?.glossary ?? [];
  if (glossary.length) {
    sections.push({ heading: 'Symbols and SI units', blocks: [{ type: 'keyValue', items: glossary.map((g) => ({ label: g.symbol, value: `${g.name} — ${g.unit}` })) }] });
  }

  // Special cases — inequalities and limiting values.
  if (limits.length) {
    sections.push({
      heading: 'Limits and special cases',
      blocks: [
        {
          type: 'formulae',
          items: limits
            .slice(0, 20)
            .map((f) => ({ formula: clip(f.formula, 300), meaning: f.meaning ? clip(f.meaning, 400) : undefined, note: pageNote(f) || undefined })),
        },
      ],
    });
  }

  // Study notes: advice, not facts to verify — labelled as such, and never carrying a formula,
  // since only verified formulae may appear in the chart.
  const advice = (type: string, heading: string) => {
    const items = assetItems(notes, type)
      .map((x: any) => (typeof x === 'string' ? x : x?.text ?? ''))
      .filter((x: string) => x && !looksLikeFormula(x))
      .map((x: string) => clip(x, 480))
      .slice(0, 6);
    if (items.length) sections.push({ heading, blocks: [{ type: 'bullets', items }] });
  };
  advice('COMMON_MISTAKES', 'Common mistakes (study notes)');
  advice('EXAM_TIPS', 'Quick tips (study notes)');
  advice('HIGH_YIELD_FACTS', 'Exam relevance (study notes)');

  const rejected = (verification?.rejected ?? []).length;
  return {
    title: `${title} — Formula Chart`,
    subtitle: chapter.bookTitle || 'NCERT',
    sourceNote:
      `Every formula here was found in the text of the chapter's NCERT PDF, and is cited to the page it appears on. ` +
      `Sections marked "study notes" are Sadhya's advice, not checked against the text.`,
    footerNote: `${title} · Formula chart · ${chapter.bookTitle || 'NCERT'} · Sadhya`,
    sections,
    stats: { formulae: verified.length, definitions: defs.length, sections: sections.length, rejected },
  };
}
