import { Request, Response, NextFunction } from 'express';
import { quizGeneratorService } from '../services/tests/quizGenerator.service';
import { quizAttemptsService, QuizAttemptError } from '../services/tests/quizAttempts.service';
import { QuizMode, QuizSource, PedagogicalDiagnostic, StoredQuizQuestion } from '../types/quizAttempt.types';
import { remediationDrillService } from '../services/pedagogy/remediationDrill.service';
import { testsRepository } from '../repositories/tests.repository';

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
      const notebookId = (req.query.notebookId as string) || (req.body?.notebookId as string) || undefined;
      const notebookTitle = (req.query.notebookTitle as string) || (req.body?.notebookTitle as string) || undefined;
      const mode = ((req.query.mode as string) || (req.body?.mode as string) || 'exam') as QuizMode;
      const count = req.query.count ? parseInt(String(req.query.count), 10) : (req.body?.count as number | undefined);

      const { focus, questions } = await quizGeneratorService.generateWeakAreaQuiz(userId, { topic, count, notebookId });
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
   * POST /quiz/remediation-drill
   * Generates a validated 3-question remediation micro-drill for a diagnosed prerequisite gap
   * and persists it as an in-progress attempt the student can take immediately.
   *
   * Takes the diagnostic object directly in the request body rather than looking one up from a
   * stored attempt: the automatic root-cause-diagnosis-on-submit pipeline (conceptGraphService /
   * quizAttempts.service pedagogicalDiagnostics) is separate, in-progress work not yet on this
   * branch. This endpoint is what makes RemediationDrillService reachable over HTTP today — any
   * caller that already has a PedagogicalDiagnostic (from that pipeline once it lands, or
   * constructed directly) can invoke it now instead of the service being dead code.
   */
  public generateRemediationDrill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const diagnostic = req.body?.diagnostic as PedagogicalDiagnostic | undefined;
      if (!diagnostic || !diagnostic.rootCauseTitle || !diagnostic.rootCauseChapter || !diagnostic.diagnosticMessage) {
        return res.status(400).json({
          error: 'diagnostic (with rootCauseTitle, rootCauseChapter, diagnosticMessage) is required',
        });
      }

      const drill = await remediationDrillService.generateDrillForDiagnostic(userId, diagnostic);
      if (!drill) {
        return res.status(502).json({ error: 'Could not generate a verified remediation drill for this concept. Please try again.' });
      }

      res.json(drill);
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
