import { Request, Response, NextFunction } from 'express';
import { searchService, SEARCH_HIT_TYPES, type SearchHitType } from '../services/search/search.service';

/**
 * GET /api/search?q=&types=chapter,chat&limit=   — lexical search (catalog chapters + own content)
 * GET /api/search/semantic?q=&limit=             — semantic search over curriculum passages
 */
export class SearchController {
  public search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const types = typeof req.query.types === 'string'
        ? req.query.types.split(',').map((t) => t.trim()).filter((t): t is SearchHitType => (SEARCH_HIT_TYPES as string[]).includes(t))
        : undefined;
      const limit = Number(req.query.limit) || undefined;
      const results = await searchService.search(userId, q, { types, limit });
      res.json({ results });
    } catch (error) {
      next(error);
    }
  };

  public semantic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 8);
      const results = await searchService.semantic(q, limit);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  };
}
