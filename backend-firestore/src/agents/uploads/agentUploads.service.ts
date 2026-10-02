import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

/**
 * Documents a student attaches to an Agent-mode chat turn (Phase 6, golden case 4: "Read this
 * uploaded PDF and create revision notes + flashcards + quiz").
 *
 * Ordinary chat flattens an attachment's text into the message, which works for a question but not
 * for a goal: the goal is capped at 2,000 characters, and the agent's tools need the document as a
 * document — pages they can quote and cite. So when a turn becomes an agent run, its attachments are
 * kept here instead: the extracted page text in Cloud Storage (no download token, like artifacts),
 * a small owner-scoped record in Firestore, and the run carries only their ids.
 */

export interface AgentUpload {
  uploadId: string;
  userId: string;
  name: string;
  mimeType: string;
  pageCount: number;
  chars: number;
  storagePath: string;
  createdAt: number;
}

export class AgentUploadError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'EMPTY' | 'TOO_LARGE', message: string) {
    super(message);
    this.name = 'AgentUploadError';
  }
}

const COLLECTION = 'agent_uploads';
/** Beyond this the text is not a study document but a book; the agent works from the first part. */
const MAX_CHARS = 2_000_000;

const db = () => require('../../config/firebase').db as FirebaseFirestore.Firestore;
function bucket() {
  const { firebaseApp } = require('../../config/firebase');
  const { env } = require('../../config/env');
  return env.FIREBASE_STORAGE_BUCKET ? firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET) : firebaseApp.storage().bucket();
}

const cache = new Map<string, { pages: Array<{ pageNumber: number; text: string }>; at: number }>();
const TTL_MS = 30 * 60 * 1000;

export class AgentUploadsService {
  async save(userId: string, doc: { name: string; mimeType: string; pages: Array<{ pageNumber?: number; text: string }> }): Promise<AgentUpload> {
    const pages = doc.pages.map((p, i) => ({ pageNumber: p.pageNumber ?? i + 1, text: String(p.text ?? '') }));
    const chars = pages.reduce((n, p) => n + p.text.length, 0);
    if (chars < 200) throw new AgentUploadError('EMPTY', `“${doc.name}” has no readable text.`);
    if (chars > MAX_CHARS) throw new AgentUploadError('TOO_LARGE', `“${doc.name}” is too long for one task; attach the chapter you want to study.`);
    const uploadId = randomUUID();
    const storagePath = `agent_uploads/${userId}/${uploadId}.json`;
    await bucket()
      .file(storagePath)
      .save(Buffer.from(JSON.stringify({ name: doc.name, pages })), {
        contentType: 'application/json',
        resumable: false,
        metadata: { metadata: { ownerUid: userId, uploadId } },
      });
    const record: AgentUpload = { uploadId, userId, name: doc.name.slice(0, 200), mimeType: doc.mimeType, pageCount: pages.length, chars, storagePath, createdAt: Date.now() };
    await db().collection(COLLECTION).doc(uploadId).set(record);
    cache.set(uploadId, { pages, at: Date.now() });
    logger.info('[agent] upload stored', { uploadId, userId, pages: pages.length, chars });
    return record;
  }

  /** Owner-only. Someone else's upload is reported as missing. */
  async read(userId: string, uploadId: string): Promise<{ upload: AgentUpload; pages: Array<{ pageNumber: number; text: string }> }> {
    const snap = await db().collection(COLLECTION).doc(uploadId).get();
    const upload = snap.exists ? (snap.data() as AgentUpload) : null;
    if (!upload || upload.userId !== userId) throw new AgentUploadError('NOT_FOUND', 'That document is not available.');
    const hit = cache.get(uploadId);
    if (hit && Date.now() - hit.at < TTL_MS) return { upload, pages: hit.pages };
    const [bytes] = await bucket().file(upload.storagePath).download();
    const pages = JSON.parse(Buffer.from(bytes).toString('utf8')).pages ?? [];
    cache.set(uploadId, { pages, at: Date.now() });
    return { upload, pages };
  }

  async deleteForUser(userId: string, uploadId: string): Promise<void> {
    const { upload } = await this.read(userId, uploadId);
    await bucket()
      .file(upload.storagePath)
      .delete()
      .catch((e: any) => logger.warn('[agent] upload file delete failed', { uploadId, error: String(e?.message ?? e) }));
    await db().collection(COLLECTION).doc(uploadId).delete();
    cache.delete(uploadId);
  }
}

let service: AgentUploadsService | null = null;
export function getAgentUploadsService(): AgentUploadsService {
  if (!service) service = new AgentUploadsService();
  return service;
}
