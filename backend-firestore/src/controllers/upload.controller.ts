import { Request, Response, NextFunction } from 'express';
import { attachmentService, AttachmentError } from '../services/attachment.service';

/**
 * UploadController — stores a message attachment and returns its metadata. Scoped to the
 * authenticated user (req.user.uid); the file arrives as multipart form field `file`.
 */
export class UploadController {
  public attachment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      if (!req.file) return res.status(400).json({ error: 'No file provided' });
      const uploaded = await attachmentService.upload(uid, req.file);
      res.status(201).json(uploaded);
    } catch (error) {
      if (error instanceof AttachmentError) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  };
}

export const uploadController = new UploadController();
