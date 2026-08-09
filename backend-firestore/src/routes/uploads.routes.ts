import { Router } from 'express';
import multer from 'multer';
import { uploadController } from '../controllers/upload.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// Message attachments are held in memory then written to Storage. 25MB cap per file.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(requireAuth);

router.post('/attachment', upload.single('file'), uploadController.attachment);

export default router;
