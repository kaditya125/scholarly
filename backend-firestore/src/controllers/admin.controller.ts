import { Request, Response, NextFunction } from 'express';
import { TelemetryService } from '../services/telemetry.service';
import { ConfigService } from '../services/config.service';
import { FeedbackService } from '../services/feedback.service';
import { logger } from '../utils/logger';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * AdminController — Backend for the Admin Analytics Dashboard
 * 
 * Protected endpoints providing:
 * - System Health & Provider Status
 * - AI Metrics (Latency, Tokens, Cost, Verification)
 * - RAG Metrics (Chunk count, Cache hit ratio, Pinecone latency)
 * - Educational Metrics (Weak topics, Quizzes, Study streaks)
 * - Cost Analytics (Per-provider, per-user, per-notebook)
 * - AI Improvement Insights (Hallucination topics, Failed quizzes, Expensive prompts)
 * - Feature Flags & Prompt Management
 * - Alerts Dashboard
 */
export class AdminController {
  private telemetryService = new TelemetryService();
  private configService = new ConfigService();
  private feedbackService = new FeedbackService();
  private db = getFirestore();

  // ─── GET /api/admin/metrics ─────────────────────────────────────────
  public getMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await this.telemetryService.getSystemHealth();
      res.json(health);
    } catch (error) {
      logger.error('Failed to fetch admin metrics', { error });
      next(error);
    }
  };

  // ─── GET /api/admin/costs ───────────────────────────────────────────
  public getCosts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const costs = await this.telemetryService.getCostAnalytics(days);
      res.json(costs);
    } catch (error) {
      logger.error('Failed to fetch cost analytics', { error });
      next(error);
    }
  };

  // ─── GET /api/admin/insights ────────────────────────────────────────
  public getInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const insights = await this.telemetryService.getAIImprovementInsights();
      res.json(insights);
    } catch (error) {
      logger.error('Failed to fetch AI improvement insights', { error });
      next(error);
    }
  };

  // ─── GET /api/admin/alerts ──────────────────────────────────────────
  public getAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alerts = await this.telemetryService.getActiveAlerts();
      res.json(alerts);
    } catch (error) {
      next(error);
    }
  };

  // ─── POST /api/admin/alerts/:alertId/resolve ────────────────────────
  public resolveAlert = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.telemetryService.resolveAlert(req.params.alertId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ─── GET /api/admin/feedback ────────────────────────────────────────
  public getFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const summary = await this.feedbackService.getFeedbackSummary(days);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };

  // ─── GET /api/admin/config ──────────────────────────────────────────
  public getConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const flags = await this.configService.getFeatureFlags();
      
      // List prompt versions
      const promptsSnap = await this.db.collection('system_config')
        .doc('prompts')
        .collection('teacher')
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get();
      
      const promptVersions = promptsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        content: undefined, // Don't send full prompt content in listing
      }));

      res.json({ featureFlags: flags, promptVersions });
    } catch (error) {
      next(error);
    }
  };

  // ─── PUT /api/admin/config/flags ────────────────────────────────────
  public updateFlags = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { flags } = req.body;
      if (!flags || typeof flags !== 'object') {
        return res.status(400).json({ error: 'Must provide flags object' });
      }

      await this.db.collection('system_config').doc('flags').set(
        { featureFlags: flags, updatedAt: Date.now() },
        { merge: true }
      );

      logger.info('Feature flags updated by admin', { flags });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ─── PUT /api/admin/config/prompts/:promptName/activate ─────────────
  public activatePromptVersion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { promptName } = req.params;
      const { versionId } = req.body;

      if (!promptName || !versionId) {
        return res.status(400).json({ error: 'Must provide promptName and versionId' });
      }

      // Deactivate all versions of this prompt
      const allVersions = await this.db.collection('system_config')
        .doc('prompts')
        .collection(promptName)
        .where('active', '==', true)
        .get();
      
      const batch = this.db.batch();
      allVersions.docs.forEach(doc => {
        batch.update(doc.ref, { active: false });
      });

      // Activate the requested version
      const targetRef = this.db.collection('system_config')
        .doc('prompts')
        .collection(promptName)
        .doc(versionId);
      batch.update(targetRef, { active: true, updatedAt: Date.now() });

      await batch.commit();

      logger.info(`Prompt ${promptName} activated version ${versionId}`);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ─── GET /api/admin/educational ─────────────────────────────────────
  public getEducationalMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [statsSnap, plannerSnap] = await Promise.all([
        this.db.collection('user_stats').limit(100).get(),
        this.db.collection('timetables').limit(100).get(),
      ]);

      const stats = statsSnap.docs.map(d => d.data());
      
      // Aggregate weak topics across all users
      const weakTopicCounts: Record<string, number> = {};
      const strongTopicCounts: Record<string, number> = {};
      let totalStreak = 0;
      let totalReadiness = 0;

      for (const s of stats) {
        if (s.weakTopics) {
          for (const t of s.weakTopics) {
            weakTopicCounts[t] = (weakTopicCounts[t] || 0) + 1;
          }
        }
        if (s.strongTopics) {
          for (const t of s.strongTopics) {
            strongTopicCounts[t] = (strongTopicCounts[t] || 0) + 1;
          }
        }
        if (s.gamification?.studyStreakDays) {
          totalStreak += s.gamification.studyStreakDays;
        }
        if (s.examReadiness?.probabilityOfClearing) {
          totalReadiness += s.examReadiness.probabilityOfClearing;
        }
      }

      res.json({
        totalStudents: stats.length,
        avgStudyStreak: stats.length > 0 ? parseFloat((totalStreak / stats.length).toFixed(1)) : 0,
        avgExamReadiness: stats.length > 0 ? parseFloat((totalReadiness / stats.length).toFixed(1)) : 0,
        activePlanners: plannerSnap.size,
        
        topWeakTopics: Object.entries(weakTopicCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([topic, count]) => ({ topic, count })),
        
        topStrongTopics: Object.entries(strongTopicCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([topic, count]) => ({ topic, count })),
      });
    } catch (error) {
      next(error);
    }
  };

  // ─── GET /api/admin/logs ────────────────────────────────────────────
  public getLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const snap = await this.db.collection('system_logs')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      
      res.json(snap.docs.map(d => d.data()));
    } catch (error) {
      next(error);
    }
  };
}
