import { db, firebaseApp } from '../config/firebase';
import { env } from '../config/env';
import { DocumentSource } from '../types';
import { sourceRepository } from '../repositories/source.repository';
import { notebookRepository } from '../repositories/notebook.repository';
import { pineconeService } from './rag/pinecone.service';
import { featureFlags, VERIFICATION_VERSION } from '../config/featureFlags';

/**
 * Phase A — Post-ingest verification & repair.
 *
 * Runs a set of artifact checks against an ingested source (Storage PDF, Firestore doc,
 * Pinecone vectors, knowledge graph, assets, metadata), optionally attempts ONE targeted
 * repair of any missing artifact (reusing the ingestion pipeline — never re-running successful
 * stages), then returns a structured result and the resolved status (READY or READY_DEGRADED).
 *
 * It never marks a source FAILED — a source that ingested but has a repairable gap is
 * READY_DEGRADED, which the app treats exactly like READY (only admin dashboards distinguish it).
 * Fully additive and idempotent.
 */

export type ArtifactName = 'storage' | 'firestore' | 'metadata' | 'vectors' | 'graph' | 'assets';

export interface ArtifactCheck {
  ok: boolean;
  detail?: string;
  /** whether a targeted repair exists for this artifact when it is missing. */
  repairable?: boolean;
  /** whether this artifact is required for the source to be fully "passed". */
  critical?: boolean;
}

export interface VerificationResult {
  passed: boolean;
  status: 'READY' | 'READY_DEGRADED';
  warnings: string[];
  failures: string[];
  missingArtifacts: ArtifactName[];
  repairedArtifacts: ArtifactName[];
  verificationTimeMs: number;
  verificationVersion: number;
  checks: Record<ArtifactName, ArtifactCheck>;
}

export interface VerifyOptions {
  /** attempt repair of missing artifacts (defaults to the ENABLE_REPAIR flag). */
  repair?: boolean;
  /** skip the (eventually-consistent) Pinecone vector check — used inline right after indexing. */
  assumeVectorsOk?: boolean;
  /** expected chunk count when it isn't yet persisted on the source doc (inline path). */
  expectedChunks?: number;
}

// 'DOCUMENTARY_ARTICLE' is treated as a *non-critical* required asset: missing it does NOT mark
// the source FAILED, but it DOES force verification.passed === false and (with READY_DEGRADED
// flag enabled, the default) flips the resolved status from READY -> READY_DEGRADED. This is
// what makes "rich-asset generation failed -> reader UI surfaces a degraded source" actually hold
// instead of getting silently clobbered by the verification pass.
const ASSET_TYPES: Array<'SUMMARY' | 'FLASHCARDS' | 'QUIZ' | 'DOCUMENTARY_ARTICLE'> = [
  'SUMMARY',
  'FLASHCARDS',
  'QUIZ',
  'DOCUMENTARY_ARTICLE',
];

class VerificationService {
  /** Verify a single source; optionally repair; return a structured result. */
  async verifySource(source: DocumentSource, opts: VerifyOptions = {}): Promise<VerificationResult> {
    const start = Date.now();
    const repairAllowed = opts.repair ?? featureFlags.repair;

    let checks = await this.runChecks(source, opts);
    const repaired: ArtifactName[] = [];

    if (repairAllowed) {
      const toRepair = (Object.keys(checks) as ArtifactName[]).filter((a) => !checks[a].ok && checks[a].repairable);
      for (const artifact of toRepair) {
        try {
          const ok = await this.repairArtifact(source, artifact);
          if (ok) repaired.push(artifact);
        } catch (e) {
          console.error(`[Verification] repair of ${artifact} failed for ${source.id}:`, e);
        }
      }
      if (toRepair.length > 0) {
        // Re-fetch the (possibly updated) source and re-verify only after repairs ran.
        const fresh = await sourceRepository.getSource(source.notebookId, source.id);
        checks = await this.runChecks(fresh || source, { ...opts, assumeVectorsOk: opts.assumeVectorsOk });
      }
    }

    const missingArtifacts = (Object.keys(checks) as ArtifactName[]).filter((a) => !checks[a].ok);
    const failures = missingArtifacts.filter((a) => checks[a].critical).map((a) => `${a}: ${checks[a].detail || 'missing'}`);
    const warnings = missingArtifacts.filter((a) => !checks[a].critical).map((a) => `${a}: ${checks[a].detail || 'missing'}`);
    const passed = missingArtifacts.length === 0;

    const status: 'READY' | 'READY_DEGRADED' = passed
      ? 'READY'
      : (featureFlags.readyDegraded ? 'READY_DEGRADED' : 'READY');

    return {
      passed,
      status,
      warnings,
      failures,
      missingArtifacts,
      repairedArtifacts: repaired,
      verificationTimeMs: Date.now() - start,
      verificationVersion: VERIFICATION_VERSION,
      checks,
    };
  }

  private async runChecks(source: DocumentSource, opts: VerifyOptions): Promise<Record<ArtifactName, ArtifactCheck>> {
    const [storage, vectors, graph, assets] = await Promise.all([
      this.checkStorage(source),
      this.checkVectors(source, opts),
      this.checkGraph(source),
      this.checkAssets(source),
    ]);
    return {
      storage,
      firestore: this.checkFirestore(source),
      metadata: this.checkMetadata(source),
      vectors,
      graph,
      assets,
    };
  }

  // ── Individual artifact checks ──────────────────────────────────────────

  private async checkStorage(source: DocumentSource): Promise<ArtifactCheck> {
    if (!env.FIREBASE_STORAGE_BUCKET) return { ok: true, detail: 'storage disabled', critical: false };
    const storagePath = source.storagePath
      || (source.gcsPath ? source.gcsPath.replace(/^gs:\/\/[^/]+\//, '') : '');
    if (!storagePath) return { ok: false, detail: 'no gcsPath/storagePath on source', repairable: false, critical: false };
    try {
      const [exists] = await firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storagePath).exists();
      return exists
        ? { ok: true, critical: false }
        : { ok: false, detail: `object not found: ${storagePath}`, repairable: false, critical: false };
    } catch (e: any) {
      return { ok: false, detail: `storage check error: ${String(e?.message || e).slice(0, 120)}`, repairable: false, critical: false };
    }
  }

  private checkFirestore(source: DocumentSource): ArtifactCheck {
    const validId = !!source.id && !!source.notebookId && !!source.userId;
    const validChunks = typeof source.chunksExtracted === 'number';
    if (!validId) return { ok: false, detail: 'source doc missing identity fields', repairable: false, critical: true };
    if (!validChunks) return { ok: false, detail: 'chunksExtracted not set', repairable: false, critical: false };
    return { ok: true, critical: true };
  }

  private checkMetadata(source: DocumentSource): ArtifactCheck {
    const m = source.metadata as any;
    if (!m || typeof m !== 'object') return { ok: false, detail: 'metadata missing', repairable: true, critical: false };
    // Structural validity (not non-emptiness): the array fields, when present, must be arrays.
    const arrayFields = ['definitions', 'keywords', 'headings', 'formulae', 'importantFacts', 'learningObjectives'];
    for (const f of arrayFields) {
      if (m[f] !== undefined && !Array.isArray(m[f])) {
        return { ok: false, detail: `metadata.${f} is not an array`, repairable: true, critical: false };
      }
    }
    return { ok: true, critical: false };
  }

  private async checkVectors(source: DocumentSource, opts: VerifyOptions): Promise<ArtifactCheck> {
    const expected = opts.expectedChunks ?? source.chunksExtracted ?? 0;
    // Vectors are the retrieval backbone — treat as critical.
    if (opts.assumeVectorsOk) return { ok: true, detail: `assumed ${expected} (just indexed)`, critical: true };
    if (expected <= 0) return { ok: false, detail: 'chunksExtracted=0 (no vectors)', repairable: featureFlags.vectorRepair, critical: true };

    const ns = env.PINECONE_NAMESPACE;
    const ids: string[] = [];
    for (let i = 0; i < expected; i++) ids.push(`${source.id}_chunk_${i}`);

    let present = 0;
    try {
      const batch = 200;
      for (let i = 0; i < ids.length; i += batch) {
        const rec = await pineconeService.fetchVectors(ids.slice(i, i + batch), ns);
        present += Object.keys(rec || {}).length;
      }
    } catch (e: any) {
      // If Pinecone is unreachable we cannot assert — treat as a non-actionable warning, not a failure.
      return { ok: false, detail: `pinecone fetch error: ${String(e?.message || e).slice(0, 120)}`, repairable: false, critical: false };
    }

    if (present >= expected) return { ok: true, detail: `${present}/${expected} vectors`, critical: true };
    return {
      ok: false,
      detail: `partial index: ${present}/${expected} vectors present`,
      repairable: featureFlags.vectorRepair,
      critical: true,
    };
  }

  private async checkGraph(source: DocumentSource): Promise<ArtifactCheck> {
    const m = source.metadata as any;
    const metadataHadConcepts = !!m && ((m.definitions?.length || 0) > 0 || (m.keywords?.length || 0) > 0);
    // Graph is only required when metadata extraction actually produced concepts.
    if (!metadataHadConcepts) return { ok: true, detail: 'no concepts in metadata; graph not required', critical: false };
    try {
      const nodes = await notebookRepository.getKGNodes(source.notebookId);
      const hasForSource = nodes.some((n) => (n.sourceDocIds || []).includes(source.id));
      return hasForSource
        ? { ok: true, critical: false }
        : { ok: false, detail: 'no KG nodes reference this source', repairable: true, critical: false };
    } catch (e: any) {
      return { ok: false, detail: `graph check error: ${String(e?.message || e).slice(0, 120)}`, repairable: true, critical: false };
    }
  }

  private async checkAssets(source: DocumentSource): Promise<ArtifactCheck> {
    try {
      const missing: string[] = [];
      for (const type of ASSET_TYPES) {
        const snap = await db.collection('notebooks').doc(source.notebookId).collection('assets')
          .where('type', '==', type).get();
        const found = snap.docs.some((d) => String((d.data() as any)?.title || '').includes(source.title));
        if (!found) missing.push(type);
      }
      return missing.length === 0
        ? { ok: true, critical: false }
        : { ok: false, detail: `missing assets: ${missing.join(', ')}`, repairable: true, critical: false };
    } catch (e: any) {
      return { ok: false, detail: `assets check error: ${String(e?.message || e).slice(0, 120)}`, repairable: true, critical: false };
    }
  }

  // ── Targeted repair (reuses the ingestion pipeline; never reruns successful stages) ──

  private async repairArtifact(source: DocumentSource, artifact: ArtifactName): Promise<boolean> {
    const { sourceService } = await import('./source.service');
    switch (artifact) {
      case 'metadata':
      case 'graph':
        return sourceService.repairMetadataAndGraph(source);
      case 'assets':
        return sourceService.repairAssets(source);
      case 'vectors':
        if (!featureFlags.vectorRepair) return false;
        return sourceService.repairVectors(source);
      default:
        return false; // storage/firestore are not auto-repairable
    }
  }

  /** Persist the verification summary + resolved status onto the source document. */
  async persistResult(source: DocumentSource, result: VerificationResult): Promise<void> {
    await sourceRepository.updateSource(source.notebookId, source.id, {
      status: result.status,
      verification: {
        passed: result.passed,
        status: result.status,
        missingArtifacts: result.missingArtifacts,
        repairedArtifacts: result.repairedArtifacts,
        warnings: result.warnings,
        failures: result.failures,
        verifiedAt: Date.now(),
        verificationTimeMs: result.verificationTimeMs,
        verificationVersion: result.verificationVersion,
      },
      verificationVersion: result.verificationVersion,
    });
  }
}

export const verificationService = new VerificationService();
