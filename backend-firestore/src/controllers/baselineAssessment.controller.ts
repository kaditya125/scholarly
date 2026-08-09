import { Request, Response, NextFunction } from 'express';
import { baselineAssessmentService } from '../services/baselineAssessment.service';
import { studentDigitalTwinService } from '../services/studentDigitalTwin.service';

export class BaselineAssessmentController {
  /**
   * GET /api/assessment/baseline/start/:userId
   * Starts or resumes the baseline assessment session.
   */
  public startOrResume = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const result = await baselineAssessmentService.startOrResumeAssessment(userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/assessment/baseline/next-batch/:userId
   * Evaluates current responses and returns next CAT question batch.
   */
  public getNextBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { batchIndex, responses } = req.body;
      const result = await baselineAssessmentService.getNextBatch(userId, batchIndex, responses);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/assessment/baseline/submit/:userId
   * Submits baseline assessment, generates Student Digital Twin, and returns report.
   */
  public submitAssessment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const payload = req.body;
      const result = await baselineAssessmentService.submitAssessment(userId, payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/assessment/baseline/digital-twin/:userId
   * Retrieves the current Student Digital Twin for a user.
   */
  public getDigitalTwin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const digitalTwin = await studentDigitalTwinService.getDigitalTwin(userId);
      res.json(digitalTwin || {});
    } catch (error) {
      next(error);
    }
  };
}

export const baselineAssessmentController = new BaselineAssessmentController();
