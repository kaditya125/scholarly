/**
 * Syllabus Ingestion Service
 * Parses, normalizes, and indexes official competitive examination syllabi into Pinecone.
 */

import * as crypto from 'crypto';
import { callStructuredLLM } from '../ai/structuredLlm';
import { pineconeService } from '../rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { buildVectorMetadata } from '../vectorMetadata';
import { ExamMaster, ExamSyllabus, ExamStage } from '../../types/exam.types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

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
   * Normalizes raw official notification text into structured canonical ExamStage[] hierarchy.
   */
  async normalizeSyllabusText(
    exam: ExamMaster,
    rawText: string
  ): Promise<{ stages: ExamStage[]; contentHash: string }> {
    const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

    const systemPrompt = `You are a strict curriculum normalizer for Indian competitive examinations.
Given the extracted official syllabus notice text for ${exam.name} (${exam.shortName}), extract and structure the complete canonical syllabus hierarchy.
Return ONLY valid JSON adhering to this exact schema:
{
  "stages": [
    {
      "stageId": "string (lowercase slug e.g. tier_1, prelims, mains)",
      "name": "string (Official Stage Title e.g. Tier I (Computer Based Examination))",
      "order": 1,
      "papers": [
        {
          "paperId": "string (slug e.g. paper_1)",
          "name": "string",
          "order": 1,
          "subjects": [
            {
              "subjectId": "string (slug e.g. quantitative_aptitude)",
              "name": "string",
              "order": 1,
              "marks": number | null,
              "questionCount": number | null,
              "durationMinutes": number | null,
              "topics": [
                {
                  "topicId": "string (slug e.g. ssc_cgl_quant_algebra)",
                  "name": "string (Official Topic Title)",
                  "order": 1,
                  "officialSourceRef": "string or null",
                  "subtopics": [
                    {
                      "subtopicId": "string (slug)",
                      "name": "string",
                      "order": 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
IMPORTANT:
1. Preserve official topic names exactly as printed in the official notification.
2. If subtopics are not explicitly listed in the notice, leave the "subtopics" array empty. Do NOT invent subtopics.
3. Every ID must be lowercase alphanumeric with underscores.`;

    const prompt = `Official Syllabus Text for ${exam.shortName}:\n\n${rawText.slice(0, 50000)}`;

    const result = await callStructuredLLM<{ stages: ExamStage[] }>({
      prompt,
      system: systemPrompt,
      validate: (data) =>
        Array.isArray(data?.stages) && data.stages.length > 0
          ? { ok: true }
          : { ok: false, error: 'Expected non-empty stages array' },
      label: `normalize_syllabus_${exam.examId}`,
    });

    if (!result.ok || !result.data?.stages) {
      throw new Error(`Failed to extract structured syllabus: ${result.error || 'LLM schema validation failed'}`);
    }

    return {
      stages: result.data.stages,
      contentHash,
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

    // Traverse syllabus tree and build descriptive chunk representations
    for (const stage of syllabus.stages || []) {
      for (const paper of stage.papers || []) {
        for (const subject of paper.subjects || []) {
          for (const topic of subject.topics || []) {
            const subtopicsList = (topic.subtopics || []).map((s) => s.name).join(', ');
            const text = `Examination: ${syllabus.examId} (${syllabus.authority})
Cycle: ${syllabus.cycleId} | Version: ${syllabus.version}
Stage: ${stage.name}
Paper: ${paper.name}
Subject: ${subject.name} ${subject.marks ? `(${subject.marks} Marks)` : ''}
Topic: ${topic.name}
${subtopicsList ? `Subtopics: ${subtopicsList}` : ''}
Official Source Ref: ${topic.officialSourceRef || syllabus.sourceDocumentUrl}`.trim();

            chunks.push({
              text,
              stageId: stage.stageId,
              paperId: paper.paperId,
              subject: subject.name,
              topicId: topic.topicId,
              heading: `${stage.name} > ${subject.name} > ${topic.name}`,
            });
          }
        }
      }
    }

    if (chunks.length === 0) return 0;

    logger.info(`[SyllabusIngestion] Generating embeddings for ${chunks.length} syllabus topics for ${syllabus.examId}`);

    const vectorsToUpsert = [];
    const namespace = env.PINECONE_NAMESPACE;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.embeddingProvider.generateEmbedding(chunk.text);
      const vectorId = `syl_${syllabus.examId.toLowerCase()}_${syllabus.cycleId}_${chunk.topicId}`;

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
      });

      vectorsToUpsert.push({
        id: vectorId,
        values: embedding,
        metadata,
      });
    }

    await pineconeService.upsertVectors(vectorsToUpsert, namespace);
    logger.info(`[SyllabusIngestion] Successfully upserted ${vectorsToUpsert.length} vectors to Pinecone for ${syllabus.syllabusId}`);

    return vectorsToUpsert.length;
  }
}

export const syllabusIngestionService = new SyllabusIngestionService();
