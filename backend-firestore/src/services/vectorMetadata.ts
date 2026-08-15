import { RecordMetadata } from '@pinecone-database/pinecone';
import { DocumentSource, Notebook } from '../types';
import { METADATA_VERSION } from '../config/featureFlags';

/**
 * Normalized Pinecone vector metadata (Part 13 — metadata consistency).
 *
 * Every vector must always carry these scoping fields with NO undefined values, so retrieval
 * filters and future migrations can rely on them. Additive: existing vectors keep working; the
 * backfill script fills these in without re-embedding.
 */

/** Embedding model/dimension generation. v1 = gemini-embedding-001 @ 768 dims. */
export const EMBEDDING_VERSION = 1;
/** Chunker generation. v1 = fixed 2000-char / 200-overlap chunks. */
export const CHUNK_VERSION = 1;

export interface NotebookContext {
  subject: string;
  class: string;
  board: string;
  language: string;
}

const EMPTY_CTX: NotebookContext = { subject: '', class: '', board: '', language: 'en' };

/**
 * Best-effort resolution of subject / class / board / language from a notebook and/or source.
 * Curriculum notebooks encode these in their id (`ncert-c11-physics`) and title
 * (`NCERT Class 11 Physics (Part 1) - Chapter 5`). Never returns undefined fields.
 */
export function resolveNotebookContext(
  notebook?: Partial<Notebook> | null,
  source?: Partial<DocumentSource> | null,
): NotebookContext {
  const id = String(notebook?.id || source?.notebookId || '').toLowerCase();
  const title = String(notebook?.title || '');
  const sourceTitle = String(source?.title || '');
  const owner = String((notebook as any)?.owner || (notebook as any)?.userId || '').toLowerCase();
  const haystack = `${title} ${sourceTitle}`;

  // Class: "ncert-c11-physics" -> 11, else "Class 11" in a title.
  let cls = '';
  const idClass = id.match(/(?:^|-)c(\d{1,2})(?:-|$)/);
  if (idClass) cls = idClass[1];
  else {
    const t = haystack.match(/class\s*(\d{1,2})/i);
    if (t) cls = t[1];
  }

  // Subject: from "Class N <Subject>" up to a "(" or "-". The id-slug fallback is used ONLY for
  // curriculum notebooks (ncert-cNN-<subject>-...); a random user-notebook id must NOT become a
  // bogus "subject". Non-curriculum notebooks simply get an empty subject (still not undefined).
  let subject = '';
  const subM = haystack.match(/class\s*\d{1,2}\s+([A-Za-z][A-Za-z ]*?)(?:\s*[(\-]|$)/i);
  if (subM) {
    subject = subM[1].trim();
  } else if (id) {
    const stripped = id.replace(/^ncert-c\d{1,2}-/, '');
    if (stripped !== id) {
      const slug = stripped.split('-')[0];
      subject = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '';
    }
  }

  // Board.
  let board = '';
  if (id.startsWith('ncert') || owner === 'ncert-curriculum' || /ncert/i.test(haystack)) board = 'NCERT';

  // Language (curriculum Hindi readers are tagged in the title).
  let language = 'en';
  if (/\bhindi\b/i.test(haystack) || /-hindi/.test(id)) language = 'hi';

  return { subject, class: cls, board, language };
}

export interface BuildVectorMetadataParams {
  source: Pick<DocumentSource, 'id' | 'userId' | 'notebookId' | 'title' | 'createdAt'>;
  chunk: { text: string; pageNumber?: number; paragraphIndex?: number; section?: string; subsection?: string; heading?: string };
  chunkIndex: number;
  ctx: NotebookContext;
  difficulty?: string;
  tags?: string[];
  chunkVersion?: number;
  // Exam Intelligence (Phase 1)
  examId?: string;
  examCycle?: string;
  syllabusVersionId?: string;
  stageId?: string;
  paperId?: string;
  topicId?: string;
  documentType?: 'OFFICIAL_SYLLABUS' | 'OFFICIAL_NOTIFICATION' | 'CURRICULUM' | 'NOTES' | 'GENERAL';
  authority?: string;
  status?: string;
}

/**
 * Build the full, normalized metadata object for a chunk vector. Superset of the previous
 * inline shape (same retrieval fields) plus the required scoping/version fields — no undefineds.
 */
export function buildVectorMetadata(params: BuildVectorMetadataParams): RecordMetadata {
  const { source, chunk, chunkIndex, ctx } = params;
  const createdAt = source.createdAt || Date.now();
  return {
    // Required scoping fields (Part 13) — always present.
    userId: source.userId || '',
    notebookId: source.notebookId || '',
    sourceId: source.id || '',
    chapterId: source.id || '',
    subject: ctx.subject || '',
    class: ctx.class || '',
    board: ctx.board || '',
    language: ctx.language || 'en',
    embeddingVersion: EMBEDDING_VERSION,
    chunkVersion: params.chunkVersion ?? CHUNK_VERSION,
    metadataVersion: METADATA_VERSION,
    // Exam Intelligence scoping fields (Phase 1)
    examId: params.examId || '',
    examCycle: params.examCycle || '',
    syllabusVersionId: params.syllabusVersionId || '',
    stageId: params.stageId || '',
    paperId: params.paperId || '',
    topicId: params.topicId || '',
    documentType: params.documentType || (ctx.board === 'NCERT' ? 'CURRICULUM' : 'GENERAL'),
    authority: params.authority || (ctx.board === 'NCERT' ? 'NCERT' : 'USER_UPLOAD'),
    status: params.status || 'CURRENT',
    // Existing retrieval fields (unchanged shape/semantics).
    sourceTitle: source.title || '',
    chapter: source.title || '',
    text: chunk.text || '',
    pageNumber: chunk.pageNumber ?? 0,
    paragraphIndex: chunk.paragraphIndex ?? 0,
    chunkIndex,
    // Section hierarchy (v2 structure-aware chunker); '' for v1 chunks. Never undefined.
    section: chunk.section || '',
    subsection: chunk.subsection || '',
    heading: chunk.heading || '',
    createdAt,
    uploadedAt: new Date(createdAt).toISOString(),
    difficulty: params.difficulty || 'Medium',
    tags: (params.tags || []).slice(0, 10),
  } as RecordMetadata;
}

/**
 * The metadata-only patch to merge onto an EXISTING vector during backfill. Contains only the
 * normalized scoping/version fields (never `text`/`values`), so embeddings are untouched and no
 * field is left undefined. Pinecone `update({ id, metadata })` merges these at the top level.
 */
export function normalizedMetadataPatch(
  source: Pick<DocumentSource, 'id' | 'userId' | 'notebookId' | 'title'>,
  ctx: NotebookContext,
): RecordMetadata {
  return {
    userId: source.userId || '',
    notebookId: source.notebookId || '',
    sourceId: source.id || '',
    chapterId: source.id || '',
    subject: ctx.subject || '',
    class: ctx.class || '',
    board: ctx.board || '',
    language: ctx.language || 'en',
    embeddingVersion: EMBEDDING_VERSION,
    chunkVersion: CHUNK_VERSION,
    metadataVersion: METADATA_VERSION,
  } as RecordMetadata;
}
