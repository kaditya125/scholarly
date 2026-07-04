import { Router } from 'express';
import { RoomsController } from '../controllers/rooms.controller';

const router = Router();
const controller = new RoomsController();

router.get('/', controller.getRooms);

export default router;
