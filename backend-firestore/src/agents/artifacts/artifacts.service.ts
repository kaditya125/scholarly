import { createHash, randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import {
  ArtifactDoc,
  ArtifactVersion,
  DocumentSpec,
  MAX_SPEC_CHARS,
  STRUCTURED_SCHEMAS,
  StructuredKind,
  documentSpecSchema,
} from './artifact.types';
import { renderDocumentPdf } from './documentPdf.renderer';

/**
 * Artifact storage (Phase 3): the structured spec and its version history live in Firestore,
 * the rendered files in Cloud Storage under `artifacts/{uid}/{artifactId}/v{n}.pdf`.
 *
 * Security model, deliberately different from the upload pipeline's: no public URL is ever minted.
 * ContentStorageService attaches a `firebaseStorageDownloadTokens` link to uploads, which is a
 * permanent public URL for anyone who has it. An artifact can contain a student's own work, so
 * bytes are only ever served by the API after an ownership check (`readFile` below). Storage paths
 * never leave the server.
 */

export class ArtifactError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_SPEC' | 'TOO_LARGE' | 'RENDER_FAILED', message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ArtifactError';
  }
}

export interface CreateDocumentInput {
  userId: string;
  spec: unknown;
  runId?: string;
  provenance?: ArtifactDoc['provenance'];
}

const COLLECTION = 'artifacts';
const KIND_NAMES: Record<StructuredKind, string> = { flashcards: 'flashcard deck', quiz: 'quiz', report: 'analysis', studyplan: 'plan' };
/** A generated study document that needs more than this is a bug, not a big document. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

function db() {
  // Lazy, like the run store: importing the agent runtime must not initialise Firebase.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../config/firebase').db as FirebaseFirestore.Firestore;
}

function bucket() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { firebaseApp } = require('../../config/firebase');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { env } = require('../../config/env');
  return env.FIREBASE_STORAGE_BUCKET ? firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET) : firebaseApp.storage().bucket();
}

export const storagePathFor = (userId: string, artifactId: string, version: number) =>
  `artifacts/${userId}/${artifactId}/v${version}.pdf`;

export class ArtifactsService {
  /** Validates the spec, renders it, stores the file, then writes the record. */
  async createDocument(input: CreateDocumentInput): Promise<ArtifactDoc> {
    const parsed = documentSpecSchema.safeParse(input.spec);
    if (!parsed.success) {
      const detail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new ArtifactError('INVALID_SPEC', `The document structure is not valid: ${detail}`, 422);
    }
    const spec: DocumentSpec = parsed.data;
    if (JSON.stringify(spec).length > MAX_SPEC_CHARS) {
      throw new ArtifactError('TOO_LARGE', 'That document is too large to generate in one go.', 422);
    }

    const artifactId = randomUUID();
    const version = await this.render(input.userId, artifactId, spec, 1);

    const now = Date.now();
    const doc: ArtifactDoc = {
      artifactId,
      userId: input.userId,
      runId: input.runId,
      kind: 'document',
      title: spec.title,
      status: 'ready',
      provenance: input.provenance ?? 'GENERATED',
      spec,
      currentVersion: version.version,
      versions: [version],
      createdAt: now,
      updatedAt: now,
    };
    await db().collection(COLLECTION).doc(artifactId).set(doc);
    logger.info('[agent] artifact created', { artifactId, userId: input.userId, pages: version.pageCount, bytes: version.sizeBytes });
    return doc;
  }

  /**
   * A flashcard deck: structured cards, no file. Stored like any other artifact — owner-scoped,
   * listed, openable in the workspace — so "the cards you made from your chart" is one lookup.
   */
  async createFlashcards(input: { userId: string; spec: unknown; runId?: string; provenance?: ArtifactDoc['provenance'] }): Promise<ArtifactDoc> {
    return this.createStructured('flashcards', input);
  }

  /**
   * An artifact whose spec is the whole thing — a deck, a quiz, an analysis, a plan. Validated
   * against its kind's schema, size-capped, stored with no file.
   */
  async createStructured(
    kind: StructuredKind,
    input: { userId: string; spec: unknown; runId?: string; provenance?: ArtifactDoc['provenance'] },
  ): Promise<ArtifactDoc> {
    const parsed = STRUCTURED_SCHEMAS[kind].safeParse(input.spec);
    if (!parsed.success) {
      const detail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new ArtifactError('INVALID_SPEC', `The ${KIND_NAMES[kind]} is not valid: ${detail}`, 422);
    }
    const spec = parsed.data;
    if (JSON.stringify(spec).length > MAX_SPEC_CHARS) {
      throw new ArtifactError('TOO_LARGE', `That ${KIND_NAMES[kind]} is too large to save in one go.`, 422);
    }
    const now = Date.now();
    const doc: ArtifactDoc = {
      artifactId: randomUUID(),
      userId: input.userId,
      runId: input.runId,
      kind,
      title: spec.title,
      status: 'ready',
      provenance: input.provenance ?? 'GENERATED',
      spec,
      currentVersion: 1,
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    await db().collection(COLLECTION).doc(doc.artifactId).set(doc);
    logger.info('[agent] artifact created', { artifactId: doc.artifactId, userId: input.userId, kind });
    return doc;
  }

  /** Renders a new version of an existing artifact from an updated spec. */
  async addVersion(artifactId: string, userId: string, spec: unknown): Promise<ArtifactDoc> {
    const existing = await this.getForUser(artifactId, userId);
    if (existing.kind !== 'document') throw new ArtifactError('INVALID_SPEC', 'Only documents have rendered versions.', 422);
    const parsed = documentSpecSchema.safeParse(spec);
    if (!parsed.success) throw new ArtifactError('INVALID_SPEC', 'The document structure is not valid.', 422);

    const version = await this.render(userId, artifactId, parsed.data, existing.currentVersion + 1);
    const updated: ArtifactDoc = {
      ...existing,
      spec: parsed.data,
      title: parsed.data.title,
      currentVersion: version.version,
      versions: [...existing.versions, version],
      updatedAt: Date.now(),
    };
    await db().collection(COLLECTION).doc(artifactId).set(updated);
    return updated;
  }

  private async render(userId: string, artifactId: string, spec: DocumentSpec, version: number): Promise<ArtifactVersion> {
    let rendered;
    try {
      rendered = await renderDocumentPdf(spec);
    } catch (e: any) {
      logger.warn('[agent] artifact render failed', { artifactId, error: String(e?.message ?? e) });
      throw new ArtifactError('RENDER_FAILED', 'I could not turn that into a PDF.', 500);
    }
    const buffer = Buffer.from(rendered.bytes);
    if (buffer.length > MAX_PDF_BYTES) {
      throw new ArtifactError('TOO_LARGE', 'The generated PDF is larger than the size limit.', 422);
    }

    const storagePath = storagePathFor(userId, artifactId, version);
    await bucket()
      .file(storagePath)
      .save(buffer, {
        contentType: 'application/pdf',
        resumable: false,
        // No download token: this file is reachable only through the owner-checked API.
        metadata: { metadata: { artifactId, ownerUid: userId, version: String(version) } },
      });

    return {
      version,
      storagePath,
      contentType: 'application/pdf',
      sizeBytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      pageCount: rendered.pageCount,
      createdAt: Date.now(),
    };
  }

  /** Owner-only read. Someone else's artifact is reported as missing, never as forbidden. */
  async getForUser(artifactId: string, userId: string): Promise<ArtifactDoc> {
    const snap = await db().collection(COLLECTION).doc(artifactId).get();
    const doc = snap.exists ? (snap.data() as ArtifactDoc) : null;
    if (!doc || doc.userId !== userId) throw new ArtifactError('NOT_FOUND', 'Artifact not found.', 404);
    return doc;
  }

  /**
   * Newest first in the query, so a student with many artifacts still sees the one they just made.
   * Needs (userId ASC, createdAt DESC) on `artifacts`; falls back to an unordered page sorted in
   * memory while that index is still building — same approach as the run store.
   */
  async listForUser(userId: string, limit = 20): Promise<ArtifactDoc[]> {
    try {
      const snap = await db().collection(COLLECTION).where('userId', '==', userId).orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as ArtifactDoc);
    } catch (e: any) {
      const missingIndex = e?.code === 9 || /index/i.test(String(e?.message ?? ''));
      if (!missingIndex) throw e;
      logger.warn('[agent] artifacts (userId, createdAt) index missing — falling back to in-memory ordering', { userId });
      const snap = await db().collection(COLLECTION).where('userId', '==', userId).limit(Math.max(limit * 3, 50)).get();
      return snap.docs
        .map((d) => d.data() as ArtifactDoc)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    }
  }

  /** The file bytes for a version the caller owns. */
  async readFile(artifactId: string, userId: string, version?: number): Promise<{ buffer: Buffer; filename: string; doc: ArtifactDoc }> {
    const doc = await this.getForUser(artifactId, userId);
    if (doc.versions.length === 0) throw new ArtifactError('NOT_FOUND', 'This artifact has no file to download.', 404);
    const wanted = version ?? doc.currentVersion;
    const entry = doc.versions.find((v) => v.version === wanted);
    if (!entry) throw new ArtifactError('NOT_FOUND', 'That version of the artifact does not exist.', 404);

    const [buffer] = await bucket().file(entry.storagePath).download();
    const safeTitle = doc.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document';
    return { buffer, filename: `${safeTitle}-v${entry.version}.pdf`, doc };
  }

  /** Removes an artifact and every rendered file it owns. */
  async deleteForUser(artifactId: string, userId: string): Promise<void> {
    const doc = await this.getForUser(artifactId, userId);
    for (const version of doc.versions) {
      await bucket()
        .file(version.storagePath)
        .delete()
        .catch((e: any) => logger.warn('[agent] artifact file delete failed', { artifactId, error: String(e?.message ?? e) }));
    }
    await db().collection(COLLECTION).doc(artifactId).delete();
  }
}

let service: ArtifactsService | null = null;
export function getArtifactsService(): ArtifactsService {
  if (!service) service = new ArtifactsService();
  return service;
}
