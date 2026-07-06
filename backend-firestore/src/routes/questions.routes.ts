import { Router } from 'express';
import { QuestionsController } from '../controllers/questions.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const controller = new QuestionsController();

router.use(requireAuth);

router.get('/', controller.getQuestions);

export default router;
