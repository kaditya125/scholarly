import { Request, Response, NextFunction } from 'express';
import { testSeriesService } from '../services/tests/testSeries.service';
import { adaptiveTestService } from '../services/tests/adaptiveTest.service';
import { resultAnalysisService } from '../services/tests/resultAnalysis.service';
import { Subject, Difficulty } from '../types';
import { usageService } from '../services/usage.service';

export class TestsController {
  public getFeaturedSeries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const series = await testSeriesService.getFeaturedTestSeries();
      res.json(series);
    } catch (error) {
      next(error);
    }
  };

  public getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category } = req.query;
      const series = await testSeriesService.getTestSeriesByCategory(category as string || 'SSC');
      res.json(series);
    } catch (error) {
      next(error);
    }
  };

  public getIncompleteAttempts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const attempts = await testSeriesService.getIncompleteAttempts(userId);
      res.json(attempts);
    } catch (error) {
      next(error);
    }
  };

  public generateAdaptiveTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { subject, topic, difficulty, questionCount, timeLimitMins } = req.body;

      // ── Server-Side Quota Enforcement ──
      try {
        await usageService.consumeQuota(userId, 'mockTestsGenerated', 1);
      } catch (err: any) {
        if (err.code === 'QUOTA_EXHAUSTED') {
          return res.status(403).json({
            code: 'QUOTA_EXHAUSTED',
            feature: 'mockTests',
            error: err.message,
            used: err.used,
            limit: err.limit,
            remaining: err.remaining,
            resetsAt: err.resetsAt,
            plan: err.plan,
          });
        }
        throw err;
      }

      const test = await adaptiveTestService.generateAdaptiveTest(
          userId, 
          subject as Subject, 
          topic, 
          difficulty as Difficulty, 
          questionCount, 
          timeLimitMins
      );
      res.json(test);
    } catch (error) {
      next(error);
    }
  };

  public submitTestAttempt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { attemptId } = req.params;
      /*
       * The uid comes from the VERIFIED token, never from the request body or a path parameter.
       * The route cannot use enforceSelf here (its parameter is an attempt id, not a user id), so
       * ownership is enforced inside processSubmission against this uid — see the note there.
       */
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      // The attempt's answers are expected to already be persisted; this grades and finalises it.
      const result = await resultAnalysisService.processSubmission(attemptId, userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
