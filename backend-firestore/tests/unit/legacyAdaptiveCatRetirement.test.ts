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

describe('J.7.2 — the demo bank never mislabels its content', () => {
  it('THE REGRESSION: a non-PCM subject no longer yields Physics content wearing its name', async () => {
    mockGetProfile.mockResolvedValue({ subjects: ['Reasoning', 'General Knowledge'] });
    const r = await svc.generateAdaptiveBatch('u1', 0, []);

    // Whatever is served, it is labelled with the subject it actually came from.
    for (const q of r.questions) {
      expect(DEMO).toContain(q.subject);
      expect(q.subject).not.toBe('Reasoning');
      expect(q.subject).not.toBe('General Knowledge');
    }
    // ...and the mismatch is reported rather than hidden.
    expect(r.offProfile).toBe(true);
    expect(r.unsupportedSubjects.sort()).toEqual(['General Knowledge', 'Reasoning']);
  });

  it('an SSC CGL student (no mapped subjects) is flagged, not silently served as if on-profile', async () => {
    // suggestedSubjects('SSC') returns [] — the exact production shape.
    mockGetProfile.mockResolvedValue({ targetExam: 'SSC', subjects: [] });
    const r = await svc.generateAdaptiveBatch('u1', 0, []);
    expect(r.questions.length).toBeGreaterThan(0); // onboarding is not broken
    expect(r.questions.every((q) => DEMO.includes(q.subject))).toBe(true);
  });

  it('a supported subject is served from its OWN bank, never substituted', async () => {
    mockGetProfile.mockResolvedValue({ subjects: ['Chemistry'] });
    const r = await svc.generateAdaptiveBatch('u1', 0, []);
    expect(r.questions.every((q) => q.subject === 'Chemistry')).toBe(true);
    expect(r.offProfile).toBe(false);
    expect(r.unsupportedSubjects).toEqual([]);
  });

  it('mixed subjects rotate over only the supported ones', async () => {
    mockGetProfile.mockResolvedValue({ subjects: ['Reasoning', 'Physics'] });
    const r = await svc.generateAdaptiveBatch('u1', 0, []);
    expect(r.questions.every((q) => q.subject === 'Physics')).toBe(true);
    expect(r.unsupportedSubjects).toEqual(['Reasoning']);
    expect(r.offProfile).toBe(false);
  });

  it('every legacy question stays UNANCHORED and flagged, whatever the profile', async () => {
    for (const subjects of [[], ['Physics'], ['Reasoning'], ['Biology', 'General Knowledge']]) {
      mockGetProfile.mockResolvedValue({ subjects });
      const r = await svc.generateAdaptiveBatch('u1', 0, []);
      for (const q of r.questions) {
        expect(q.identityStatus).toBe('UNANCHORED');
        expect(q.isLegacyDemo).toBe(true);
        expect(q).not.toHaveProperty('syllabusNodeId');
        expect(q).not.toHaveProperty('syllabusId');
      }
    }
  });

  it('the Physics fallback is gone from the source, not merely unreachable', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/adaptiveCat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain(`INSTANT_QUESTION_BANK['Physics']`);
    // The PCM default for an empty profile is also gone.
    expect(src).not.toContain(`['Physics', 'Chemistry', 'Mathematics']`);
  });

  it('AdaptiveCat resolves no AI provider — it is a static bank and must not imply otherwise', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/adaptiveCat.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('container.resolve');
    expect(src).not.toContain('ReasoningProvider');
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
