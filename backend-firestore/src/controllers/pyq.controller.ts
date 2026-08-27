/**
 * PYQController — REST API Controller for Previous Year Questions
 */

import { Request, Response } from 'express';
import { pyqRepository } from '../repositories/pyq.repository';
import { pyqSourceDiscoveryService } from '../services/pyq/pyqSourceDiscovery.service';
import { pyqVerificationEngine } from '../services/pyq/pyqVerificationEngine.service';
import { pyqRightsGovernanceService } from '../services/pyq/pyqRightsGovernance.service';
import { pyqVectorIngestionService } from '../services/pyq/pyqVectorIngestion.service';
import { pyqAnalyticsService } from '../services/pyq/pyqAnalytics.service';
import { PYQVerificationStatus, PYQRightsStatus, PYQIngestionState } from '../types/pyq.types';

export class PYQController {
  /**
   * GET /api/pyq/matrix
   * Returns human- and machine-readable PYQ availability matrix.
   */
  async getAvailabilityMatrix(req: Request, res: Response) {
    try {
      const examId = req.query.examId as string | undefined;
      const matrix = await pyqRepository.generateAvailabilityMatrix(examId);
      res.json({ matrix, totalRows: matrix.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate availability matrix' });
    }
  }

  /**
   * GET /api/pyq/sources
   * Lists discovered sources from the registry.
   */
  async listSources(req: Request, res: Response) {
    try {
      const { examId, year, sourceTier, retrievalStatus } = req.query;
      const sources = await pyqRepository.listSources({
        examId: examId as string,
        year: year ? parseInt(year as string, 10) : undefined,
        sourceTier: sourceTier as string,
        retrievalStatus: retrievalStatus as string,
      });
      res.json({ sources, count: sources.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list sources' });
    }
  }

  /**
   * POST /api/pyq/discover/:examId
   * Triggers multi-tier discovery for an exam.
   */
  async discoverSources(req: Request, res: Response) {
    try {
      const { examId } = req.params;
      const result = await pyqSourceDiscoveryService.discoverExamPYQSources(examId);
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Source discovery failed' });
    }
  }

  /**
   * GET /api/pyq/questions
   * Queries canonical questions with flexible filtering.
   */
  async listQuestions(req: Request, res: Response) {
    try {
      const {
        examId,
        year,
        session,
        shift,
        subject,
        topic,
        verificationStatus,
        rightsStatus,
        ingestionState,
        vectorIndexed,
        limit,
      } = req.query;

      const questions = await pyqRepository.listQuestions({
        examId: examId as string,
        year: year ? parseInt(year as string, 10) : undefined,
        session: session as string,
        shift: shift as string,
        subject: subject as string,
        topic: topic as string,
        verificationStatus: verificationStatus as PYQVerificationStatus,
        rightsStatus: rightsStatus as PYQRightsStatus,
        ingestionState: ingestionState as PYQIngestionState,
        vectorIndexed: vectorIndexed !== undefined ? vectorIndexed === 'true' : undefined,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });

      res.json({ questions, count: questions.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to query questions' });
    }
  }

  /**
   * GET /api/pyq/questions/:questionId
   * Retrieves single question with complete provenance and verification evidence.
   */
  async getQuestion(req: Request, res: Response) {
    try {
      const { questionId } = req.params;
      const question = await pyqRepository.getQuestionById(questionId);
      if (!question) {
        return res.status(404).json({ error: `Question '${questionId}' not found` });
      }
      res.json({ question });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get question' });
    }
  }

  /**
   * POST /api/pyq/rights/approve
   * Evaluates and approves rights for a question batch.
   */
  async approveRights(req: Request, res: Response) {
    try {
      const { questionIds } = req.body;
      const questions = [];
      for (const id of questionIds || []) {
        const q = await pyqRepository.getQuestionById(id);
        if (q) questions.push(q);
      }

      const result = pyqRightsGovernanceService.applyRightsApproval(questions, req.user?.uid || 'admin');
      await pyqRepository.saveCanonicalQuestionsBatch(result.processedQuestions);

      res.json({ ok: true, approvedCount: result.approvedCount, quarantinedCount: result.quarantinedCount });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Rights approval failed' });
    }
  }

  /**
   * POST /api/pyq/index
   * Indexes approved questions into Pinecone.
   */
  async indexApprovedQuestions(req: Request, res: Response) {
    try {
      const { examId, year } = req.body;
      const questions = await pyqRepository.listQuestions({
        examId,
        year: year ? parseInt(year, 10) : undefined,
        ingestionState: 'RIGHTS_APPROVED',
        vectorIndexed: false,
        limit: 100,
      });

      const result = await pyqVectorIngestionService.indexQuestions(questions);
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Vector indexing failed' });
    }
  }

  /**
   * GET /api/pyq/analytics/:examId
   * Retrieves analytics, topic weightages, and historical trends.
   */
  async getAnalytics(req: Request, res: Response) {
    try {
      const { examId } = req.params;
      const analytics = await pyqAnalyticsService.computeExamAnalytics(examId);
      res.json({ analytics });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to compute analytics' });
    }
  }

  /**
   * POST /api/pyq/retrieval-test
   * Tests semantic retrieval accuracy and exam isolation.
   */
  async testRetrieval(req: Request, res: Response) {
    try {
      const { query, expectedExamId, expectedSubject, expectedTopic, topK } = req.body;
      if (!query || !expectedExamId) {
        return res.status(400).json({ error: 'query and expectedExamId are required' });
      }

      const result = await pyqVectorIngestionService.testRetrieval({
        query,
        expectedExamId,
        expectedSubject,
        expectedTopic,
        topK: topK || 5,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Retrieval test failed' });
    }
  }
}

export const pyqController = new PYQController();
