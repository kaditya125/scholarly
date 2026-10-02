import { z } from 'zod';
import { DocumentSpec, documentSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { ChapterTextError, loadChapterPages } from './chapterText';
import { titleCase } from './curriculumMatch';
import { writeGroundedNotes } from './document.adapter';
import { SourceSection, sectionsFromPages } from './grounded';

/**
 * Revision notes for an NCERT chapter (Phase 6): "Make revision notes on Laws of Motion, Class 11
 * Physics." Written from the chapter's own teaching text, section by section, by the same grounded
 * writer as a student's uploaded document: every point is kept only when the sentence stating it
 * is really in the chapter, and carries the page of the chapter PDF it is on.
 */

/** Teaching text written from, at most; a longer chapter's notes cover its opening sections and say so. */
export const MAX_CHAPTER_CHARS = 60_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const headingKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The sections within the budget, in chapter order. */
export function withinBudget(all: SourceSection[], maxChars = MAX_CHAPTER_CHARS): { sections: SourceSection[]; truncated: boolean } {
  const sections: SourceSection[] = [];
  let chars = 0;
  for (const s of all) {
    if (chars + s.text.length > maxChars && sections.length) break;
    sections.push(s);
    chars += s.text.length;
  }
  return { sections, truncated: sections.length < all.length };
}

export function registerChapterNotesTools(registry: ToolRegistry): ToolRegistry {
  const notes: ToolDefinition<any, any> = {
    name: 'write_chapter_revision_notes',
    description:
      "Writes revision notes for an NCERT chapter from the chapter's own text: key points under each of its section headings, each kept only when the chapter sentence that states it is really there, with the page. Returns a document spec for the PDF.",
    category: 'knowledge',
    inputSchema: z.object({
      notebookId: z.string().min(1),
      sourceId: z.string().min(1),
      chapterName: z.string().min(1).max(300),
      bookTitle: z.string().max(300).optional(),
      headings: z.array(z.string()).max(80).default([]),
    }),
    outputSchema: documentSpecSchema.extend({
      stats: z.object({ checked: z.number(), kept: z.number(), rejected: z.record(z.string(), z.number()) }),
      /** Each kept point with the chapter sentence that states it — the record a reviewer can check. */
      kept: z.array(z.object({ point: z.string(), evidence: z.string(), page: z.number().optional(), section: z.string() })),
      truncated: z.boolean(),
      coveredUpTo: z.string().optional(),
    }),
    permissions: ['read:shared-corpus'],
    costClass: 'medium',
    timeoutMs: 150_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input, ctx) {
      let pages: Array<{ pageNumber: number; text: string }>;
      try {
        pages = (await loadChapterPages(input.notebookId, input.sourceId)).pages;
      } catch (e) {
        if (e instanceof ChapterTextError) throw new ToolError(e.code === 'NOT_CURRICULUM' ? 'permission' : 'not_found', e.message);
        throw e;
      }
      const { sections, truncated } = withinBudget(sectionsFromPages(pages, input.headings));
      if (!sections.length) throw new ToolError('not_found', 'The chapter has no readable teaching text to write notes from.');
      // Section numbers ("5.2") are how a student finds a section in the book; the sectioner drops them.
      const numberOf = new Map<string, string>();
      for (const h of input.headings) {
        const m = /^\s*(\d+(?:\.\d+)+)\s+(.+)$/.exec(h);
        if (m) numberOf.set(headingKey(m[2]), m[1]);
      }
      const written = await writeGroundedNotes({
        userId: ctx.userId,
        pages,
        sections,
        sourceKind: 'an NCERT textbook chapter',
        operation: 'agent_chapter_notes',
        // The chapter's own section headings; page-range chunks (no headings found) get the writer's.
        headingFor: (section, modelHeading) => {
          if (/^Pages \d/.test(section.heading)) return clip(`${modelHeading} (${section.heading.replace(/^Pages (\d+)$/, 'p. $1').replace(/^Pages (\d+)–(\d+)$/, 'pp. $1–$2')})`, 120);
          const n = numberOf.get(headingKey(section.heading));
          // Books' own casing varies from heading to heading ("First Law", "second law"); one style reads better.
          return clip(`${n ? `${n} ` : ''}${titleCase(section.heading)}`, 120);
        },
      });
      if (written.stats.kept === 0) throw new ToolError('not_found', 'None of the notes written could be matched to a sentence of the chapter, so there is nothing verified to give you.');
      const coveredUpTo = truncated ? sections[sections.length - 1].heading : undefined;
      const spec: DocumentSpec = {
        title: clip(`${input.chapterName} — Revision Notes`, 120),
        ...(input.bookTitle ? { subtitle: clip(input.bookTitle, 160) } : {}),
        sections: written.sections,
        sourceNote: clip(
          `Every point here is stated in the chapter, on the page of the chapter PDF given in brackets.${coveredUpTo ? ` These notes cover the chapter up to “${coveredUpTo}”.` : ''}`,
          300,
        ),
      };
      return {
        data: { ...documentSpecSchema.parse(spec), stats: written.stats, kept: written.kept.slice(0, 300), truncated, ...(coveredUpTo ? { coveredUpTo } : {}) },
        provenance: 'VERIFIED_CORPUS',
        usage: written.usage,
      };
    },
    summarize: (out: any) => ({ kept: out?.stats?.kept ?? 0, checked: out?.stats?.checked ?? 0, sections: out?.sections?.length ?? 0 }),
  };

  registry.register(notes);
  return registry;
}
