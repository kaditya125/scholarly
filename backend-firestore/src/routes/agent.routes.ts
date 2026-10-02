import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';
import { requireAuth } from '../middlewares/auth';

/**
 * Agent mode API. All routes require a verified token and answer 404 while AGENT_MODE_ENABLED is
 * off (checked in the controller, so the flag can flip without a restart of the router).
 */
const router = Router();
const controller = new AgentController();

router.use(requireAuth);

router.get('/workflows', controller.listWorkflows);
router.get('/tools', controller.listTools);
router.get('/runs', controller.listRuns);
router.post('/runs', controller.startRun);
router.get('/runs/:runId', controller.getRun);
router.get('/runs/:runId/events', controller.streamEvents);
router.post('/runs/:runId/cancel', controller.cancelRun);

router.get('/artifacts', controller.listArtifacts);
router.get('/artifacts/:artifactId', controller.getArtifact);
router.get('/artifacts/:artifactId/file', controller.getArtifactFile);

export default router;
