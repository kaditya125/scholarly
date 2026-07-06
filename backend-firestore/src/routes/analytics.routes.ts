import { Router } from 'express';
import { getCostAnalytics } from '../controllers/analytics.controller';

const router = Router();

router.get('/costs', getCostAnalytics);

export default router;
