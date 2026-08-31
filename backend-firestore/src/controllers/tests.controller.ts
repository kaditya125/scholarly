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
      // In a real scenario, the attempt updates would be pushed first, then submit is called.
      // Assuming attempt is already saved in DB with answers.
      const result = await resultAnalysisService.processSubmission(attemptId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
