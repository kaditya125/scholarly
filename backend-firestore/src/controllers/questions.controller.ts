import { Request, Response, NextFunction } from 'express';
import { QuestionsService } from '../services/questions.service';
import { Subject, Level } from '../types';

export class QuestionsController {
  private service = new QuestionsService();

  public getQuestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = req.query.subject as Subject | undefined;
      const level = req.query.level as Level | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const questions = await this.service.getQuestions(subject, level, limit);
      res.json(questions);
    } catch (error) {
      next(error);
    }
  };
}
