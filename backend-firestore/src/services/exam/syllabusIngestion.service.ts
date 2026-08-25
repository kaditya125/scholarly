/**
 * Syllabus Ingestion Service
 * Parses, normalizes, and indexes official competitive examination syllabi into Pinecone.
 */

import * as crypto from 'crypto';
import { callStructuredLLM } from '../ai/structuredLlm';
import { pineconeService } from '../rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { buildVectorMetadata } from '../vectorMetadata';
import {
  ExamMaster, ExamSyllabus, SyllabusNode, syllabusNodesOf, syllabusNodesOfType, flattenSubtopics,
} from '../../types/exam.types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { ExtractedBlock } from '../../core/pipeline/types';
import { chunkExtractedBlocks, assertNoTextLost, SyllabusChunk, MAX_CHUNK_CHARS } from './syllabusChunking';
import { mergeChunkExtractions, toSyllabusNodes, ChunkExtraction, ExtractedNode, MergeConflict } from './syllabusMerge';
import { canonicalNodeId } from './syllabusCanonicalGraph';

/**
 * Per-CHUNK character budget. This is no longer a ceiling on the document.
 *
 * It was `MAX_EXTRACTION_CHARS = 50_000` and applied to the WHOLE document, so a real 60–100 page
 * exam notice was rejected outright rather than extracted. Chunking removed the need for a document
 * ceiling; what remains is a per-call budget, which is a property of the model's context window
 * rather than a limit on what the platform can ingest.
 */
export const MAX_EXTRACTION_CHARS = MAX_CHUNK_CHARS;

export interface IngestSyllabusParams {
  exam: ExamMaster;
  cycleId: string;
  version: string;
  sourceDocumentUrl: string;
  sourceDocumentId?: string;
  rawText: string;
  userId: string;
}

export class SyllabusIngestionService {
  private embeddingProvider: GoogleEmbeddingProvider;

  constructor() {
    this.embeddingProvider = new GoogleEmbeddingProvider();
  }

  /**
   * The extraction contract handed to the model.
   *
   * NO IDENTIFIERS. The previous version asked for `stageId`, `paperId`, `subjectId`, `topicId` and
   * `subtopicId` as "lowercase slugs". `buildCanonicalGraph` already ignored them when minting
   * canonical identity — but the Pinecone indexer did NOT, and keyed its vector ids on the model's
   * `topicId`. A model that phrased a slug differently between two runs would have orphaned every
   * vector for that topic. Asking for identifiers at all invites the model to believe it owns them,
   * so the request is gone: it returns names, types, order and nesting, and nothing else.
   */
  private extractionSystemPrompt(exam: ExamMaster): string {
    return `You are a strict curriculum normalizer for Indian competitive examinations.
You are given ONE SECTION of the official notice for ${exam.name} (${exam.shortName}). It may contain
part of the syllabus, none of it, or syllabus that continues from a previous section.

Return ONLY valid JSON in this exact shape:
{
  "nodes": [
    {
      "name": "Official title exactly as printed",
      "type": "STAGE" | "PAPER" | "SECTION" | "SUBJECT" | "TOPIC" | "SUBTOPIC",
      "order": 1,
      "marks": number | null,
      "questionCount": number | null,
      "durationMinutes": number | null,
      "children": [ ...same shape... ]
    }
  ]
}

RULES:
1. Do NOT output any id, slug, key or identifier field. Identity is assigned by the application.
2. Preserve official names EXACTLY as printed. Do not tidy, expand or translate them.
3. Nest as STAGE > PAPER > SECTION > SUBJECT > TOPIC > SUBTOPIC. Only include levels the document
   states. SECTION is optional and exists only where the document itself groups a paper's subjects
   (for example "Section-I", "Section-II"). If a paper lists subjects directly, omit SECTION —
   do not invent one to fill the level.
   A SUBTOPIC may itself contain SUBTOPIC children, as deeply as the document actually nests.
   Use that instead of flattening, and instead of promoting a nested item to TOPIC.
4. Do NOT invent topics, subtopics or hierarchy that this section does not contain.
5. Include ONLY syllabus/curriculum content. This is a notice, so it also contains administrative
   material — eligibility, age limits, application fees, important dates, admit card instructions,
   negative marking, reservation and relaxation rules, document requirements, centre lists, pay
   scales and how to apply. NONE of that is syllabus. Do not turn it into nodes.
6. If this section contains no syllabus content at all, return {"nodes": []}. An empty result is
   correct and expected for administrative sections — do not manufacture something to return.`;
  }

  /**
   * Extracts syllabus structure from ONE chunk. A chunk is not a syllabus; this is an intermediate
   * artifact that `mergeChunkExtractions` reassembles.
   */
  async extractChunk(exam: ExamMaster, chunk: SyllabusChunk): Promise<ChunkExtraction> {
    const result = await callStructuredLLM<{ nodes: ExtractedNode[] }>({
      prompt: `Official notice section (pages ${chunk.pageStart}-${chunk.pageEnd}) for ${exam.shortName}:\n\n${chunk.text}`,
      system: this.extractionSystemPrompt(exam),
      // An EMPTY nodes array is a valid answer — administrative sections legitimately contain no
      // syllabus. Only a malformed response is a failure, so this checks the shape, not the size.
      validate: (data) =>
        Array.isArray(data?.nodes)
          ? { ok: true }
          : { ok: false, error: 'Expected a "nodes" array' },
      label: `extract_chunk_${exam.examId}_${chunk.chunkIndex}`,
    });

    if (!result.ok || !result.data) {
      // Propagated, never swallowed: a failed chunk must fail the whole ingestion rather than
      // silently removing whatever pages it covered. See ingestion orchestrator.
      throw new Error(
        `[SyllabusIngestion] chunk ${chunk.chunkIndex} (pages ${chunk.pageStart}-${chunk.pageEnd}) ` +
        `failed extraction: ${result.error || 'schema validation failed'}`,
      );
    }

    return {
      chunkIndex: chunk.chunkIndex,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      nodes: result.data.nodes ?? [],
    };
  }

  /**
   * Full deterministic extraction for a document of ANY size.
   *
   *     page-aware chunks → per-chunk extraction → deterministic merge → canonical assembly
   *
   * Replaces the 50,000-character ceiling that made real 60–100 page notices un-ingestable. The
   * ceiling existed because the only alternative then was silent truncation; chunking removes the
   * need to choose between the two.
   *
   * Fails whole. If any chunk fails, or the merge finds contradictions, or the structure does not
   * fit the persisted hierarchy, this throws — it never returns the parts that happened to work.
   * "Chunk 1 found topics, chunk 2 failed, publish what we have" would produce a syllabus that is
   * indistinguishable from a complete one and silently missing pages.
   */
  async normalizeSyllabusDocument(params: {
    exam: ExamMaster;
    blocks: ExtractedBlock[];
    documentHash: string;
    scope: { examId: string; cycleId: string; syllabusId: string };
  }): Promise<{ nodes: SyllabusNode[]; chunkCount: number; nodeCount: number; contentHash: string }> {
    const { exam, blocks, documentHash, scope } = params;

    const chunks = chunkExtractedBlocks(blocks, documentHash);
    if (chunks.length === 0) {
      throw new Error('[SyllabusIngestion] document produced no extractable text blocks');
    }
    // Proves chunking dropped nothing before a single model call is paid for.
    assertNoTextLost(blocks, chunks);

    const contentHash = crypto.createHash('sha256')
      .update(chunks.map((c) => c.contentHash).join('')).digest('hex');

    logger.info('[SyllabusIngestion] chunked extraction starting', {
      examId: exam.examId, chunkCount: chunks.length,
      totalChars: chunks.reduce((n, c) => n + c.text.length, 0),
      pages: `${chunks[0].pageStart}-${chunks[chunks.length - 1].pageEnd}`,
    });

    // Sequential on purpose. These calls are rate-limited and order costs nothing here, while a
    // parallel burst on a 100-page notice is the reliable way to get throttled mid-document.
    const extractions: ChunkExtraction[] = [];
    for (const chunk of chunks) {
      extractions.push(await this.extractChunk(exam, chunk));
    }

    const merged = mergeChunkExtractions(extractions);
    if (merged.conflicts.length > 0) {
      const summary = merged.conflicts.slice(0, 5)
        .map((c) => `${c.code} at "${c.path}" (chunks ${c.chunkIndexes.join(',')}): ${c.detail}`).join('; ');
      throw new Error(
        `[SyllabusIngestion] merge found ${merged.conflicts.length} contradiction(s) across chunks. ` +
        `Refusing to choose between them: ${summary}`,
      );
    }
    if (merged.nodeCount === 0) {
      // Every chunk was administrative. Real, nameable, and NOT "a syllabus with no topics".
      throw new Error('[SyllabusIngestion] no syllabus content found in any section of the document');
    }

    const { nodes, errors, dropped } = toSyllabusNodes(merged.nodes, scope, canonicalNodeId);

    if (dropped.length > 0) {
      // Named individually, not just counted: dropping part of an official syllabus is exactly the
      // kind of silent narrowing this pipeline exists to prevent, so it has to be auditable.
      logger.info('[SyllabusIngestion] dropped content-free branches', {
        examId: exam.examId, count: dropped.length, branches: dropped.slice(0, 10),
      });
    }

    if (nodes.length === 0) {
      // Everything the document produced was structural scaffolding with no topic beneath it.
      // That is a document with no syllabus in it, and must never publish as an empty tree.
      throw new Error('[SyllabusIngestion] no syllabus content found in any section of the document');
    }
    if (errors.length > 0) {
      const summary = errors.slice(0, 5).map((e: MergeConflict) => `${e.code} at "${e.path}": ${e.detail}`).join('; ');
      throw new Error(
        `[SyllabusIngestion] merged structure does not fit the canonical hierarchy: ${summary}`,
      );
    }

    logger.info('[SyllabusIngestion] chunked extraction complete', {
      examId: exam.examId, chunkCount: chunks.length, nodeCount: merged.nodeCount,
      stageCount: syllabusNodesOfType(nodes, 'STAGE').length,
    });

    return { nodes, chunkCount: chunks.length, nodeCount: merged.nodeCount, contentHash };
  }

  /**
   * Admin preview: extract and merge structure from pasted text WITHOUT minting canonical identity.
   *
   * Canonical ids are a function of examId + cycleId + syllabusId + type + parent path + name. A
   * preview has no syllabus version, so it CANNOT produce them — and producing plausible-looking
   * ones would be worse than useless, because an admin could copy them somewhere that treats them
   * as real. This returns official names, types and hierarchy only, plus any contradictions found,
   * and says plainly that it is not canonical.
   *
   * The route that used to call `normalizeSyllabusText` here got ExamStage[] complete with
   * model-authored ids; that is exactly what J.9 removes.
   */
  async previewSyllabusStructure(
    exam: ExamMaster,
    rawText: string,
  ): Promise<{ canonical: false; nodes: any[]; conflicts: any[]; chunkCount: number; nodeCount: number }> {
    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('[SyllabusIngestion] no text supplied for preview');

    // Pasted text has no page structure, so it is treated as one page and split on paragraph
    // boundaries — deterministic, and the same splitter the document path uses.
    const blocks = text.split(/\n\s*\n/).map((content, i) => ({
      documentId: 'preview', documentVersionId: 'preview', blockId: `preview_${i}`,
      type: 'paragraph' as any, content: content.trim(), pageNumber: 1, sequence: i,
      sourceLocation: { pageNumber: 1, lineStart: 1, lineEnd: 1, charStart: 0, charEnd: content.length },
    })).filter((b) => b.content.length > 0) as ExtractedBlock[];

    const chunks = chunkExtractedBlocks(blocks, 'preview');
    const extractions: ChunkExtraction[] = [];
    for (const chunk of chunks) extractions.push(await this.extractChunk(exam, chunk));

    const merged = mergeChunkExtractions(extractions);
    return {
      canonical: false,
      nodes: merged.nodes,
      conflicts: merged.conflicts,
      chunkCount: chunks.length,
      nodeCount: merged.nodeCount,
    };
  }

  /**
   * Chunks and indexes the canonical syllabus document into Pinecone vectors with rich metadata.
   */
  async indexSyllabusToVectorDb(syllabus: ExamSyllabus, userId: string): Promise<number> {
    const chunks: {
      text: string;
      stageId: string;
      paperId: string;
      subject: string;
      topicId: string;
      heading: string;
    }[] = [];

    /*
     * One vector per TOPIC, wherever that topic sits in the tree.
     *
     * Ancestors are carried down rather than assumed, because a topic's ancestry differs between
     * papers of the same exam: SSC CGL Tier-I has no PAPER above its subjects, and Tier-II
     * Section-III has no SUBJECT above its topics. Reading fixed levels dropped exactly those
     * topics from the index while reporting success.
     */
    const ancestorOfType = (chain: SyllabusNode[], type: SyllabusNode['type']) =>
      [...chain].reverse().find((a) => a.type === type);

    const visit = (node: SyllabusNode, chain: SyllabusNode[]) => {
      if (node.type === 'TOPIC') {
        const stage = ancestorOfType(chain, 'STAGE');
        const paper = ancestorOfType(chain, 'PAPER');
        const section = ancestorOfType(chain, 'SECTION');
        const subject = ancestorOfType(chain, 'SUBJECT');

        // Depth-first so a nested subtopic still reaches the index; the indent keeps the printed
        // nesting visible in the embedded text rather than flattening it away.
        const subtopicsList = flattenSubtopics(
          (node.children || []).filter((c) => c.type === 'SUBTOPIC') as any,
        ).map(({ subtopic, depth }) => (depth ? '> '.repeat(depth) : '') + subtopic.name).join(', ');

        const line = (label: string, value?: string) => (value ? `${label}: ${value}
` : '');
        const text = (
          `Examination: ${syllabus.examId} (${syllabus.authority})
` +
          `Cycle: ${syllabus.cycleId} | Version: ${syllabus.version}
` +
          line('Stage', stage?.name) +
          line('Paper', paper?.name) +
          line('Section', section?.name) +
          line('Subject', subject && `${subject.name}${subject.marks ? ` (${subject.marks} Marks)` : ''}`) +
          `Topic: ${node.name}
` +
          line('Subtopics', subtopicsList) +
          `Official Source Ref: ${node.officialSourceRef || syllabus.sourceDocumentUrl}`
        ).trim();

        chunks.push({
          text,
          stageId: stage?.nodeId ?? '',
          paperId: paper?.nodeId ?? '',
          subject: subject?.name ?? section?.name ?? paper?.name ?? stage?.name ?? '',
          topicId: node.nodeId,
          heading: [stage?.name, section?.name, subject?.name, node.name].filter(Boolean).join(' > '),
        });
      }

      for (const child of node.children || []) visit(child, [...chain, node]);
    };

    for (const root of syllabusNodesOf(syllabus)) visit(root, []);

    if (chunks.length === 0) return 0;

    logger.info(`[SyllabusIngestion] Generating embeddings for ${chunks.length} syllabus topics for ${syllabus.examId}`);

    const vectorsToUpsert = [];
    // Counted separately from the buffer: incremental flushing empties the buffer as it goes, so
    // its length at the end is the last partial batch, not the work done.
    let upserted = 0;
    const namespace = env.PINECONE_NAMESPACE;

    /*
     * Deliberate pacing, batch path only.
     *
     * gemini-embedding is quota-limited per minute per base model, and a syllabus is dozens of
     * topics in a burst — enough to exhaust it and fail the whole indexing run with a 429. This is
     * an offline job where finishing slowly is entirely acceptable, so it spends time rather than
     * quota. The shared retry policy is left alone on purpose: raising its delays would also slow
     * interactive retrieval, which is the one place latency actually matters.
     */
    const pacingMs = Number(process.env.SYLLABUS_EMBEDDING_PACING_MS ?? 6000);
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (i > 0 && pacingMs > 0) await pause(pacingMs);
      if (i > 0 && i % 20 === 0) {
        logger.info(`[SyllabusIngestion] embedded ${i}/${chunks.length} topics for ${syllabus.examId}`);
      }
      const embedding = await this.embeddingProvider.generateEmbedding(chunk.text);
      /*
       * VECTOR IDENTITY IS APPLICATION-OWNED (J.9).
       *
       * This was `syl_{examId}_{cycleId}_{chunk.topicId}`, where `topicId` was a slug the model
       * invented during extraction. Two consequences, both silent: a re-ingestion whose model
       * phrased the slug differently orphaned every vector for that topic and wrote a duplicate
       * set; and the RAG layer ended up asserting a topic identity nobody had validated.
       *
       * The id is now the canonical node id — the same value `buildCanonicalGraph` derives, from
       * the version's authoritative coordinates — so the vector, the graph node and any evidence
       * keyed to it all address the same thing, and re-ingesting the same document is idempotent.
       */
      const vectorId = chunk.topicId;

      const metadata = buildVectorMetadata({
        source: {
          id: syllabus.syllabusId,
          userId,
          notebookId: `exam-${syllabus.examId.toLowerCase()}`,
          title: `${syllabus.examId} Official Syllabus ${syllabus.version}`,
          createdAt: syllabus.createdAt,
        },
        chunk: {
          text: chunk.text,
          heading: chunk.heading,
          section: chunk.stageId,
          subsection: chunk.subject,
        },
        chunkIndex: i,
        ctx: {
          subject: chunk.subject,
          class: '',
          board: syllabus.authority,
          language: 'en',
        },
        examId: syllabus.examId,
        examCycle: syllabus.cycleId,
        syllabusVersionId: syllabus.syllabusId,
        stageId: chunk.stageId,
        paperId: chunk.paperId,
        topicId: chunk.topicId,
        documentType: 'OFFICIAL_SYLLABUS',
        authority: 'OFFICIAL_SYLLABUS',
        status: syllabus.status,
        /*
         * States WHAT this vector is, so the RAG layer can never be mistaken about it.
         *
         * These vectors describe validated CANONICAL SYLLABUS NODES — one per topic in a published
         * version — not raw document chunks. A retrieval layer that cannot tell the two apart could
         * surface an unvalidated fragment of a notice as though it were canonical syllabus. The
         * distinction is recorded rather than inferred from which collection it came from.
         */
        vectorKind: 'CANONICAL_SYLLABUS_NODE',
      });

      vectorsToUpsert.push({
        id: vectorId,
        values: embedding,
        metadata,
      });

      /*
       * Flush as we go rather than once at the end.
       *
       * Embedding a syllabus takes minutes under the per-minute quota, and holding every vector
       * until the last one meant a 429 on topic 60 discarded 59 successful embeddings. Vector ids
       * are canonical, so a partial run followed by a re-run converges on the same index state
       * instead of duplicating or orphaning anything.
       */
      if (vectorsToUpsert.length >= 20) {
        const batch = vectorsToUpsert.splice(0);
        await pineconeService.upsertVectors(batch, namespace);
        upserted += batch.length;
      }
    }

    if (vectorsToUpsert.length > 0) {
      await pineconeService.upsertVectors(vectorsToUpsert, namespace);
      upserted += vectorsToUpsert.length;
    }
    logger.info(`[SyllabusIngestion] Successfully upserted ${upserted} vectors to Pinecone for ${syllabus.syllabusId}`);

    return upserted;
  }
}

export const syllabusIngestionService = new SyllabusIngestionService();
