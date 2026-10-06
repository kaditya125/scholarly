import { Request, Response, NextFunction } from 'express';
import { quizGeneratorService } from '../services/tests/quizGenerator.service';
import { quizAttemptsService, QuizAttemptError } from '../services/tests/quizAttempts.service';
import { UserStatsService } from '../services/userStats.service';
import { detectExamId } from '../services/pyq/examIndex';
import { drillTopicsService } from '../services/tests/drillTopics.service';
import { QuizMode, QuizSource, StoredQuizQuestion } from '../types/quizAttempt.types';
import { remediationDrillService, RemediationError } from '../services/pedagogy/remediationDrill.service';
import { testsRepository } from '../repositories/tests.repository';

const statsService = new UserStatsService();

export class QuizController {
  /**
   * GET /quiz  (also POST /quiz/generate)
   * Generates a real weak-area MCQ quiz for the authed user, PERSISTS it as an in-progress
   * attempt, and returns the answer-free questions plus the attempt id the engine submits against.
   */
  public getQuiz = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const topic = (req.query.topic as string) || (req.body?.topic as string) || undefined;
      const subject = (req.query.subject as string) || (req.body?.subject as string) || undefined;
      const notebookId = (req.query.notebookId as string) || (req.body?.notebookId as string) || undefined;
      const notebookTitle = (req.query.notebookTitle as string) || (req.body?.notebookTitle as string) || undefined;
      const mode = ((req.query.mode as string) || (req.body?.mode as string) || 'exam') as QuizMode;
      const count = req.query.count ? parseInt(String(req.query.count), 10) : (req.body?.count as number | undefined);
      // Previously never read here, so a caller with a real syllabusNodeId (e.g. from a weak-area
      // recommendation carrying one) had no way to reach it — the service supported this all along,
      // the request just never carried it through.
      const syllabusNodeId = (req.query.syllabusNodeId as string) || (req.body?.syllabusNodeId as string) || undefined;
      const examId = (req.query.examId as string) || (req.body?.examId as string) || undefined;
      const isWeakAreaDrill = (req.query.isWeakAreaDrill ?? req.body?.isWeakAreaDrill) === true
        || (req.query.isWeakAreaDrill ?? req.body?.isWeakAreaDrill) === 'true';

      const ALLOWED_TEST_MODES = ['PRACTICE', 'SMART_MIXED', 'PYQ_PRACTICE', 'WEAK_AREA_DRILL', 'FULL_MOCK'];
      const requestedMode = ALLOWED_TEST_MODES.includes(req.body?.testMode) ? req.body.testMode : undefined;
      const mixerMode = requestedMode || (topic && /mock|full-length|tier\s*1|test\s*series/i.test(topic) ? 'FULL_MOCK' : undefined);
      const { focus, questions } = await quizGeneratorService.generateWeakAreaQuiz(userId, {
        topic, subject, count, notebookId, syllabusNodeId, examId, isWeakAreaDrill, mode: mixerMode,
      });
      if (!questions.length) {
        return res.status(502).json({ error: 'Could not generate quiz questions. Please try again.' });
      }

      const source: QuizSource = notebookId ? 'notebook' : topic ? 'topic' : 'weak-areas';
      const title = notebookTitle || (topic ? topic : 'Weak Areas Practice');

      const attempt = await quizAttemptsService.createFromQuestions(userId, questions, {
        title,
        source,
        topic,
        notebookId,
        notebookTitle,
        mode,
      });

      res.json({
        attemptId: attempt.id,
        questions: quizAttemptsService.publicQuestions(attempt),
        durationMinutes: attempt.durationMinutes,
        title: attempt.title,
        topic: attempt.topic || focus,
        totalQuestions: attempt.totalQuestions,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /quiz/canonical-paper?exam=<text>&year=&shift=&paper=
   * "Practice a real paper" — retrieves actual historical questions verbatim from the verified
   * corpus (canonicalPyqRetrievalService, via quizGeneratorService.getCanonicalPaperQuiz). No LLM
   * call, no generation: every question is AUTHENTIC_PYQ with real provenance. A genuinely
   * different endpoint from getQuiz rather than a mode flag on it, because the two have almost
   * nothing in common — one generates, this one only retrieves and never invents a substitute.
   */
  public getCanonicalPaperQuiz = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const examQuery = (req.query.exam as string) || '';
      if (!examQuery) return res.status(400).json({ error: 'exam is required' });
      const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
      const shift = req.query.shift ? parseInt(String(req.query.shift), 10) : undefined;
      const paper = (req.query.paper as string) || undefined;

      const result = await quizGeneratorService.getCanonicalPaperQuiz({ examQuery, year, shift, paper });

      if (result.status === 'NOT_AVAILABLE') {
        return res.status(404).json({ error: 'NOT_AVAILABLE_IN_VERIFIED_CORPUS', diagnostics: result.diagnostics });
      }
      if (result.status === 'AMBIGUOUS_PAPER') {
        return res.status(409).json({ error: 'AMBIGUOUS_PAPER', papers: result.papers, diagnostics: result.diagnostics });
      }
      if (!result.questions.length) {
        return res.status(502).json({ error: 'A matching paper was found but had no usable MCQ-shaped questions.' });
      }

      const attempt = await quizAttemptsService.createFromQuestions(userId, result.questions, {
        title: result.focus || 'Real Previous Year Paper',
        source: 'pyq-paper',
        mode: 'exam',
      });

      res.json({
        attemptId: attempt.id,
        questions: quizAttemptsService.publicQuestions(attempt),
        durationMinutes: attempt.durationMinutes,
        title: attempt.title,
        totalQuestions: attempt.totalQuestions,
        isRealPaper: true,
        status: result.status, // CANONICAL_RETRIEVED | PARTIAL_CANONICAL_PAPER
        diagnostics: result.diagnostics,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /quiz/weak-areas?exam=<free text>
   * The structured counterpart to the dashboard's ad-hoc weak-topic guessing — real
   * examId/syllabusNodeId-scoped rows from UserStatsService.getWeakTopicsForExam, resolved
   * through the same canonical exam registry retrieval uses. A UI that wants a genuinely
   * exam-scoped weak-area drill (not a topic-string search) should call this, then pass the
   * chosen row's syllabusNodeId/examId straight into GET /quiz with mode=weak-area — no client-
   * side matching against a static catalog required.
   */
  public getWeakAreas = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const examQuery = (req.query.exam as string) || '';
      const examId = examQuery ? await detectExamId(examQuery).catch(() => null) : null;

      const weakAreas = await statsService.getWeakTopicsForExam(userId, examId);
      res.json({ examId, examResolved: Boolean(examId), weakAreas });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /quiz/drill-topics?exam=<free text or examId>
   * The exam's real drillable topics, ranked by how many genuine previous-year questions carry
   * them (template "Practice Set" rows excluded), with how many indexed reference-book questions
   * cover each. This is what the dashboard's drill cards are built from — nothing hand-typed.
   */
  public getDrillTopics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const examQuery = String(req.query.exam || '').trim();
      const FAMILY_DEFAULT: Record<string, string> = { ssc: 'SSC CGL' };
      const examId = examQuery
        ? (await detectExamId(examQuery).catch(() => null))
          || (FAMILY_DEFAULT[examQuery.toLowerCase()] ? await detectExamId(FAMILY_DEFAULT[examQuery.toLowerCase()]).catch(() => null) : null)
        : null;
      if (!examId) return res.json({ examId: null, examResolved: false, totalPyqs: 0, subjects: [] });

      const perSubject = Math.min(Math.max(parseInt(String(req.query.limit || '8'), 10) || 8, 1), 20);
      const index = await drillTopicsService.getIndex(examId);
      const subjects = [...index.subjects.values()]
        .sort((a, b) => b.pyqCount - a.pyqCount)
        .map((s) => ({
          subject: s.display,
          pyqCount: s.pyqCount,
          // A topic needs a real footprint in past papers to be called out; below that it's noise
          // from one-off tags.
          topics: index.topics
            .filter((t) => t.subject === s.display && t.pyqCount >= 10)
            .slice(0, perSubject)
            .map((t) => ({ topic: t.topic, pyqCount: t.pyqCount, referenceCount: t.referenceCount })),
        }))
        .filter((s) => s.topics.length > 0 || s.pyqCount > 0);

      res.json({ examId, examResolved: true, totalPyqs: index.totalPyqs, subjects });
    } catch (error) {
      next(error);
    }
  };

  /** GET /quiz/attempts -> the user's full generated-test history (summaries). */
  public listAttempts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const attempts = await quizAttemptsService.listAttempts(userId);
      res.json(attempts);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /quiz/attempts/:id -> one attempt. In-progress attempts are returned with the answer key
   * masked (integrity); a completed attempt returns the full key + explanations for the report.
   */
  public getAttempt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const attempt = await quizAttemptsService.getAttempt(userId, req.params.id);
      res.json(quizAttemptsService.maskForClient(attempt));
    } catch (error) {
      if (error instanceof QuizAttemptError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };

  /** POST /quiz/attempts/:id/submit -> server-side scoring + stats roll-up + feedback. */
  public submitAttempt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const answers = (req.body?.answers as Record<string, number>) || {};
      const timeSpentSeconds = Number(req.body?.timeSpentSeconds ?? req.body?.timeSpent ?? 0);
      const result = await quizAttemptsService.submitAttempt(userId, req.params.id, { answers, timeSpentSeconds });
      res.json(result);
    } catch (error) {
      if (error instanceof QuizAttemptError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };

  /**
   * POST /quiz/attempts/:id/remediation-drill  { diagnosticId }
   * Generates the 3-question drill for one diagnosis on the caller's own attempt, or returns the
   * one already generated (200 + status EXISTS). Ownership is enforced inside the claim
   * transaction: another user's attempt id is indistinguishable from a missing one (404).
   */
  public createRemediationDrill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const diagnosticId = req.body?.diagnosticId;
      if (typeof diagnosticId !== 'string' || !/^diag_[A-Za-z0-9_]{1,120}$/.test(diagnosticId)) {
        return res.status(400).json({ error: 'diagnosticId is required', code: 'INVALID_REQUEST' });
      }
      const outcome = await remediationDrillService.generateForDiagnostic(userId, req.params.id, diagnosticId);
      res.status(outcome.status === 'CREATED' ? 201 : 200).json(outcome);
    } catch (error) {
      if (error instanceof RemediationError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...(error.code === 'QUOTA_EXCEEDED' ? error.details : {}) });
      }
      next(error);
    }
  };

  /** GET /quiz/progress -> aggregate progress report + weak-section feedback. */
  public getProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const report = await quizAttemptsService.getProgressReport(userId);
      res.json(report);
    } catch (error) {
      next(error);
    }
  };



  /**
   * POST /quiz/mock-tests/:testId/start
   * Starts an attempt from a stored mock test's own question_bank questions — no generation — so
   * what the student answers is exactly the stored set, scored with the test's real marking and
   * timed with its real duration.
   */
  public startMockTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const found = await testsRepository.getTestWithQuestions(req.params.testId);
      if (!found || !found.test.isLive) return res.status(404).json({ error: 'Mock test not found' });

      const questions: StoredQuizQuestion[] = found.questions
        .filter(q => Array.isArray(q.options) && q.options.length >= 2
          && Number.isInteger(q.correctAnswerIndex) && q.correctAnswerIndex >= 0 && q.correctAnswerIndex < q.options.length)
        .map(q => {
          const extra = q as typeof q & { section?: string; examId?: string };
          return {
            id: q.id,
            text: q.text,
            // The SSC section is the clean grouping for the report's weak-section breakdown;
            // question_bank topic labels are inconsistent (some carry reference-book names).
            topic: extra.section || String(q.subject || '') || q.topic,
            options: q.options,
            correctAnswerIndex: q.correctAnswerIndex,
            explanation: q.explanation || '',
            examId: extra.examId,
          };
        });
      if (!questions.length) return res.status(404).json({ error: 'Mock test has no usable questions' });

      const mode: QuizMode = req.body?.mode === 'study' ? 'study' : 'exam';
      const attempt = await quizAttemptsService.createFromQuestions(userId, questions, {
        title: found.test.title,
        source: 'mock-test',
        mode,
        durationMinutes: found.test.durationMinutes,
        positiveMark: found.test.positiveMarks,
        negativeMark: found.test.negativeMarks,
      });

      res.json({
        attemptId: attempt.id,
        questions: quizAttemptsService.publicQuestions(attempt),
        durationMinutes: attempt.durationMinutes,
        title: attempt.title,
        totalQuestions: attempt.totalQuestions,
      });
    } catch (error) {
      next(error);
    }
  };
}
