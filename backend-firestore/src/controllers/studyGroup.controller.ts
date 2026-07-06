import { Request, Response } from 'express';
import { studyGroupService } from '../services/studyGroup.service';

export class StudyGroupController {
  async getGroups(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const groups = await studyGroupService.getGroups(userId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async createGroup(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { name, description } = req.body;
      const group = await studyGroupService.createGroup(userId, name, description || '');
      res.status(201).json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { id } = req.params;
      const { targetUserId, role } = req.body;
      await studyGroupService.addMember(id, userId, targetUserId, role);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Unauthorized') return res.status(403).json({ error: 'Forbidden' });
      res.status(500).json({ error: error.message });
    }
  }
}

export const studyGroupController = new StudyGroupController();
