import { Request, Response } from 'express';
import { adminAggregatesService } from '../services/admin-aggregates.service';
import { logger } from '../../utils/logger';

/**
 * Vector DB — real Pinecone index statistics (namespaces, vector counts,
 * dimension, index fullness) via describeIndexStats().
 */
export class VectorDBController {
  getNamespaces = async (_req: Request, res: Response) => {
    try {
      res.json(await adminAggregatesService.getVectorDBStats());
    } catch (error) {
      logger.error('admin.vector-db.getNamespaces failed', { error: (error as Error).message });
      res.status(502).json({ error: 'Failed to reach Pinecone', detail: (error as Error).message });
    }
  };

  queryPinecone = async (req: Request, res: Response) => {
    try {
      const { query, namespace, topK } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      const results = await adminAggregatesService.queryPinecone(query, namespace, topK);
      res.json(results);
    } catch (error) {
      logger.error('admin.vector-db.queryPinecone failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to query Pinecone' });
    }
  };

  deleteNamespace = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await adminAggregatesService.deleteNamespace(id);
      res.json({ success: true });
    } catch (error) {
      logger.error('admin.vector-db.deleteNamespace failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to delete namespace' });
    }
  };
}
