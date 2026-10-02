import { z } from 'zod';
import { DocumentSpec, FlashcardsSpec, MAX_CARDS, documentSpecSchema, flashcardsSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import {
  CardDraft,
  McqDraft,
  NoteDraft,
  SourceSection,
  batchSections,
  callJson,
  checkCard,
  checkMcq,
  checkNote,
  evidenceKey,
  mapLimit,
  sectionOfEvidence,
  sectionsFromPages,
  similarity,
  NEAR_DUPLICATE,
  solveFromEvidence,
} from './grounded';
import { mcqPrompt } from './questionSet.adapter';
import { QuizQuestionDraft, quizQuestionSchema } from './quiz.adapter';

/**
 * The student's own document (Phase 6, golden case 4): "Read this uploaded PDF and create revision
 * notes + flashcards + quiz."
 *
 *   read_my_document          document retrieval: the PDF attached to the turn, else their latest upload
 *   write_revision_notes      ┐
 *   write_document_flashcards ├ parallel asset generation, each item quoted from the document and
 *   write_document_quiz       ┘ kept only when the quote is really there and states it
 *
 * The document is the source of truth here — it is the student's, so nothing is added from outside
 * it — and every item carries the page it came from. Ownership is checked on every read: an upload
 * through its owner-scoped store, a notebook source through the notebook's access list.
 */

const uploads = () => require('../../uploads/agentUploads.service').getAgentUploadsService();
const notebooks = () => require('../../../repositories/notebook.repository').notebookRepository;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** How much of a document one task writes from; longer documents use their opening part. */
export const MAX_DOC_CHARS = 30_000;

export const documentRefSchema = z.object({
  kind: z.enum(['upload', 'source']),
  id: z.string().min(1).max(120),
  notebookId: z.string().max(120).optional(),
  title: z.string().max(300),
});
export type DocumentRef = z.infer<typeof documentRefSchema>;

const sourceCache = new Map<string, { pages: Array<{ pageNumber: number; text: string }>; at: number }>();
const SOURCE_TTL_MS = 30 * 60 * 1000;

/** A notebook source's text, read from its stored file — only through a notebook the user can open. */
async function sourcePages(userId: string, notebookId: string, sourceId: string): Promise<{ title: string; pages: Array<{ pageNumber: number; text: string }> }> {
  const notebook = await notebooks().getNotebook(userId, notebookId);
  if (!notebook) throw new ToolError('not_found', 'That document is not available.');
  const source = ((await notebooks().getSources(notebookId)) as any[]).find((s) => s.id === sourceId);
  if (!source) throw new ToolError('not_found', 'That document is not available.');
  const key = `${notebookId}/${sourceId}`;
  const hit = sourceCache.get(key);
  if (hit && Date.now() - hit.at < SOURCE_TTL_MS) return { title: source.title, pages: hit.pages };
  const storagePath: string = source.storagePath || String(source.gcsPath ?? '').replace(/^gs:\/\/[^/]+\//, '');
  if (!storagePath) throw new ToolError('not_found', 'That document has no stored file to read.');
  const { firebaseApp } = require('../../../config/firebase');
  const { env } = require('../../../config/env');
  const bucket = env.FIREBASE_STORAGE_BUCKET ? firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET) : firebaseApp.storage().bucket();
  const [buffer] = await bucket.file(storagePath).download();
  const { FileParserService } = require('../../../services/fileParser.service');
  const pages = await FileParserService.extractText(Buffer.from(buffer).toString('base64'), source.mimeType || 'application/pdf', source.title || 'document');
  sourceCache.set(key, { pages, at: Date.now() });
  return { title: source.title, pages };
}

/** The document's pages, owner-checked, whichever kind of reference it is. */
export async function loadDocumentPages(userId: string, ref: DocumentRef): Promise<Array<{ pageNumber: number; text: string }>> {
  if (ref.kind === 'upload') {
    try {
      return (await uploads().read(userId, ref.id)).pages;
    } catch (e: any) {
      if (e?.name === 'AgentUploadError') throw new ToolError('not_found', e.message);
      throw e;
    }
  }
  if (!ref.notebookId) throw new ToolError('validation', 'A notebook document needs its notebook.');
  return (await sourcePages(userId, ref.notebookId, ref.id)).pages;
}

/** The part of the document one task works from: page-aligned chunks, in order, up to the budget. */
export function documentSections(pages: Array<{ pageNumber: number; text: string }>): { sections: SourceSection[]; truncated: boolean } {
  const all = sectionsFromPages(pages, []);
  const sections: SourceSection[] = [];
  let chars = 0;
  for (const s of all) {
    if (chars + s.text.length > MAX_DOC_CHARS && sections.length) break;
    sections.push(s);
    chars += s.text.length;
  }
  return { sections, truncated: sections.length < all.length };
}

const pageOf = (pages: Array<{ pageNumber: number; text: string }>, evidence: string) => {
  const ev = evidenceKey(evidence);
  return pages.find((p) => evidenceKey(p.text).includes(ev))?.pageNumber;
};

const passageBlock = (passages: Array<{ label: string; section: SourceSection }>) =>
  passages.flatMap((p) => [`PASSAGE ${p.label} (${p.section.heading}):`, p.section.text, '']);

const WRITER_SYSTEM = 'You write study material strictly from given passages of a student’s own document, and reply with JSON only.';

export interface GroundedNotes {
  sections: DocumentSpec['sections'];
  /** Every kept point with the sentence that states it and its page — for checking, not display. */
  kept: Array<{ point: string; evidence: string; page?: number; section: string }>;
  stats: { checked: number; kept: number; rejected: Record<string, number> };
  usage: { tokens: number; costUsd: number };
}

/**
 * Revision notes written only from the given passages: key points per section, each with the
 * sentence that states it copied word for word. A point is kept only when that sentence is really
 * in the source and states the point (checkNote); near-repeats are dropped; each point carries its
 * page. Shared by the student's own documents and NCERT chapters — only the framing differs.
 */
export async function writeGroundedNotes(args: {
  userId: string;
  pages: Array<{ pageNumber: number; text: string }>;
  sections: SourceSection[];
  /** What the passages are, as the writer is told: "a student’s own document", "an NCERT textbook chapter". */
  sourceKind: string;
  operation: string;
  /** The heading a section's notes appear under. */
  headingFor: (section: SourceSection, modelHeading: string) => string;
}): Promise<GroundedNotes> {
  const { pages, sections } = args;
  const sourceKey = evidenceKey(pages.map((p) => p.text).join('\n'));
  const batches = batchSections(sections.map((s) => ({ section: s, count: 4 })), 16_000, 40);
  let tokens = 0;
  let costUsd = 0;
  const drafts = (
    await mapLimit(batches, 2, async (batch) => {
      const passages = batch.map((b, i) => ({ label: `P${i + 1}`, section: b.section }));
      const { json, usage } = await callJson(
        [
          `Write revision notes from the passages below (parts of ${args.sourceKind}).`,
          'For each passage: a short heading (at most six words) and 2–5 key points, each one complete sentence a student can revise from.',
          'Use only what the passage says. For each point, copy the ONE sentence (or clause) from the passage that states it, WORD FOR WORD, as "evidence".',
          'Reply with JSON only: {"notes":[{"passage":"P1","heading":"…","points":[{"point":"…","evidence":"…"}]}]}',
          '',
          ...passageBlock(passages),
        ].join('\n'),
        `You write study material strictly from given passages of ${args.sourceKind}, and reply with JSON only.`,
        { userId: args.userId, operation: args.operation },
      );
      tokens += usage.tokens;
      costUsd += usage.costUsd;
      const byLabel = new Map(passages.map((p) => [p.label, p.section]));
      return (Array.isArray(json?.notes) ? json.notes : []).flatMap((n: any) => {
        const section = byLabel.get(String(n?.passage)) ?? passages[0].section;
        return (Array.isArray(n?.points) ? n.points : []).map((p: any) => ({
          heading: clip(String(n?.heading || section.heading), 80),
          draft: { point: String(p?.point ?? ''), evidence: String(p?.evidence ?? ''), sectionId: section.id } as NoteDraft,
        }));
      });
    })
  ).flat();

  const rejected: Record<string, number> = {};
  const kept: GroundedNotes['kept'] = [];
  const bySection = new Map<string, { heading: string; items: string[] }>();
  for (const { heading, draft } of drafts) {
    const reason = checkNote(draft, sourceKey);
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      continue;
    }
    const section = sectionOfEvidence(sections, draft.evidence) ?? sections.find((s) => s.id === draft.sectionId)!;
    const page = pageOf(pages, draft.evidence);
    const entry = bySection.get(section.id) ?? { heading: args.headingFor(section, heading), items: [] };
    if (!entry.items.some((i) => similarity(i, draft.point) >= NEAR_DUPLICATE)) {
      entry.items.push(clip(`${draft.point.trim()}${page ? ` (p. ${page})` : ''}`, 500));
      kept.push({ point: draft.point.trim(), evidence: draft.evidence, ...(page ? { page } : {}), section: entry.heading });
    }
    bySection.set(section.id, entry);
  }
  const order = new Map(sections.map((s, i) => [s.id, i]));
  return {
    sections: [...bySection.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
      .slice(0, 30)
      .map(([, sec]) => ({ heading: sec.heading, blocks: [{ type: 'bullets' as const, items: sec.items.slice(0, 60) }] })),
    kept,
    stats: { checked: drafts.length, kept: kept.length, rejected },
    usage: { tokens, costUsd },
  };
}

export function registerDocumentTools(registry: ToolRegistry): ToolRegistry {
  const read: ToolDefinition<any, any> = {
    name: 'read_my_document',
    description:
      "Document retrieval: reads the document the student attached to this request — or, when none was attached, the latest document they uploaded to one of their notebooks — and reports its size and the part to work from.",
    category: 'document',
    inputSchema: z.object({ uploadIds: z.array(z.string().max(120)).max(5).default([]) }),
    outputSchema: z
      .object({
        found: z.boolean(),
        document: documentRefSchema.optional(),
        pageCount: z.number().optional(),
        chars: z.number().optional(),
        usedPages: z.array(z.number()).optional(),
        truncated: z.boolean().optional(),
        via: z.enum(['attachment', 'latest_upload']).optional(),
      })
      .passthrough(),
    permissions: ['read:own-notebook'],
    costClass: 'low',
    timeoutMs: 90_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1_000 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      let ref: DocumentRef | null = null;
      let via: 'attachment' | 'latest_upload' = 'attachment';
      if (input.uploadIds.length) {
        const { upload } = await uploads()
          .read(ctx.userId, input.uploadIds[0])
          .catch((e: any) => {
            throw new ToolError('not_found', e?.message || 'That document is not available.');
          });
        ref = { kind: 'upload', id: upload.uploadId, title: upload.name };
      } else {
        via = 'latest_upload';
        // Their own notebooks only (not ones shared with them), newest document first.
        const mine = ((await notebooks().getNotebooksByUser(ctx.userId)) as any[]).filter((n) => n.owner === ctx.userId || n.userId === ctx.userId).slice(0, 10);
        let newest: any = null;
        for (const nb of mine) {
          const sources: any[] = await notebooks().getSources(nb.id).catch(() => []);
          const ready = sources.find((s) => (s.storagePath || s.gcsPath) && !/fail|error/i.test(String(s.status)));
          if (ready && (!newest || Number(ready.createdAt ?? 0) > Number(newest.createdAt ?? 0))) newest = ready;
        }
        if (newest) ref = { kind: 'source', id: newest.id, notebookId: newest.notebookId, title: String(newest.title || newest.originalName || 'Your document').slice(0, 300) };
      }
      if (!ref) return { data: { found: false }, provenance: 'STUDENT_UPLOAD' };
      const pages = await loadDocumentPages(ctx.userId, ref);
      const chars = pages.reduce((n, p) => n + (p.text?.length ?? 0), 0);
      if (chars < 200) throw new ToolError('not_found', `“${ref.title}” has no readable text — if it is a scan, upload it through a notebook so it can be read.`);
      const { sections, truncated } = documentSections(pages);
      const usedPages = [...new Set(sections.flatMap((s) => s.pages))].sort((a, b) => a - b);
      return {
        data: { found: true, document: ref, pageCount: pages.length, chars, usedPages: usedPages.length ? [usedPages[0], usedPages[usedPages.length - 1]] : [], truncated, via },
        provenance: 'STUDENT_UPLOAD',
      };
    },
    summarize: (out: any) => (out?.found ? { title: out.document?.title, pages: out.pageCount, truncated: out.truncated } : { found: false }),
  };

  const notes: ToolDefinition<any, any> = {
    name: 'write_revision_notes',
    description:
      'Writes revision notes from the student’s document: key points per part, each with the sentence of the document that states it; points whose sentence is not in the document, or does not state them, are dropped. Returns a document spec for the PDF.',
    category: 'document',
    inputSchema: z.object({ document: documentRefSchema }),
    outputSchema: documentSpecSchema.extend({ stats: z.object({ checked: z.number(), kept: z.number(), rejected: z.record(z.string(), z.number()) }) }),
    permissions: ['read:own-notebook'],
    costClass: 'medium',
    timeoutMs: 150_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      const pages = await loadDocumentPages(ctx.userId, input.document);
      const { sections } = documentSections(pages);
      const written = await writeGroundedNotes({
        userId: ctx.userId,
        pages,
        sections,
        sourceKind: 'a student’s own document',
        operation: 'agent_document_notes',
        // The document's parts are page ranges, so the model's heading names them, with the pages.
        headingFor: (section, modelHeading) => clip(`${modelHeading} (${section.heading.replace(/^Pages (\d+)$/, 'p. $1').replace(/^Pages (\d+)–(\d+)$/, 'pp. $1–$2')})`, 120),
      });
      if (written.stats.kept === 0) throw new ToolError('not_found', 'None of the notes written could be matched to a sentence of your document, so there is nothing verified to give you.');
      const spec: DocumentSpec = {
        title: clip(`${input.document.title.replace(/\.(pdf|docx?|txt)$/i, '')} — Revision Notes`, 120),
        subtitle: 'From your document',
        sections: written.sections,
        sourceNote: 'Every point here is stated in your document, on the page given in brackets.',
      };
      return { data: { ...documentSpecSchema.parse(spec), stats: written.stats }, provenance: 'STUDENT_UPLOAD', usage: written.usage };
    },
    summarize: (out: any) => ({ kept: out?.stats?.kept ?? 0, checked: out?.stats?.checked ?? 0 }),
  };

  const cards: ToolDefinition<any, any> = {
    name: 'write_document_flashcards',
    description:
      'Writes flashcards from the student’s document, each answer quoted from it; cards whose quote is not in the document, or does not give the answer, are dropped.',
    category: 'document',
    inputSchema: z.object({ document: documentRefSchema, count: z.number().int().min(5).max(MAX_CARDS).default(20) }),
    outputSchema: flashcardsSpecSchema.extend({ stats: z.object({ checked: z.number(), kept: z.number(), rejected: z.record(z.string(), z.number()) }) }),
    permissions: ['read:own-notebook'],
    costClass: 'medium',
    timeoutMs: 150_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      const pages = await loadDocumentPages(ctx.userId, input.document);
      const { sections } = documentSections(pages);
      const sourceKey = evidenceKey(pages.map((p) => p.text).join('\n'));
      const perSection = Math.max(1, Math.ceil((input.count * 1.3) / sections.length));
      const batches = batchSections(sections.map((s) => ({ section: s, count: perSection })), 16_000, 30);
      let tokens = 0;
      let costUsd = 0;
      const drafts: CardDraft[] = (
        await mapLimit(batches, 2, async (batch) => {
          const passages = batch.map((b, i) => ({ label: `P${i + 1}`, section: b.section, count: b.count }));
          const { json, usage } = await callJson(
            [
              'Write flashcards from the passages below (parts of a student’s own document).',
              `How many from each passage: ${passages.map((p) => `${p.label}: ${p.count}`).join(', ')}.`,
              'Front: a short question or term. Back: the answer in a few words, in the passage’s own terms.',
              'For each card copy the ONE sentence (or clause) from the passage that gives the answer, WORD FOR WORD, as "evidence".',
              'Reply with JSON only: {"cards":[{"passage":"P1","front":"…","back":"…","evidence":"…"}]}',
              '',
              ...passageBlock(passages),
            ].join('\n'),
            WRITER_SYSTEM,
            { userId: ctx.userId, operation: 'agent_document_flashcards' },
          );
          tokens += usage.tokens;
          costUsd += usage.costUsd;
          const byLabel = new Map(passages.map((p) => [p.label, p.section.id]));
          return (Array.isArray(json?.cards) ? json.cards : []).map((c: any) => ({
            front: String(c?.front ?? ''),
            back: String(c?.back ?? ''),
            evidence: String(c?.evidence ?? ''),
            sectionId: byLabel.get(String(c?.passage)) ?? passages[0].section.id,
          }));
        })
      ).flat();

      const rejected: Record<string, number> = {};
      const kept: FlashcardsSpec['cards'] = [];
      for (const d of drafts) {
        const reason = checkCard(d, sourceKey) ?? (kept.some((k) => similarity(k.front, d.front) >= NEAR_DUPLICATE) ? 'near_duplicate' : null);
        if (reason) {
          rejected[reason] = (rejected[reason] ?? 0) + 1;
          continue;
        }
        if (kept.length >= input.count) break;
        const page = pageOf(pages, d.evidence);
        kept.push({ front: clip(d.front.trim(), 300), back: clip(d.back.trim(), 500), kind: 'definition', ...(page ? { note: `p. ${page} of your document` } : {}) });
      }
      if (kept.length === 0) throw new ToolError('not_found', 'None of the flashcards written could be matched to a sentence of your document.');
      const spec = flashcardsSpecSchema.parse({ title: clip(`${input.document.title.replace(/\.(pdf|docx?|txt)$/i, '')} — Flashcards`, 120), cards: kept });
      return { data: { ...spec, stats: { checked: drafts.length, kept: kept.length, rejected } }, provenance: 'STUDENT_UPLOAD', usage: { tokens, costUsd } };
    },
    summarize: (out: any) => ({ kept: out?.stats?.kept ?? 0, checked: out?.stats?.checked ?? 0 }),
  };

  const quiz: ToolDefinition<any, any> = {
    name: 'write_document_quiz',
    description:
      'Writes a multiple-choice quiz from the student’s document with the same checks as every Sadhya question set: the quote is in the document and states the answer, no option restates another, and an independent solver that never sees the key reaches the same answer.',
    category: 'assessment',
    inputSchema: z.object({ document: documentRefSchema, count: z.number().int().min(5).max(30).default(10) }),
    outputSchema: z.object({
      title: z.string(),
      questions: z.array(quizQuestionSchema).min(1),
      topics: z.array(z.object({ topic: z.string(), count: z.number() })),
      origin: z.array(z.object({ label: z.string(), count: z.number() })),
      validation: z.object({ checked: z.number(), accepted: z.number(), rejected: z.record(z.string(), z.number()) }),
      durationMinutes: z.number(),
      sourceNote: z.string(),
    }),
    permissions: ['read:own-notebook'],
    costClass: 'medium',
    timeoutMs: 180_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      const pages = await loadDocumentPages(ctx.userId, input.document);
      const { sections } = documentSections(pages);
      const sourceKey = evidenceKey(pages.map((p) => p.text).join('\n'));
      const perSection = Math.max(1, Math.ceil((input.count * 1.4) / sections.length));
      const batches = batchSections(sections.map((s) => ({ section: s, count: perSection })));
      let tokens = 0;
      let costUsd = 0;
      const drafts: McqDraft[] = (
        await mapLimit(batches, 2, async (batch) => {
          const passages = batch.map((b, i) => ({ label: `P${i + 1}`, section: b.section, count: b.count }));
          const asked = passages.reduce((n, p) => n + p.count, 0);
          const { json, usage } = await callJson(
            mcqPrompt({ sourceTitle: `the student’s document “${input.document.title}”`, passages, mix: { easy: Math.round(asked * 0.3), medium: asked - Math.round(asked * 0.3) - Math.round(asked * 0.2), hard: Math.round(asked * 0.2) } }),
            WRITER_SYSTEM,
            { userId: ctx.userId, operation: 'agent_document_quiz' },
          );
          tokens += usage.tokens;
          costUsd += usage.costUsd;
          const byLabel = new Map(passages.map((p) => [p.label, p.section.id]));
          return (Array.isArray(json?.questions) ? json.questions : []).map((q: any) => ({
            question: String(q?.question ?? ''),
            options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [],
            correctIndex: Number(q?.correctIndex),
            explanation: String(q?.explanation ?? ''),
            evidence: String(q?.evidence ?? ''),
            sectionId: byLabel.get(String(q?.passage)) ?? passages[0].section.id,
          }));
        })
      ).flat();

      const rejected: Record<string, number> = {};
      const reject = (r: string) => (rejected[r] = (rejected[r] ?? 0) + 1);
      const passed = drafts.filter((d) => {
        const reason = checkMcq(d, sourceKey);
        if (reason) reject(reason);
        return !reason;
      });
      const solved = passed.length
        ? await solveFromEvidence(
            passed.map((d, i) => ({ id: `q${i + 1}`, question: d.question, options: d.options, evidence: d.evidence })),
            { userId: ctx.userId, operation: 'agent_answer_validation' },
          )
        : { answers: new Map<string, number>(), usage: { tokens: 0, costUsd: 0 } };
      tokens += solved.usage.tokens;
      costUsd += solved.usage.costUsd;
      const questions: QuizQuestionDraft[] = [];
      for (const [i, d] of passed.entries()) {
        const answer = solved.answers.get(`q${i + 1}`);
        if (answer === undefined || answer === -1) {
          reject('not_settled_by_evidence');
          continue;
        }
        if (answer !== d.correctIndex) {
          reject('solver_disagrees');
          continue;
        }
        if (questions.some((q) => similarity(q.text, d.question) >= NEAR_DUPLICATE)) {
          reject('near_duplicate');
          continue;
        }
        if (questions.length >= input.count) break;
        const section = sectionOfEvidence(sections, d.evidence) ?? sections.find((s) => s.id === d.sectionId);
        const page = pageOf(pages, d.evidence);
        questions.push({
          id: `dq_${questions.length + 1}`,
          text: clip(d.question.trim(), 1_500),
          topic: clip(section?.heading ?? 'Your document', 200),
          options: d.options.map((o) => clip(o.trim(), 500)),
          correctAnswerIndex: d.correctIndex,
          explanation: clip(`${d.explanation ? `${d.explanation.trim()} ` : ''}Your document says: “${d.evidence.trim()}”${page ? ` (p. ${page})` : ''}.`, 1_200),
          questionOrigin: 'CURRICULUM_SYNTHESIZED',
          identityStatus: 'UNANCHORED',
        });
      }
      if (questions.length === 0) throw new ToolError('not_found', 'None of the questions written passed the checks against your document.');
      const topicCounts = new Map<string, number>();
      for (const q of questions) topicCounts.set(q.topic, (topicCounts.get(q.topic) ?? 0) + 1);
      return {
        data: {
          title: clip(`${input.document.title.replace(/\.(pdf|docx?|txt)$/i, '')} — Quiz`, 120),
          questions,
          topics: [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
          origin: [{ label: 'Written from your document, each answer checked against it', count: questions.length }],
          validation: { checked: drafts.length, accepted: questions.length, rejected },
          durationMinutes: Math.max(5, questions.length),
          sourceNote: 'Every answer is quoted from your document, with the page it is on.',
        },
        provenance: 'STUDENT_UPLOAD',
        usage: { tokens, costUsd },
      };
    },
    summarize: (out: any) => ({ questions: out?.questions?.length ?? 0, checked: out?.validation?.checked ?? 0 }),
  };

  for (const tool of [read, notes, cards, quiz]) registry.register(tool);
  return registry;
}
