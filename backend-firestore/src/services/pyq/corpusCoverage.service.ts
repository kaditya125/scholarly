/**
 * Vector coverage, computed from live data.
 *
 * Every number here is derived at call time. Coverage figures written into a report age badly —
 * this corpus went from 33,048 to 63,292 questions in a day — so a hardcoded baseline is wrong
 * before anyone reads it. The point of this service is to make "is the backfill working?" a
 * question with a current answer rather than a remembered one.
 *
 * Expensive by nature: it reads every question and every PYQ point to join them by derived id, so
 * results are cached. The cache is short because the figure it reports is the thing an operator
 * watches change during a backfill.
 */
import { db } from '../../config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../rag/qdrant.service';
import { env } from '../../config/env';
import { cacheService } from '../cache.service';
import { logger } from '../../utils/logger';

const CACHE_KEY = 'pyq_corpus_coverage_v1';
const TTL_SECONDS = 600;

const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

export interface CoverageRow {
  key: string;
  canonicalCount: number;
  vectorCount: number;
  missingVectorCount: number;
  coveragePercentage: number;
  /** Records that cannot usefully be embedded, and why — so 100% stays an honest target. */
  ineligible: { noText: number; suspectEncoding: number };
  eligibleCount: number;
  eligibleCoveragePercentage: number;
}

export interface CoverageReport {
  generatedAt: string;
  totals: CoverageRow;
  byExam: CoverageRow[];
  byExamYear: CoverageRow[];
  byExamSubject: CoverageRow[];
  metadata: {
    withTopic: number;
    withTopicSourceCanonical: number;
    withTopicSourceInferred: number;
    withSyllabusNode: number;
    withCanonicalPaper: number;
    withSitting: number;
  };
}

function emptyRow(key: string): CoverageRow {
  return {
    key, canonicalCount: 0, vectorCount: 0, missingVectorCount: 0, coveragePercentage: 0,
    ineligible: { noText: 0, suspectEncoding: 0 }, eligibleCount: 0, eligibleCoveragePercentage: 0,
  };
}

function finalise(r: CoverageRow): CoverageRow {
  r.missingVectorCount = r.canonicalCount - r.vectorCount;
  r.coveragePercentage = r.canonicalCount ? +((r.vectorCount / r.canonicalCount) * 100).toFixed(2) : 0;
  r.eligibleCount = r.canonicalCount - r.ineligible.noText;
  r.eligibleCoveragePercentage = r.eligibleCount ? +((r.vectorCount / r.eligibleCount) * 100).toFixed(2) : 0;
  return r;
}

export class CorpusCoverageService {
  async compute(force = false): Promise<CoverageReport> {
    if (!force) {
      const cached = await cacheService.get<CoverageReport>(CACHE_KEY).catch(() => null);
      if (cached) return cached;
    }

    const client = new QdrantClient({
      url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false,
    });

    // Point ids only — payloads are not needed for a coverage join and would multiply the cost.
    const points = new Set<string>();
    let offset: any = undefined;
    while (true) {
      const res: any = await client.scroll(QDRANT_COLLECTION, {
        limit: 2000, offset, with_payload: { include: ['content_type'] } as any, with_vector: false,
      });
      for (const p of res.points ?? []) if (p.payload?.content_type === 'pyq') points.add(String(p.id));
      offset = res.next_page_offset;
      if (!offset) break;
    }

    const totals = emptyRow('TOTAL');
    const byExam = new Map<string, CoverageRow>();
    const byExamYear = new Map<string, CoverageRow>();
    const byExamSubject = new Map<string, CoverageRow>();
    const metadata = {
      withTopic: 0, withTopicSourceCanonical: 0, withTopicSourceInferred: 0,
      withSyllabusNode: 0, withCanonicalPaper: 0, withSitting: 0,
    };

    const pick = (m: Map<string, CoverageRow>, key: string) => {
      if (!m.has(key)) m.set(key, emptyRow(key));
      return m.get(key)!;
    };

    let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const d = doc.data() as any;
        const exam = String(d.examId ?? 'UNKNOWN');
        const hasVector = points.has(derive(d.questionId));
        const noText = !has(d.questionText);
        const suspect = d.textIntegrity === 'SUSPECT_ENCODING';

        for (const row of [
          totals,
          pick(byExam, exam),
          pick(byExamYear, `${exam}|${d.year ?? 'NO_YEAR'}`),
          pick(byExamSubject, `${exam}|${d.subject ?? 'NO_SUBJECT'}`),
        ]) {
          row.canonicalCount++;
          if (hasVector) row.vectorCount++;
          if (noText) row.ineligible.noText++;
          if (suspect) row.ineligible.suspectEncoding++;
        }

        if (has(d.topic)) metadata.withTopic++;
        if (d.topicSource === 'CANONICAL' || d.topicSource === 'OFFICIAL') metadata.withTopicSourceCanonical++;
        if (d.topicSource === 'INFERRED') metadata.withTopicSourceInferred++;
        if (has(d.syllabusNodeId)) metadata.withSyllabusNode++;
        if (has(d.canonicalPaperId)) metadata.withCanonicalPaper++;
        if (has(d.sittingId)) metadata.withSitting++;
      }
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 2000) break;
    }

    const report: CoverageReport = {
      generatedAt: new Date().toISOString(),
      totals: finalise(totals),
      byExam: [...byExam.values()].map(finalise).sort((a, b) => b.canonicalCount - a.canonicalCount),
      byExamYear: [...byExamYear.values()].map(finalise).sort((a, b) => b.canonicalCount - a.canonicalCount),
      byExamSubject: [...byExamSubject.values()].map(finalise).sort((a, b) => b.canonicalCount - a.canonicalCount),
      metadata,
    };

    await cacheService.set(CACHE_KEY, report, TTL_SECONDS).catch(() => {});
    logger.info('[CorpusCoverage] computed', {
      questions: report.totals.canonicalCount, vectors: report.totals.vectorCount,
      coverage: report.totals.coveragePercentage,
    });
    return report;
  }
}

export const corpusCoverageService = new CorpusCoverageService();
