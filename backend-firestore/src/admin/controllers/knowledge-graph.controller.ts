import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Knowledge Graph — real platform-wide node/edge counts via collectionGroup
 * aggregation over `kg_nodes`/`kg_edges`, plus a bounded node sample.
 */
export class KnowledgeGraphController {
  getNodes = async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
      res.json(await adminAggregatesService.getKnowledgeGraph(limit));
    } catch (error) {
      logger.error('admin.knowledge-graph.getNodes failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load knowledge graph' });
    }
  };
}
