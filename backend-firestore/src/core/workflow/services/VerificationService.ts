import { RetrievalService } from '../../../services/rag/retrieval.service';
import { VerificationError } from '../../errors/providerErrors';
import { logger } from '../../../utils/logger';

export interface CitationLike {
  text: string;
  source: string;
  score: number;
  [k: string]: any;
}

/**
 * Result of claim verification. Fields are optional where the previous inline logic left
 * the caller's default values untouched (i.e. when there are zero extracted claims, only
 * `confidence` is updated; hallucinationRate/citationCoverage keep their defaults).
 */
export interface VerificationResult {
  confidence: number;
  hallucinationRate?: number;
  citationCoverage?: number;
  warnings: string[];
}

/**
 * VerificationService — verifies the generated answer's claims against the retrieved
 * citations and derives confidence / hallucination / coverage figures.
 *
 * NOTE (design decision A): verification stays on the request's critical path. This service
 * only encapsulates the computation; the WorkflowEngine still owns emitting the streamed
 * `warning` event and the `done.confidenceScore`, so user-visible output is unchanged.
 *
 * Never throws: on failure it returns null so the caller keeps its default metrics — exactly
 * matching the previous non-fatal try/catch behavior.
 */
export class VerificationService {
  constructor(private readonly retrieval: RetrievalService = new RetrievalService()) {}

  async verify(answer: string, citations: CitationLike[]): Promise<VerificationResult | null> {
    try {
      const verification = await this.retrieval.verifyClaimsAndCalculateConfidence(
        answer,
        citations.map((c) => ({ text: c.text, source: c.source, score: c.score, metadata: c })),
      );

      const result: VerificationResult = { confidence: verification.confidenceScore, warnings: [] };

      const totalClaims = verification.supportedClaims.length + verification.unsupportedClaims.length;
      if (totalClaims > 0) {
        result.hallucinationRate = verification.unsupportedClaims.length / totalClaims;
        result.citationCoverage = verification.supportedClaims.length / totalClaims;
      }

      if (!verification.isValid && verification.unsupportedClaims.length > 0) {
        result.warnings = verification.unsupportedClaims.map((c: any) => c.claim);
      }

      return result;
    } catch (err) {
      // Non-fatal (design decision A): log as a typed VerificationError and keep default metrics.
      const verr = new VerificationError(String((err as any)?.message || err), { cause: err });
      logger.warn(`[verification] ${verr.name}: claim verification failed (non-fatal)`, { error: verr.message });
      return null;
    }
  }
}

export const verificationService = new VerificationService();
