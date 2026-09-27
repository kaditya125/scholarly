jest.mock('../../src/config/firebase', () => ({ db: {} }));
jest.mock('../../src/services/cache.service', () => ({ cacheService: {} }));

import { matchExamId, normaliseExamToken } from '../../src/services/pyq/examIndex';

// Aliases as build() derives them from the exam ids live on 2026-09-27 (no GATE or CUET id exists
// in `exams`, `pyq_source_registry` or `pyq_questions`).
const EXTRA: Record<string, string[]> = {
  UGC_NET: ['ugcnet', 'ugc', 'net', 'nta ugc net'],
  SSC_CGL: ['cgl', 'combined graduate level'],
  SSC_CHSL: ['chsl'],
  UPSC_CSE: ['upsc', 'ias', 'civil services', 'cse'],
  JEE_MAIN: ['jee', 'jee mains'],
  JEE_ADVANCED: ['jee adv'],
  NEET_UG: ['neet'],
  BPSC_CCE: ['bpsc'],
  BPSC_TRE: ['tre', 'bihar teacher', 'bihar tre', 'tre3'],
  BIHAR_STET: ['stet', 'bihar stet'],
};
const IDS = [...Object.keys(EXTRA), 'UPSC_CDS', 'SSC_GD'];
const aliases: Record<string, string> = {};
for (const id of IDS) {
  aliases[normaliseExamToken(id)] = id;
  for (const a of EXTRA[id] ?? []) aliases[normaliseExamToken(a)] = id;
}
const match = (q: string) => matchExamId(q, aliases);

describe('matchExamId', () => {
  it('never resolves a named family to another family (GATE CSE is not UPSC CSE)', () => {
    expect(match('GATE CSE')).toBeNull();
    expect(match('gate cse 2024 dbms questions')).toBeNull();
    expect(match('GATE CS')).toBeNull();
    expect(match('cse')).toBe('UPSC_CSE');
    expect(match('UPSC CSE')).toBe('UPSC_CSE');
  });

  it('resolves bare family goals only to a flagship the corpus holds', () => {
    expect(match('SSC')).toBe('SSC_CGL');
    expect(match('UPSC')).toBe('UPSC_CSE');
    expect(match('GATE')).toBeNull();
    expect(match('CUET')).toBeNull();
    const withoutCgl = Object.fromEntries(Object.entries(aliases).filter(([, id]) => id !== 'SSC_CGL'));
    expect(matchExamId('SSC', withoutCgl)).toBeNull();
  });

  it('keeps resolving what already resolved', () => {
    expect(match('SSC CGL')).toBe('SSC_CGL');
    expect(match('ssc-cgl')).toBe('SSC_CGL');
    expect(match('SSCCGL')).toBe('SSC_CGL');
    expect(match('CGL2023 tier 1')).toBe('SSC_CGL');
    expect(match('SSC CHSL')).toBe('SSC_CHSL');
    expect(match('SSC GD')).toBe('SSC_GD');
    expect(match('NEET')).toBe('NEET_UG');
    expect(match('JEE Main')).toBe('JEE_MAIN');
    expect(match('jee mains')).toBe('JEE_MAIN');
    expect(match('JEE Advanced')).toBe('JEE_ADVANCED');
    expect(match('UGC-NET')).toBe('UGC_NET');
    expect(match('nta ugc net')).toBe('UGC_NET');
    expect(match('UPSC CDS')).toBe('UPSC_CDS');
    expect(match('bpsc')).toBe('BPSC_CCE');
    expect(match('bihar tre')).toBe('BPSC_TRE');
    expect(match('tre3')).toBe('BPSC_TRE');
    expect(match('bihar stet')).toBe('BIHAR_STET');
    expect(match('investigate SSC CGL trends')).toBe('SSC_CGL');
  });

  it('matches whole words, not fragments of words', () => {
    expect(match('internet protocols')).toBeNull();
    expect(match('street math')).toBeNull();
  });
});
