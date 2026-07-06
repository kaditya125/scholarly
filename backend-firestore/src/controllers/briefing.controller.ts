import { Request, Response } from 'express';
import { dailyBriefingService } from '../services/dailyBriefing.service';

export class BriefingController {
  public getTodayBriefing = async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const forceRegenerate = req.query.force === 'true';

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const briefing = await dailyBriefingService.getTodayBriefing(userId, forceRegenerate);
      return res.status(200).json(briefing);
    } catch (error: any) {
      console.error('Error fetching today briefing:', error);
      return res.status(500).json({ error: 'Failed to fetch briefing' });
    }
  };
}
