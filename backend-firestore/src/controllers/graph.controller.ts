import { Request, Response } from 'express';
import { GraphService } from '../services/graph.service';

export class GraphController {
  private graphService = new GraphService();

  getGraph = async (req: Request, res: Response) => {
    try {
      const { notebookId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const graph = await this.graphService.getGraph(notebookId, limit);
      res.status(200).json(graph);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  searchNodes = async (req: Request, res: Response) => {
    try {
      const { notebookId } = req.params;
      const { q } = req.query;
      const nodes = await this.graphService.searchNodes(notebookId, q as string);
      res.status(200).json(nodes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  getStats = async (req: Request, res: Response) => {
    try {
      const { notebookId } = req.params;
      const stats = await this.graphService.getGraphStats(notebookId);
      res.status(200).json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  getLearningPath = async (req: Request, res: Response) => {
    try {
      const { notebookId, nodeId } = req.params;
      const path = await this.graphService.generateLearningPath(notebookId, nodeId);
      res.status(200).json(path);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}
