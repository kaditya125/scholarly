import { Request, Response, NextFunction } from 'express';
import { TestsService } from '../services/tests.service';
import { Subject, Difficulty } from '../types';

export class TestsController {
  private service = new TestsService();

  public getTests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = req.query.subject as Subject | undefined;
      const difficulty = req.query.difficulty as Difficulty | undefined;
      const maxMins = req.query.maxMins ? parseInt(req.query.maxMins as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const tests = await this.service.getTests(subject, difficulty, maxMins, limit);
      res.json(tests);
    } catch (error) {
      next(error);
    }
  };
}
