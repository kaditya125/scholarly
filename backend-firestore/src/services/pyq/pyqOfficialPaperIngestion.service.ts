import * as crypto from 'crypto';
import {
  CanonicalPYQQuestion,
  PYQQuestionOccurrence,
  PYQAnswerConflictRecord,
  PYQSourceEntry,
} from '../../types/pyq.types';
import { pyqRepository } from '../../repositories/pyq.repository';

export interface RawExtractedOfficialQuestion {
  questionNumber: number;
  subject: string;
  chapter?: string;
  topic?: string;
  questionText: string;
  options?: string[];
  type?: 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'NUMERICAL';
  extractedAnswer?: string;
}

export interface OfficialAnswerKeyEntry {
  questionNumber: number;
  correctAnswer: string; // e.g. "A", "B", "1,2", "BONUS", "DROPPED"
  isDropped?: boolean;
  isBonus?: boolean;
  allowedMultipleAnswers?: string[];
}

export interface IngestOfficialPaperParams {
  sourceEntry: PYQSourceEntry;
  questions: RawExtractedOfficialQuestion[];
  answerKeyEntries?: OfficialAnswerKeyEntry[];
}

export interface IngestionResult {
  sourceId: string;
  totalExtracted: number;
  newCanonicalQuestions: number;
  existingMergedOccurrences: number;
  answerConflictsDetected: number;
  conflicts: PYQAnswerConflictRecord[];
}

export class PYQOfficialPaperIngestionService {
  private normalizeString(s: string): string {
    if (!s) return '';
    return s
      .toLowerCase()
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  computeContentHash(questionText: string, options?: string[]): string {
    const norm = this.normalizeString(questionText);
    const normOpts = (options || []).map((o) => this.normalizeString(o)).join('|');
    return crypto.createHash('sha256').update(`${norm}:::${normOpts}`).digest('hex');
  }

  async ingestPaper(params: IngestOfficialPaperParams): Promise<IngestionResult> {
    const { sourceEntry, questions, answerKeyEntries } = params;

    if (!sourceEntry.documentHash) {
      throw new Error(`Cannot ingest paper without registered documentHash on source: ${sourceEntry.sourceId}`);
    }

    const keyMap = new Map<number, OfficialAnswerKeyEntry>();
    if (answerKeyEntries) {
      answerKeyEntries.forEach((k) => keyMap.set(k.questionNumber, k));
    }

    let newCount = 0;
    let mergedCount = 0;
    const conflicts: PYQAnswerConflictRecord[] = [];
    const now = Date.now();

    for (const raw of questions) {
      const contentHash = this.computeContentHash(raw.questionText, raw.options);
      const keyEntry = keyMap.get(raw.questionNumber);

      let canonicalAnswer = raw.extractedAnswer || '';
      let conflictRecord: PYQAnswerConflictRecord | undefined;

      if (keyEntry) {
        if (keyEntry.isDropped || keyEntry.correctAnswer.toUpperCase() === 'DROPPED') {
          conflictRecord = {
            questionId: '',
            storedAnswer: raw.extractedAnswer || 'UNANSWERED',
            officialAnswer: 'DROPPED',
            answerKeySource: sourceEntry.answerKeySource || sourceEntry.sourceName,
            answerKeyHash: sourceEntry.answerKeyHash || '',
            conflictType: 'BONUS_DROPPED',
            resolutionStatus: 'RESOLVED_OFFICIAL',
            recordedAt: now,
            notes: 'Official Answer Key dropped this question from scoring.',
          };
          canonicalAnswer = 'DROPPED';
        } else if (keyEntry.isBonus || keyEntry.correctAnswer.toUpperCase() === 'BONUS') {
          conflictRecord = {
            questionId: '',
            storedAnswer: raw.extractedAnswer || 'UNANSWERED',
            officialAnswer: 'BONUS',
            answerKeySource: sourceEntry.answerKeySource || sourceEntry.sourceName,
            answerKeyHash: sourceEntry.answerKeyHash || '',
            conflictType: 'BONUS_DROPPED',
            resolutionStatus: 'RESOLVED_OFFICIAL',
            recordedAt: now,
            notes: 'Official Answer Key awarded bonus marks to all candidates.',
          };
          canonicalAnswer = 'BONUS';
        } else if (raw.extractedAnswer && raw.extractedAnswer !== keyEntry.correctAnswer) {
          conflictRecord = {
            questionId: '',
            storedAnswer: raw.extractedAnswer,
            officialAnswer: keyEntry.correctAnswer,
            answerKeySource: sourceEntry.answerKeySource || sourceEntry.sourceName,
            answerKeyHash: sourceEntry.answerKeyHash || '',
            conflictType: 'DISCREPANCY',
            resolutionStatus: 'UNRESOLVED',
            recordedAt: now,
            notes: `Stored answer ${raw.extractedAnswer} conflicts with official answer key ${keyEntry.correctAnswer}.`,
          };
          canonicalAnswer = keyEntry.correctAnswer;
        } else {
          canonicalAnswer = keyEntry.correctAnswer;
        }
      }

      const occurrence: PYQQuestionOccurrence = {
        examId: sourceEntry.examId,
        year: sourceEntry.year,
        session: sourceEntry.session,
        paper: sourceEntry.paper,
        shift: sourceEntry.shift,
        paperCode: sourceEntry.paperCode,
        questionNumber: raw.questionNumber,
        sourceId: sourceEntry.sourceId,
        documentHash: sourceEntry.documentHash,
        answerKeyHash: sourceEntry.answerKeyHash,
        verifiedAt: now,
        verificationMethod: 'OFFICIAL_PAPER_INGESTION_V1',
      };

      // Check if canonical question with this contentHash already exists in Firestore
      const existing = await pyqRepository.findQuestionByHash(contentHash);

      if (existing) {
        // Occurrence vs Content Identity: Add verified occurrence without duplicating content
        existing.occurrences = existing.occurrences || [];
        const occurrenceExists = existing.occurrences.some(
          (o) =>
            o.sourceId === occurrence.sourceId &&
            o.questionNumber === occurrence.questionNumber
        );

        if (!occurrenceExists) {
          existing.occurrences.push(occurrence);
        }

        existing.provenanceRecords.push({
          sourceTier: sourceEntry.sourceTier,
          sourceName: sourceEntry.sourceName,
          sourceUrl: sourceEntry.sourceUrl,
          sourceDomain: sourceEntry.sourceDomain,
          retrievedAt: now,
          isOfficial: true,
          extractedAnswer: canonicalAnswer,
          contentHash,
          notes: `Corroborated by official document SHA-256: ${sourceEntry.documentHash}`,
        });

        if (conflictRecord) {
          conflictRecord.questionId = existing.questionId;
          existing.answerConflict = conflictRecord;
          conflicts.push(conflictRecord);
        }

        existing.updatedAt = now;
        await pyqRepository.saveCanonicalQuestion(existing);
        mergedCount++;
      } else {
        // Create new canonical question
        const qId = `pyq:${sourceEntry.examId.toLowerCase()}:${sourceEntry.year}:${(sourceEntry.paperCode || sourceEntry.paper || 'main').toLowerCase().replace(/[^a-z0-9]/g, '_')}:q${raw.questionNumber}:${contentHash.slice(0, 8)}`;

        if (conflictRecord) {
          conflictRecord.questionId = qId;
          conflicts.push(conflictRecord);
        }

        const canonical: CanonicalPYQQuestion = {
          questionId: qId,
          examId: sourceEntry.examId,
          examName: sourceEntry.examName,
          year: sourceEntry.year,
          session: sourceEntry.session,
          paper: sourceEntry.paper,
          shift: sourceEntry.shift,
          subject: raw.subject,
          chapter: raw.chapter || 'General',
          topic: raw.topic || raw.subject,
          questionNumber: raw.questionNumber,
          questionText: raw.questionText,
          questionType: raw.type || 'MCQ_SINGLE',
          options: raw.options || [],
          correctAnswer: canonicalAnswer,
          correctAnswerSource: sourceEntry.answerKeySource || sourceEntry.sourceName,
          language: 'en',
          extractionQualityScore: 1.0,
          sourceId: sourceEntry.sourceId,
          sourceUrl: sourceEntry.sourceUrl,
          sourceType: 'TIER_A_OFFICIAL',
          provenanceRecords: [
            {
              sourceTier: sourceEntry.sourceTier,
              sourceName: sourceEntry.sourceName,
              sourceUrl: sourceEntry.sourceUrl,
              sourceDomain: sourceEntry.sourceDomain,
              retrievedAt: now,
              isOfficial: true,
              extractedAnswer: canonicalAnswer,
              contentHash,
              notes: `Official import verified with SHA-256: ${sourceEntry.documentHash}`,
            },
          ],
          verificationStatus: 'OFFICIAL_CONFIRMED',
          rightsStatus: sourceEntry.rightsStatus,
          rightsSource: sourceEntry.authority,
          redistributionAllowed: true,
          contentHash,
          origin: 'authentic_import',
          occurrences: [occurrence],
          answerConflict: conflictRecord,
          ingestionState: 'ACTIVE',
          restorationState: 'VERIFIED_AUTHENTIC',
          vectorIndexed: false,
          retrievalTested: false,
          createdAt: now,
          updatedAt: now,
        };

        await pyqRepository.saveCanonicalQuestion(canonical);
        newCount++;
      }
    }

    return {
      sourceId: sourceEntry.sourceId,
      totalExtracted: questions.length,
      newCanonicalQuestions: newCount,
      existingMergedOccurrences: mergedCount,
      answerConflictsDetected: conflicts.length,
      conflicts,
    };
  }
}

export const pyqOfficialPaperIngestionService = new PYQOfficialPaperIngestionService();
