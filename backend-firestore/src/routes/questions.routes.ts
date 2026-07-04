import { Router } from 'express';
import { QuestionsController } from '../controllers/questions.controller';

const router = Router();
const controller = new QuestionsController();

router.get('/', controller.getQuestions);

export default router;
