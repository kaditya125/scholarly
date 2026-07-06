import { Router } from 'express';
import { RoomsController } from '../controllers/rooms.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new RoomsController();

router.use(requireAuth);

router.get('/', controller.getRooms);

export default router;
