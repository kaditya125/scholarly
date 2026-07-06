import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';

const router = Router();
const adminCtrl = new AdminController();

// System Health & AI Metrics
router.get('/metrics', adminCtrl.getMetrics);

// Cost Analytics
router.get('/costs', adminCtrl.getCosts);

// AI Improvement Insights
router.get('/insights', adminCtrl.getInsights);

// Alerts
router.get('/alerts', adminCtrl.getAlerts);
router.post('/alerts/:alertId/resolve', adminCtrl.resolveAlert);

// Feedback Summary
router.get('/feedback', adminCtrl.getFeedback);

// Feature Flags & Prompts
router.get('/config', adminCtrl.getConfig);
router.put('/config/flags', adminCtrl.updateFlags);
router.put('/config/prompts/:promptName/activate', adminCtrl.activatePromptVersion);

// Educational Metrics
router.get('/educational', adminCtrl.getEducationalMetrics);

// System Logs
router.get('/logs', adminCtrl.getLogs);

export default router;
