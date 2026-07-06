import { Request, Response, NextFunction } from 'express';
import { notebookService } from '../services/notebook.service';

/**
 * Ensures the authenticated user can access the notebook referenced by the given
 * route param (default `:notebookId`). Reuses `notebookService.getNotebookById`,
 * which enforces owner / editor / viewer membership (and shared-link access).
 *
 * MUST be used after `requireAuth`. Returns 403 when the user lacks access.
 */
export const requireNotebookAccess = (paramName: string = 'notebookId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const notebookId = req.params[paramName];
      if (!notebookId) return res.status(400).json({ error: 'notebookId is required' });

      // Throws 'Forbidden or Not Found' when the user has no access.
      const notebook = await notebookService.getNotebookById(notebookId, userId);
      if (!notebook) return res.status(403).json({ error: 'Forbidden' });

      next();
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  };
};
