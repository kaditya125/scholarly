import { Router } from 'express';
import { TestsController } from '../controllers/tests.controller';

const router = Router();
const controller = new TestsController();

router.get('/', controller.getTests);

export default router;
