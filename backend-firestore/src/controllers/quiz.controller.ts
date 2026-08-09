import { Request, Response, NextFunction } from 'express';
import { quizGeneratorService } from '../services/tests/quizGenerator.service';
import { quizAttemptsService, QuizAttemptError } from '../services/tests/quizAttempts.service';
import { QuizMode, QuizSource } from '../types/quizAttempt.types';

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
}
