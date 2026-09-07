/**
 * BPSC Combined Competitive Examination (CCE) Production PYQ Corpus Builder
 * Covers 65th through 70th CCE Prelims (Bihar History, Geography, Economy, Science, Polity, Aptitude).
 */

import { CanonicalPYQQuestion } from '../../../src/types/pyq.types';
import { buildAllBPSCPapers } from '../tools/generate-bpsc-paper-corpus';

export function buildBPSCCCECorpus(targetYear?: number): CanonicalPYQQuestion[] {
  return buildAllBPSCPapers(targetYear);
}
