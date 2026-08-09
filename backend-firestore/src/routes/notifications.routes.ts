import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new NotificationsController();

router.use(requireAuth);

router.get('/', (req, res) => controller.getNotifications(req, res));
router.post('/mark-all-read', (req, res) => controller.markAllAsRead(req, res));
router.post('/:id/read', (req, res) => controller.markAsRead(req, res));
router.post('/:id/archive', (req, res) => controller.archive(req, res));
router.put('/preferences', (req, res) => controller.updatePreferences(req, res));

export default router;
