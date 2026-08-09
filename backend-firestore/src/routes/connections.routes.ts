import { Router } from 'express';
import { connectionController } from '../controllers/connection.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);

// ─── Directory ────────────────────────────────────────────────────────────────
router.post('/sync', connectionController.sync);

// ─── Reads ────────────────────────────────────────────────────────────────────
router.get('/', connectionController.list);
router.get('/requests', connectionController.requests);
router.get('/suggestions', connectionController.suggestions);
router.get('/search', connectionController.search);

// ─── Request lifecycle ──────────────────────────────────────────────────────────
router.post('/requests', connectionController.sendRequest);
router.post('/requests/:otherId/accept', connectionController.accept);
router.post('/requests/:otherId/decline', connectionController.decline);
router.delete('/requests/:otherId', connectionController.cancelRequest);

// ─── Follow ─────────────────────────────────────────────────────────────────
router.post('/follow', connectionController.follow);
router.delete('/follow/:otherId', connectionController.unfollow);

// ─── Block ──────────────────────────────────────────────────────────────────
router.post('/block', connectionController.block);
router.delete('/block/:otherId', connectionController.unblock);

// ─── Connection removal (generic single-segment param — MUST stay last) ──────────
router.delete('/:otherId', connectionController.remove);

export default router;
