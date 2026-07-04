import { UserRecord } from 'firebase-admin/auth';
import { File } from 'multer';

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord | { uid: string; [key: string]: any };
      file?: File;
    }
  }
}
