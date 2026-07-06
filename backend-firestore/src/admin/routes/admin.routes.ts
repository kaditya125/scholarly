import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middleware/rbac.middleware';
import { AIMonitoringController } from '../controllers/ai-monitoring.controller';
import { SystemHealthController } from '../controllers/system-health.controller';
import { ContinuousEvalController } from '../controllers/continuous-eval.controller';
import { CurriculumController } from '../controllers/curriculum.controller';
import { KnowledgeGraphController } from '../controllers/knowledge-graph.controller';
import { VectorDBController } from '../controllers/vector-db.controller';
import { PromptStudioController } from '../controllers/prompt-studio.controller';
import { LearningAssetsController } from '../controllers/learning-assets.controller';
import { NotebooksController } from '../controllers/notebooks.controller';
import { UsersController } from '../controllers/users.controller';
import { SecurityController } from '../controllers/security.controller';
import { LogsController } from '../controllers/logs.controller';
import { NotificationsController } from '../controllers/notifications.controller';
import { BackupsController } from '../controllers/backups.controller';
import { SettingsController } from '../controllers/settings.controller';
import { FeatureFlagsController } from '../controllers/feature-flags.controller';

const router = Router();
const aiMonitoringCtrl = new AIMonitoringController();
const systemHealthCtrl = new SystemHealthController();
const continuousEvalCtrl = new ContinuousEvalController();
const curriculumCtrl = new CurriculumController();
const knowledgeGraphCtrl = new KnowledgeGraphController();
const vectorDbCtrl = new VectorDBController();
const promptStudioCtrl = new PromptStudioController();
const learningAssetsCtrl = new LearningAssetsController();
const notebooksCtrl = new NotebooksController();
const usersCtrl = new UsersController();
const securityCtrl = new SecurityController();
const logsCtrl = new LogsController();
const notificationsCtrl = new NotificationsController();
const backupsCtrl = new BackupsController();
const settingsCtrl = new SettingsController();
const featureFlagsCtrl = new FeatureFlagsController();

// We will mount all administrative endpoints here.
// Each controller will use the existing backend services for business logic.

router.use(requireAdmin);

// Health Check
router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// AI Monitoring & Costs
router.get('/metrics/ai', aiMonitoringCtrl.getMetrics);
router.get('/metrics/costs', aiMonitoringCtrl.getCostAnalytics);

// System Health
router.get('/system/health', systemHealthCtrl.getHealth);

// Continuous Evaluation
router.get('/evaluation', continuousEvalCtrl.getEvaluationMetrics);

// Curriculum Ingestion
router.get('/curriculum/jobs', curriculumCtrl.getJobs);

// Knowledge Graph
router.get('/knowledge-graph/nodes', knowledgeGraphCtrl.getNodes);

// Vector DB
router.get('/vector-db/namespaces', vectorDbCtrl.getNamespaces);
router.post('/vector-db/query', vectorDbCtrl.queryPinecone);
router.delete('/vector-db/namespaces/:id', vectorDbCtrl.deleteNamespace);

// Prompt Studio
router.get('/prompts', promptStudioCtrl.getPrompts);

// Learning Assets
router.get('/assets', learningAssetsCtrl.getAssets);

// Notebooks
router.get('/notebooks', notebooksCtrl.getNotebooks);
router.get('/notebooks/:id', notebooksCtrl.getDetail);
router.patch('/notebooks/:id', notebooksCtrl.updateNotebook);
router.delete('/notebooks/:id', requireSuperAdmin, notebooksCtrl.deleteNotebook);

// Feature Flags
router.get('/feature-flags', featureFlagsCtrl.getFlags);
router.patch('/feature-flags/:name', featureFlagsCtrl.updateFlag);

// Users
router.get('/users', usersCtrl.getUsers);

// Security
router.get('/security/threats', securityCtrl.getThreats);
router.post('/security/alerts/:id/resolve', securityCtrl.resolveAlert);

// Logs
router.get('/logs', logsCtrl.getLogs);

// Notifications
router.get('/notifications', notificationsCtrl.getNotifications);

// Backups
router.get('/backups', backupsCtrl.getBackups);

// Settings
router.get('/settings', settingsCtrl.getSettings);

// Admin Controllers will be imported and mounted here in later phases

export default router;
