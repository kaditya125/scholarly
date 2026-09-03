import { Router } from 'express';
import { requireAdmin, requireSuperAdmin, requireFinanceAdmin } from '../middleware/rbac.middleware';
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
import { StudentsController } from '../controllers/students.controller';
import { quotasController } from '../controllers/quotas.controller';
import { performanceController } from '../controllers/performance.controller';
import { engagementController } from '../controllers/engagement.controller';
import { revenueController } from '../controllers/revenue.controller';
import { paymentsController } from '../controllers/payments.controller';
import { subscriptionsController } from '../controllers/subscriptions.controller';
import { SecurityController } from '../controllers/security.controller';
import { LogsController } from '../controllers/logs.controller';
import { NotificationsController } from '../controllers/notifications.controller';
import { BackupsController } from '../controllers/backups.controller';
import { SettingsController } from '../controllers/settings.controller';
import { FeatureFlagsController } from '../controllers/feature-flags.controller';
import { teacherVerificationController as teacherVerificationCtrl } from '../controllers/teacher-verification.controller';
import { payoutController } from '../controllers/payout.controller';

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
const studentsCtrl = new StudentsController();
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

/**
 * Student directory. Supersedes `/users` for student administration: that route calls
 * auth.listUsers(), which caps at 1000 accounts and supports no search, filter or sort.
 * `/users` is left in place because the existing admin-dashboard app still calls it.
 *
 * Inherits `router.use(requireAdmin)` above — the token signature and role claim are
 * verified before this handler runs.
 */
router.get('/students', studentsCtrl.list);
router.get('/students/stats', studentsCtrl.stats);
// AFTER /students/stats: Express matches in order, so a `:id` route declared first would
// swallow "stats" as an id.
router.get('/students/:id', studentsCtrl.detail);

/*
 * Quota and entitlement reporting. Placed after the /students routes so the more specific
 * paths above are matched first - '/quotas' cannot collide with '/students/:id', but keeping
 * the ordering explicit means a future '/quotas/:something' will not either.
 */
router.get('/quotas', quotasController.overview);

/*
 * Student performance and engagement reporting. Same placement rule as /quotas above -
 * after /students so nothing collides with '/students/:id'.
 */
router.get('/performance', performanceController.overview);
router.get('/engagement', engagementController.overview);

/*
 * Revenue and payments. requireFinanceAdmin narrows to super_admin/admin - moderator has
 * requireAdmin's broader access to everything above but not to financial data, matching
 * adminNav.ts's minRole on these two entries.
 */
router.get('/revenue', requireFinanceAdmin, revenueController.overview);
router.get('/payments', requireFinanceAdmin, paymentsController.list);
router.get('/subscriptions', requireFinanceAdmin, subscriptionsController.overview);

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

// Teacher verification (Phase 3A).
//
// Inherits `router.use(requireAdmin)` above, so both routes require super_admin | admin |
// moderator. teacherStatus is writable through this surface ONLY — the teacher-facing
// /api/teacher/* endpoints never accept it, and the Firestore rules close client writes to
// both teacherProfiles and teacherVerificationEvents entirely.
// Literal path — declared before the :uid routes below purely for readability; Express does
// not confuse a 2-segment path (/teacher/queue) with the 3-segment :uid routes regardless of
// order, so this only matters if a future 2-segment /teacher/:uid route is ever added.
router.get('/teacher/queue', teacherVerificationCtrl.listQueue);
router.get('/teacher/:uid/verification', teacherVerificationCtrl.getVerification);
router.post('/teacher/:uid/status', teacherVerificationCtrl.setStatus);

// Manual payouts (Phase 3J-lite). See payout.controller.ts — this records a payout the admin
// already made outside the platform; it never moves money itself.
router.get('/payouts/queue', payoutController.listQueue);
router.post('/payouts', payoutController.record);

// Admin Controllers will be imported and mounted here in later phases

export default router;
