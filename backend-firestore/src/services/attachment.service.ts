import { v4 as uuidv4 } from 'uuid';
import { firebaseApp } from '../config/firebase';
import { Attachment } from '../types/attachment.types';

/** Thrown for expected, user-facing failures; carries an HTTP status for the controller. */
export class AttachmentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

const MAX_ATTACHMENTS = 10;

/** Strips any path and unsafe characters from an uploaded filename. */
function sanitizeFilename(name: string): string {
  const base = (name || 'file').split(/[\\/]/).pop() || 'file';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

function kindFor(contentType: string): 'image' | 'file' {
  return (contentType || '').startsWith('image/') ? 'image' : 'file';
}

/**
 * Uploads message attachments to Firebase Storage and validates attachments a client attaches to a
 * message. Files live under a `public/` prefix (readable via the Firebase download URL, matching how
 * podcasts are served); paths include the uploader's uid and an unguessable id.
 */
export class AttachmentService {
  private bucket() {
    return firebaseApp.storage().bucket();
  }

  async upload(uid: string, file: Express.Multer.File): Promise<Attachment> {
    if (!file || !file.buffer) throw new AttachmentError(400, 'No file provided');

    const bucket = this.bucket();
    const id = uuidv4();
    const safeName = sanitizeFilename(file.originalname);
    const storagePath = `public/attachments/${uid}/${id}/${safeName}`;
    const contentType = file.mimetype || 'application/octet-stream';

    await bucket.file(storagePath).save(file.buffer, {
      contentType,
      metadata: { metadata: { uploadedBy: uid } },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      storagePath
    )}?alt=media`;

    return {
      id,
      name: file.originalname || safeName,
      url,
      contentType,
      size: file.size || 0,
      kind: kindFor(contentType),
    };
  }

  /**
   * Normalizes + validates attachments supplied by a client on a message. Each must reference a file
   * in our own storage bucket (guards against embedding arbitrary external URLs).
   */
  sanitizeForMessage(attachments: unknown): Attachment[] {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new AttachmentError(400, `Too many attachments (max ${MAX_ATTACHMENTS})`);
    }

    const hostPrefix = `https://firebasestorage.googleapis.com/v0/b/${this.bucket().name}/o/`;

    return attachments.map((a: any) => {
      if (!a || typeof a.url !== 'string' || !a.url.startsWith(hostPrefix)) {
        throw new AttachmentError(400, 'Invalid attachment');
      }
      const contentType = typeof a.contentType === 'string' ? a.contentType : 'application/octet-stream';
      return {
        id: typeof a.id === 'string' ? a.id : uuidv4(),
        name: typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 300) : 'file',
        url: a.url,
        contentType,
        size: typeof a.size === 'number' && a.size >= 0 ? a.size : 0,
        kind: kindFor(contentType),
      };
    });
  }
}

export const attachmentService = new AttachmentService();
