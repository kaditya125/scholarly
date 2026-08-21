/**
 * J.7.1 — canonical syllabus resolution.
 *
 * ONE JOB: turn `examId + cycleId` into the verified CURRENT syllabus and its version-isolated
 * canonical graph, or say plainly that there isn't one.
 *
 *     examId + cycleId → CURRENT syllabus → validated graph → question-bearing nodes
 *
 * It calls no model, generates nothing, matches nothing fuzzily, reads no hardcoded syllabus, and
 * never substitutes another cycle or another version. Those are not omissions to be filled in
 * later — each one is a way the platform could claim to know an official syllabus it cannot prove,
 * which is the failure this whole programme exists to eliminate.
 *
 * THE DISTINCTION THAT MATTERS MOST, and the one most easily lost:
 *
 *     no verified syllabus exists   → NO_CANONICAL_SYLLABUS   (a fact about our data)
 *     we could not read the store   → THROW SyllabusUnavailableError (a fact about our systems)
 *
 * Collapsing the second into the first would let a Firestore outage tell a student their exam has
 * no syllabus. Every read below is therefore deliberately un-caught except where the error is
 * explicitly reclassified as unavailability.
 */
import { logger } from '../../utils/logger';
import { examMasterService } from './examMaster.service';
import { syllabusGraphService, SyllabusGraphNode } from './syllabusGraph.service';
import { QUESTION_BEARING_TYPES } from './syllabusCanonicalGraph';
import {
  SyllabusResolution,
  SyllabusUnavailableError,
  NoCanonicalSyllabusReason,
} from '../../types/canonicalAssessment.types';

export class CanonicalSyllabusResolver {
  /**
   * Resolves the canonical syllabus for an exact exam + cycle.
   *
   * `cycleId` is required and is never defaulted. `examMasterService.getCurrentSyllabus` will fall
   * back to the exam's `currentCycle` when a cycle is omitted, which is reasonable for a browsing
   * API and wrong here: an assessment must be anchored to the cycle the student is actually sitting
   * for, and quietly testing them against a different year's syllabus is a silent correctness bug
   * that nothing downstream could detect.
   */
  async resolve(examId: string, cycleId: string): Promise<SyllabusResolution> {
    const normalizedExam = String(examId ?? '').trim().toUpperCase();
    const normalizedCycle = String(cycleId ?? '').trim();

    if (!normalizedExam || !normalizedCycle) {
      // Not an infrastructure failure and not a data absence — a malformed request. Reported as
      // unresolvable rather than throwing, so a caller cannot mistake it for an outage.
      return this.unresolved(normalizedExam, normalizedCycle, 'NO_CURRENT_SYLLABUS',
        'examId and cycleId are both required; neither is ever defaulted for an assessment');
    }

    // ── 1. The CURRENT record ────────────────────────────────────────────────────────────────
    // Post-J.7.0 this reads Firestore and nothing else: there is no seed to fall back to, so a
    // null here genuinely means no verified version is published.
    let syllabus;
    try {
      syllabus = await examMasterService.getCurrentSyllabus(normalizedExam, normalizedCycle);
    } catch (err: any) {
      throw new SyllabusUnavailableError(normalizedExam, normalizedCycle,
        `syllabus lookup failed: ${err?.message ?? err}`);
    }

    if (!syllabus) {
      // Covers "nothing exists", "everything is INVALID", and "everything is SUPERSEDED" alike.
      // The repository query filters on status === 'CURRENT', so a quarantined version is simply
      // never returned — it is not specially detected here, which is what makes it impossible to
      // accidentally "recover" one.
      return this.unresolved(normalizedExam, normalizedCycle, 'NO_CURRENT_SYLLABUS',
        `no CURRENT syllabus is published for ${normalizedExam}/${normalizedCycle}`);
    }

    // ── 2. Cycle agreement ───────────────────────────────────────────────────────────────────
    // Defence in depth. The query already constrained the cycle, so a mismatch means corrupt data
    // rather than a filtering miss — and a syllabus that disagrees with its own coordinates must
    // never be used, because every question generated from it would inherit the wrong cycle.
    if (syllabus.cycleId !== normalizedCycle || syllabus.examId !== normalizedExam) {
      logger.error('[CanonicalSyllabus] CURRENT record disagrees with its own coordinates', {
        requested: `${normalizedExam}/${normalizedCycle}`,
        found: `${syllabus.examId}/${syllabus.cycleId}`, syllabusId: syllabus.syllabusId,
      });
      return this.unresolved(normalizedExam, normalizedCycle, 'CYCLE_MISMATCH',
        `CURRENT record ${syllabus.syllabusId} claims ${syllabus.examId}/${syllabus.cycleId}`);
    }

    // ── 3. The version's canonical graph ─────────────────────────────────────────────────────
    // Read strictly within this syllabusId's own subtree. Without the version scope a read would
    // span every version of the exam, and a 2026 assessment could draw nodes defined by the 2024
    // syllabus — version isolation is the property J.1 exists to guarantee and it is preserved by
    // passing the scope, not by filtering afterwards.
    let nodes: SyllabusGraphNode[];
    try {
      nodes = await syllabusGraphService.getSyllabusNodes({
        examId: normalizedExam, cycleId: normalizedCycle, syllabusId: syllabus.syllabusId,
      });
    } catch (err: any) {
      // getSyllabusNodes deliberately rethrows rather than returning []; preserving that here is
      // what stops "the graph could not be read" from becoming "the syllabus has no topics".
      throw new SyllabusUnavailableError(normalizedExam, normalizedCycle,
        `canonical graph read failed for ${syllabus.syllabusId}: ${err?.message ?? err}`);
    }

    if (nodes.length === 0) {
      // A published CURRENT version with no graph should be unreachable — publishSyllabusVersion
      // requires a validated manifest with nodeCount > 0 — so this is reported loudly rather than
      // treated as an ordinary empty result.
      logger.error('[CanonicalSyllabus] CURRENT version has no canonical graph', {
        examId: normalizedExam, cycleId: normalizedCycle, syllabusId: syllabus.syllabusId,
      });
      return this.unresolved(normalizedExam, normalizedCycle, 'GRAPH_NOT_BUILT',
        `no canonical graph nodes exist for ${syllabus.syllabusId}`);
    }

    // ── 4. Nodes a question may be authored against ──────────────────────────────────────────
    const questionBearingNodes = nodes.filter((n) => QUESTION_BEARING_TYPES.includes(n.type));
    if (questionBearingNodes.length === 0) {
      // Structure exists but stops above topic level: an extraction that captured papers and
      // subjects and no topics. Usable for display, not for assessment.
      return this.unresolved(normalizedExam, normalizedCycle, 'NO_QUESTION_BEARING_NODES',
        `${syllabus.syllabusId} has ${nodes.length} node(s) but none of type ` +
        `${QUESTION_BEARING_TYPES.join('/')}`);
    }

    return {
      outcome: 'RESOLVED',
      examId: normalizedExam,
      cycleId: normalizedCycle,
      syllabusId: syllabus.syllabusId,
      version: syllabus.version,
      nodes,
      questionBearingNodes,
    };
  }

  private unresolved(
    examId: string, cycleId: string, reason: NoCanonicalSyllabusReason, detail: string,
  ): SyllabusResolution {
    logger.info('[CanonicalSyllabus] NO_CANONICAL_SYLLABUS', { examId, cycleId, reason, detail });
    return { outcome: 'NO_CANONICAL_SYLLABUS', examId, cycleId, reason, detail };
  }
}

export const canonicalSyllabusResolver = new CanonicalSyllabusResolver();
