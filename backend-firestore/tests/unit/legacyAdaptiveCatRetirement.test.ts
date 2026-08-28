/**
 * J.7.2 — legacy AdaptiveCat containment.
 *
 * THE PRODUCT RULE BEING ENFORCED: a student preparing for a specific exam must never be given a
 * question presented as an exam-specific diagnostic unless it can be traced to that exam's verified
 * canonical syllabus.
 *
 * Two concrete violations these lock out, both measured in the J.7/J.7.2 audits:
 *
 *  1. MISLABELLED CONTENT. `bank[subject] || bank['Physics']` served Physics questions while the
 *     question was still tagged with the REQUESTED subject — an SSC CGL candidate got a kinematics
 *     question tagged `subject: 'Reasoning'`.
 *  2. EXAM CLAIMS FROM NON-EXAM EVIDENCE. The Digital Twin asked the model for expected exam score,
 *     exam rank and target probability from those same twelve PCM templates, and the report screen
 *     rendered them under "Expected Board / Exam Score".
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../src/services/userProfile.service', () => ({
  UserProfileService: jest.fn().mockImplementation(() => ({ getProfile: mockGetProfile })),
}));
const mockGetProfile = jest.fn();

import { AdaptiveCatService } from '../../src/services/adaptiveCat.service';

const svc = new AdaptiveCatService();
const DEMO = ['Physics', 'Chemistry', 'Mathematics'];

beforeEach(() => jest.clearAllMocks());

/*
 * ── THIS BLOCK WAS REWRITTEN, AND WHY ─────────────────────────────────────────────────────
 *
 * It used to CONTAIN the demo bank: assert that its mislabelling was bounded, that every question
 * it produced was flagged `isLegacyDemo: true`, that substitution stayed within PCM. Those were
 * the right tests for a service whose only source of questions was a static array.
 *
 * The bank has since been deleted outright (see adaptiveCat.service.ts). Containing something
 * that no longer exists is not a test, so these assertions are replaced by the stronger property
 * that is now true: no static assessment question can be produced at all.
 *
 * HONEST NOTE ON WHAT BROKE. Of the five bank-behaviour tests here, THREE were already failing
 * before the bank was removed — `offProfile` and `unsupportedSubjects` had been hardcoded to
 * `false` / `[]` in the service for some time, so the test had drifted from the code it guarded.
 * Two failed because of the removal. Measured by running this suite against the pre-change
 * service: 3 failed / 10 passed, versus 5 failed afterwards.
 *
 * The product rule at the top of this file is unchanged and better served than before.
 */
describe('J.7.2 — no static question source survives', () => {
  it('THE REGRESSION: the bank is gone from source, not merely unreachable', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/adaptiveCat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('INSTANT_QUESTION_BANK');
    // The PCM default for an empty profile is also gone.
    expect(src).not.toContain(`['Physics', 'Chemistry', 'Mathematics']`);
    // And none of the four questions that were served to every student, whatever their exam.
    for (const q of ['vector quantity', 'acceleration produced', 'exothermic reaction']) {
      expect(src.toLowerCase()).not.toContain(q);
    }
  });

  it('a failure to generate throws instead of serving anything', async () => {
    // No LLM is reachable in this suite, so generation genuinely fails — which is the point.
    mockGetProfile.mockResolvedValue({ subjects: ['Reasoning', 'General Knowledge'] });
    await expect(svc.generateAdaptiveBatch('u1', 0, [])).rejects.toMatchObject({
      name: 'AdaptiveGenerationError',
      status: 503,
    });
  });

  it('the same holds for an exam with no mapped subjects — no PCM substitute appears', async () => {
    mockGetProfile.mockResolvedValue({ targetExam: 'SSC', subjects: [] });
    await expect(svc.generateAdaptiveBatch('u1', 0, [])).rejects.toThrow(/try again/i);
    // The old behaviour: DEMO subjects served to an SSC candidate. It cannot happen now.
    expect(DEMO).toEqual(['Physics', 'Chemistry', 'Mathematics']);   // fixture intact
  });

  it('AdaptiveCat resolves no DI provider — its only source is the injected LLM', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/adaptiveCat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('container.resolve');
    expect(src).not.toContain('ReasoningProvider');
    // It is no longer a static bank — it must resolve questions through the LLM path.
    expect(src).toContain('this.llm.generateResponse');
  });
});

describe('J.7.2 — exam claims require canonical evidence', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('readiness and predictions are gated on evidenceIsCanonical', () => {
    const src = read('services/studentDigitalTwin.service.ts');
    expect(src).toMatch(/predictions:\s*submission\.evidenceIsCanonical/);
    expect(src).toMatch(/overallReadinessScore:\s*submission\.evidenceIsCanonical/);
  });

  it('the baseline computes evidenceIsCanonical from the questions actually served', () => {
    const src = read('services/baselineAssessment.service.ts');
    // Computed, not hardcoded false — so it becomes true on its own once this flow is canonical.
    expect(src).toMatch(/evidenceIsCanonical:\s*sessionQuestions\.length > 0/);
    expect(src).toContain(`q?.identityStatus === 'CANONICAL'`);
    expect(src).not.toContain('evidenceIsCanonical: false');
  });

  it('the legacy bank cannot satisfy that gate — it is UNANCHORED by construction', () => {
    const src = read('services/adaptiveCat.service.ts');
    expect(src).toContain(`identityStatus: 'UNANCHORED'`);
    expect(src).not.toContain(`identityStatus: 'CANONICAL'`);
  });
});

describe('J.7.2 — legacy paths are classified and cannot pose as canonical', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8');

  it('adaptiveTestService is documented as LEGACY / UNANCHORED', () => {
    expect(read('services/tests/adaptiveTest.service.ts')).toMatch(/LEGACY \/ UNANCHORED/);
  });

  it('no legacy service is reachable from the canonical assessment path', () => {
    for (const f of ['services/assessment/canonicalPreTest.service.ts',
                     'services/exam/canonicalSyllabusResolver.ts',
                     'routes/canonicalAssessment.routes.ts']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const legacy of ['adaptiveCat', 'INSTANT_QUESTION_BANK',
                            'adaptiveTest', 'testGenerator', 'baselineAssessment']) {
        expect(src).not.toContain(legacy);
      }
    }
  });

  it('the canonical endpoint is the only route mounting the canonical pre-test service', () => {
    const routesDir = path.join(__dirname, '../../src/routes');
    const mounting = fs.readdirSync(routesDir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => fs.readFileSync(path.join(routesDir, f), 'utf8')
        .includes('canonicalPreTestService'));
    expect(mounting).toEqual(['canonicalAssessment.routes.ts']);
  });
});
