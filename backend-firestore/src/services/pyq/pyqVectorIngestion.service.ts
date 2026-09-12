/**
 * PYQVectorIngestionService — Safe Vector Indexing and Semantic Retrieval for PYQs
 *
 * Enforces:
 * 1. Embedding Guard compliance: checks indexer lock, paces embedding generation.
 * 2. Strict metadata contract: `content_type: 'pyq'`, `vectorKind: 'CANONICAL_PYQ_QUESTION'`, `public: true`.
 * 3. Zero private user identity contamination (`owner: 'sadhya-exam-intel'`, `userId: ''`).
 * 4. Post-indexing retrieval verification: tests exam isolation and query relevance.
 */

import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { getVectorStore } from '../rag/vectorStore';
import { pyqRepository } from '../../repositories/pyq.repository';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import { classifyProvenance, isAuthenticPyq } from './paperIdentity';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { requireNoIndexer } from '../../../scripts/phase4a/_embedding-guard';

export class PYQVectorIngestionService {
  private embeddingProvider: GoogleEmbeddingProvider;

  constructor() {
    this.embeddingProvider = new GoogleEmbeddingProvider();
  }

  /**
   * Formats a canonical question into a rich text payload for vector embedding.
   */
  public formatQuestionForEmbedding(q: CanonicalPYQQuestion): string {
    const lines: string[] = [
      `Examination: ${q.examId} (${q.examName})`,
      `Year: ${q.year}${q.session ? ` | Session: ${q.session}` : ''}${q.shift ? ` | Shift: ${q.shift}` : ''}`,
      `Subject: ${q.subject}${q.topic ? ` > ${q.topic}` : ''}${q.subtopic ? ` > ${q.subtopic}` : ''}`,
      `Question Type: ${q.questionType} | Difficulty: ${q.difficulty || 'MEDIUM'}`,
      `Question ${q.questionNumber}: ${q.questionText}`,
    ];

    if (q.options && q.options.length > 0) {
      lines.push(`Options: ${q.options.map((opt, idx) => `(${String.fromCharCode(65 + idx)}) ${opt}`).join('  ')}`);
    }

    if (q.passageText) {
      lines.push(`Reference Passage: ${q.passageText}`);
    }

    if (q.corpusBucket === 'PRACTICE_MOCK') {
      lines.push(`Content Type: Practice & Concept Mock Question`);
    } else {
      lines.push(`Content Type: Official Previous Year Question (PYQ)`);
    }
    return lines.join('\n');
  }

  /**
   * Indexes a batch of verified and rights-approved questions into Pinecone.
   */
  async indexQuestions(
    questions: CanonicalPYQQuestion[],
    options: {
      bypassIndexerLock?: boolean;
      pacingMs?: number;
      batchSize?: number;
    } = {}
  ): Promise<{
    indexedCount: number;
    skippedCount: number;
    failedCount: number;
  }> {
    if (!options.bypassIndexerLock) {
      requireNoIndexer('PYQVectorIngestion');
    }

    const namespace = env.PINECONE_NAMESPACE;
    const pacingMs = options.pacingMs ?? Number(process.env.SYLLABUS_EMBEDDING_PACING_MS ?? 4000);
    const batchSize = options.batchSize ?? 20;

    let indexedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const approvedQuestions = questions.filter(
      (q) =>
        !q.vectorIndexed &&
        (q.ingestionState === 'RIGHTS_APPROVED' ||
          q.ingestionState === 'READY_FOR_INDEX' ||
          q.ingestionState === 'VERIFIED' ||
          q.ingestionState === 'ACTIVE' ||
          q.ingestionState === 'EXTRACTED' ||
          q.ingestionState === 'VERIFICATION_PENDING')
    );

    skippedCount = questions.length - approvedQuestions.length;

    if (approvedQuestions.length === 0) {
      logger.info(`[PYQVectorIngestion] No approved questions ready for indexing.`);
      return { indexedCount: 0, skippedCount, failedCount: 0 };
    }

    logger.info(
      `[PYQVectorIngestion] Starting vector indexing for ${approvedQuestions.length} approved questions (Namespace: ${namespace})`
    );

    const vectorsBuffer: { id: string; values: number[]; metadata: any; question: CanonicalPYQQuestion }[] = [];

    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    /**
     * Upsert a batch, then mark exactly the questions in it — and only if the upsert succeeded.
     *
     * The flag is set here rather than at embed time so that `vectorIndexed` can never claim a
     * vector that was not written. A failed upsert leaves those questions untouched, so the next
     * run picks them up again instead of skipping them forever.
     */
    const flush = async (
      batch: { id: string; values: number[]; metadata: any; question: CanonicalPYQQuestion }[],
      ns: string,
      total: number,
      soFar: number,
    ): Promise<number> => {
      const store = getVectorStore();
      try {
        await store.upsertVectors(batch.map(({ id, values, metadata }) => ({ id, values, metadata })), ns);
      } catch (err: any) {
        logger.error(
          `[PYQVectorIngestion] Upsert FAILED for ${batch.length} vectors; leaving them unmarked for retry:`,
          err,
        );
        return 0;
      }
      const now = Date.now();
      for (const { question } of batch) {
        question.vectorIndexed = true;
        question.vectorIndexedAt = now;
        question.ingestionState = 'INDEXED';
      }
      await pyqRepository.saveCanonicalQuestionsBatch(batch.map((b) => b.question));
      logger.info(
        `[PYQVectorIngestion] Flushed and persisted ${soFar + batch.length}/${total} vectors to ${store.backend}`,
      );
      return batch.length;
    };

    for (let i = 0; i < approvedQuestions.length; i++) {
      const q = approvedQuestions[i];

      try {
        let embedding: number[] | null = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (!embedding && attempts < maxAttempts) {
          attempts++;
          try {
            if (i > 0 && pacingMs > 0) {
              await pause(pacingMs);
            }
            const embeddingText = this.formatQuestionForEmbedding(q);
            embedding = await this.embeddingProvider.generateEmbedding(embeddingText);
          } catch (err: any) {
            const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Quota exceeded');
            if (is429 && attempts < maxAttempts) {
              const backoff = attempts * 6000;
              logger.warn(`[PYQVectorIngestion] 429 rate limit hit for ${q.questionId}. Backing off for ${backoff}ms...`);
              await pause(backoff);
            } else if (attempts >= maxAttempts) {
              throw err;
            }
          }
        }

        if (!embedding) {
          throw new Error('Failed to generate embedding after max attempts');
        }

        const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        // STRICT METADATA CONTRACT
        const metadata = {
          content_type: 'pyq', // Explicit distinction from textbook

          /*
           * Provenance travels with the vector.
           *
           * Ranking reads the payload, not Firestore, so a vector written without these fields is
           * unclassified at retrieval time — and `content_type: 'pyq'` alone used to earn the 1.4x
           * authentic-past-paper boost, which is how 5,050 practice questions came to be ranked as
           * official. Classifying here means a newly indexed question is never briefly authentic
           * by default while it waits for a backfill: an overnight run that predated this wrote
           * 1,660 vectors with no class at all.
           */
          provenanceClass: (q as any).provenanceClass ?? classifyProvenance(q as any),
          isAuthenticPyq: isAuthenticPyq((q as any).provenanceClass ?? classifyProvenance(q as any)),
          canonicalPaperId: (q as any).canonicalPaperId ?? null,
          paperIdentityStatus: (q as any).paperIdentityStatus ?? 'UNRESOLVED',
          sittingId: (q as any).sittingId ?? null,
          normalizedSession: (q as any).normalizedSession ?? null,
          normalizedShift: (q as any).normalizedShift ?? null,
          normalizedSittingDate: (q as any).normalizedSittingDate ?? null,

          corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
          vectorKind: q.corpusBucket === 'PRACTICE_MOCK' ? 'PRACTICE_QUESTION' : 'CANONICAL_PYQ_QUESTION',
          public: true,        // Public examination record
          owner: 'sadhya-exam-intel',
          userId: '',          // Zero private user ID contamination
          notebookId: `exam-${q.examId.toLowerCase()}`,
          sourceId: q.sourceId,
          examId: q.examId,
          examName: q.examName,
          year: q.year,
          session: q.session || '',
          paper: q.paper || '',
          shift: q.shift || '',
          subject: q.subject,
          topic: q.topic || '',
          subtopic: q.subtopic || '',
          syllabusNodeId: q.syllabusNodeId || '',
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          questionType: q.questionType,
          difficulty: q.difficulty || 'MEDIUM',
          sourceType: q.sourceType,
          verificationStatus: q.verificationStatus,
          rightsStatus: q.rightsStatus,
          text: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          hasDiagram: Boolean(q.diagrams && q.diagrams.length > 0),
          createdAt: q.createdAt,
          uploadedAt: q.createdAt && !isNaN(new Date(q.createdAt).getTime()) ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
        };

        // Carry the question with its vector. The write-back used to re-derive the batch as
        // `approvedQuestions.slice(indexedCount - toUpsert.length, indexedCount)`, which assumes
        // the successes are a contiguous run from the start of the list. One failure breaks that
        // assumption in both directions: the failed question falls inside the slice and is marked
        // vectorIndexed with no vector behind it, and an equal number of genuinely indexed
        // questions fall outside it and are never marked. A live audit of the corpus found
        // exactly that shape — 334 questions flagged indexed with no vector, and 269 with a
        // vector but no flag. Pairing each vector with its own question removes the guesswork.
        vectorsBuffer.push({
          id: vectorId,
          values: embedding,
          metadata,
          question: q,
        });

        // Flush incrementally to vector store and Firestore checkpoint
        if (vectorsBuffer.length >= batchSize) {
          const toUpsert = vectorsBuffer.splice(0);
          const written = await flush(toUpsert, namespace, approvedQuestions.length, indexedCount);
          indexedCount += written;
          failedCount += toUpsert.length - written;
        }
      } catch (err: any) {
        failedCount++;
        logger.error(`[PYQVectorIngestion] Failed to embed question ${q.questionId}:`, err);
      }
    }

    if (vectorsBuffer.length > 0) {
      const toUpsert = vectorsBuffer.splice(0);
      const written = await flush(toUpsert, namespace, approvedQuestions.length, indexedCount);
      indexedCount += written;
      failedCount += toUpsert.length - written;
    }

    logger.info(
      `[PYQVectorIngestion] Completed indexing: ${indexedCount} indexed, ${skippedCount} skipped, ${failedCount} failed`
    );

    return { indexedCount, skippedCount, failedCount };
  }

  /**
   * Performs end-to-end retrieval validation testing for a query and validates exam isolation.
   */
  async testRetrieval(params: {
    query: string;
    expectedExamId: string;
    expectedSubject?: string;
    expectedTopic?: string;
    corpusBucket?: 'OFFICIAL_PYQ' | 'PRACTICE_MOCK';
    topK?: number;
  }): Promise<{
    passed: boolean;
    totalMatches: number;
    topMatchScore: number;
    results: any[];
    isolationVerified: boolean;
    diagnostics: string;
  }> {
    const { query, expectedExamId, expectedSubject, expectedTopic, corpusBucket, topK = 5 } = params;

    const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
    const namespace = env.PINECONE_NAMESPACE;

    // Filter by examId & content_type='pyq'
    const filter: any = {
      examId: expectedExamId,
      content_type: 'pyq',
    };
    if (expectedSubject) filter.subject = expectedSubject;
    if (corpusBucket === 'PRACTICE_MOCK') {
      filter.corpusBucket = 'PRACTICE_MOCK';
    } else if (corpusBucket === 'OFFICIAL_PYQ') {
      filter.corpusBucket = { $ne: 'PRACTICE_MOCK' };
    }

    const matches = await getVectorStore().queryVectors(queryEmbedding, topK, filter, namespace);

    if (!matches || matches.length === 0) {
      return {
        passed: false,
        totalMatches: 0,
        topMatchScore: 0,
        results: [],
        isolationVerified: false,
        diagnostics: `No matches found for query '${query}' under exam '${expectedExamId}'`,
      };
    }

    // Validate that no vector from a different exam was returned
    const nonMatchingExamVectors = matches.filter((m: any) => m.metadata?.examId !== expectedExamId);
    const isolationVerified = nonMatchingExamVectors.length === 0;

    const topMatchScore = matches[0]?.score || 0;
    const passed = matches.length > 0 && isolationVerified && topMatchScore >= 0.50;

    return {
      passed,
      totalMatches: matches.length,
      topMatchScore,
      results: matches.map((m: any) => ({
        questionId: m.metadata?.questionId,
        examId: m.metadata?.examId,
        subject: m.metadata?.subject,
        topic: m.metadata?.topic,
        text: m.metadata?.text,
        score: m.score,
      })),
      isolationVerified,
      diagnostics: passed
        ? `Successfully retrieved ${matches.length} questions for ${expectedExamId} with top score ${(topMatchScore * 100).toFixed(1)}%`
        : `Retrieval check failed: score=${topMatchScore}, isolation=${isolationVerified}`,
    };
  }
}

export const pyqVectorIngestionService = new PYQVectorIngestionService();
