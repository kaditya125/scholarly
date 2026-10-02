import { matchesPaper, normalizePaper } from '../../src/services/pyq/paperIdentity';

describe('PYQ Paper and Tier Matching', () => {
  const sscTier1Question = {
    normalizedPaper: 'tier-1-cbt-2022-12-05-1',
    canonicalPaperId: 'paper:SSC_CGL:2022:na:sh1:tier-1-cbt',
    paper: 'Tier 1 CBT (2022-12-05 1)',
    session: 'Tier 1',
  };

  const sscTier2Question = {
    normalizedPaper: 'ssc-cgl-tier-2-mains-question-paper-3-ma',
    canonicalPaperId: 'paper:SSC_CGL:2022:na:na:tier-2-mains',
    paper: 'SSC CGL Tier 2 Mains',
    session: 'Tier 2',
  };

  const jeePaper1Question = {
    normalizedPaper: 'paper1',
    canonicalPaperId: 'paper:JEE_MAIN:2024:s1:sh1:paper1',
    paper: 'Paper 1 (B.E./B.Tech)',
    session: 'Session 1',
  };

  const jeePaper2Question = {
    normalizedPaper: 'paper2',
    canonicalPaperId: 'paper:JEE_MAIN:2024:s1:sh1:paper2',
    paper: 'Paper 2 (B.Arch)',
    session: 'Session 1',
  };

  const upscPaper1Question = {
    normalizedPaper: 'paper1',
    canonicalPaperId: 'paper:UPSC_CSE:2023:na:na:paper1',
    paper: 'GS Paper 1',
    session: 'Prelims',
  };

  const upscCsatQuestion = {
    normalizedPaper: 'paper2',
    canonicalPaperId: 'paper:UPSC_CSE:2023:na:na:paper2',
    paper: 'Paper 2 (CSAT)',
    session: 'Prelims',
  };

  const ugcNetPaper1Question = {
    normalizedPaper: null,
    canonicalPaperId: null,
    paper: 'Paper I',
    session: null,
  };

  const ugcNetPaper2Question = {
    normalizedPaper: null,
    canonicalPaperId: null,
    paper: 'Paper II',
    session: null,
  };

  const ugcNetPaper3Question = {
    normalizedPaper: null,
    canonicalPaperId: null,
    paper: 'Paper III',
    session: null,
  };

  const rrbNtpcCbt2Question = {
    normalizedPaper: null,
    canonicalPaperId: null,
    paper: 'CBT 2',
    session: 'Stage 2',
  };

  const neetUgQuestion = {
    normalizedPaper: null,
    canonicalPaperId: null,
    paper: 'NEET UG Full Paper',
    session: null,
  };

  it('matches requested "tier-1" to SSC CGL Tier 1 CBT questions', () => {
    expect(matchesPaper('tier-1', sscTier1Question)).toBe(true);
    expect(matchesPaper('tier1', sscTier1Question)).toBe(true);
    expect(matchesPaper('tier-1-cbt', sscTier1Question)).toBe(true);
  });

  it('strictly rejects "tier-2" for SSC CGL Tier 1 questions', () => {
    expect(matchesPaper('tier-2', sscTier1Question)).toBe(false);
    expect(matchesPaper('tier2', sscTier1Question)).toBe(false);
  });

  it('matches requested "tier-2" to SSC CGL Tier 2 questions and rejects "tier-1"', () => {
    expect(matchesPaper('tier-2', sscTier2Question)).toBe(true);
    expect(matchesPaper('tier-1', sscTier2Question)).toBe(false);
  });

  it('correctly matches JEE Main Paper 1 and isolates Paper 2', () => {
    expect(matchesPaper('paper1', jeePaper1Question)).toBe(true);
    expect(matchesPaper('paper-1', jeePaper1Question)).toBe(true);
    expect(matchesPaper('paper2', jeePaper1Question)).toBe(false);

    expect(matchesPaper('paper2', jeePaper2Question)).toBe(true);
    expect(matchesPaper('paper1', jeePaper2Question)).toBe(false);
  });

  it('correctly matches UPSC GS Paper 1 and CSAT (Paper 2)', () => {
    expect(matchesPaper('paper1', upscPaper1Question)).toBe(true);
    expect(matchesPaper('gs1', upscPaper1Question)).toBe(true);
    expect(matchesPaper('paper2', upscPaper1Question)).toBe(false);

    expect(matchesPaper('paper2', upscCsatQuestion)).toBe(true);
    expect(matchesPaper('csat', upscCsatQuestion)).toBe(true);
    expect(matchesPaper('paper1', upscCsatQuestion)).toBe(false);
  });

  it('correctly matches UGC NET Roman numerals (Paper I, Paper II, Paper III)', () => {
    expect(matchesPaper('paper1', ugcNetPaper1Question)).toBe(true);
    expect(matchesPaper('paper-1', ugcNetPaper1Question)).toBe(true);
    expect(matchesPaper('paper2', ugcNetPaper1Question)).toBe(false);

    expect(matchesPaper('paper2', ugcNetPaper2Question)).toBe(true);
    expect(matchesPaper('paper3', ugcNetPaper3Question)).toBe(true);
    expect(matchesPaper('paper1', ugcNetPaper3Question)).toBe(false);
  });

  it('correctly matches RRB NTPC CBT 2', () => {
    expect(matchesPaper('cbt2', rrbNtpcCbt2Question)).toBe(true);
    expect(matchesPaper('cbt1', rrbNtpcCbt2Question)).toBe(false);
  });

  it('correctly normalizes NEET UG full paper', () => {
    expect(normalizePaper(neetUgQuestion.paper)).toBe('full-paper');
    expect(matchesPaper('full-paper', neetUgQuestion)).toBe(true);
  });

  it('allows all records when no paper filter is requested', () => {
    expect(matchesPaper(null, sscTier1Question)).toBe(true);
    expect(matchesPaper(undefined, sscTier1Question)).toBe(true);
    expect(matchesPaper('', sscTier1Question)).toBe(true);
  });
});
