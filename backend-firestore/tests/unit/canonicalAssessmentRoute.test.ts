/**
 * J.7.1 — the canonical assessment endpoint.
 *
 * The status codes are the contract, not decoration. Three outcomes that a caller must be able to
 * tell apart, and that earlier versions of this system would have collapsed into one:
 *
 *   409 NO_CANONICAL_SYLLABUS  the platform holds no verified syllabus for this exam+cycle
 *   503 UNAVAILABLE            we could not check (Firestore down) — NOT the same statement
 *   502 FAILED                 a syllabus resolved, then generation or validation broke
 *
 * A student told "no syllabus" during an outage has been misinformed about their own exam, which
 * is why 409 and 503 are kept apart at the wire level and not merely in logs.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../src/middlewares/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { uid: req.headers['x-test-uid'] || 'student_from_token' };
    next();
  },
  enforceSelf: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/assessment/canonicalPreTest.service', () => ({
  canonicalPreTestService: { generatePreTest: jest.fn() },
}));

import canonicalAssessmentRoutes from '../../src/routes/canonicalAssessment.routes';
import { canonicalPreTestService } from '../../src/services/assessment/canonicalPreTest.service';
import { SyllabusUnavailableError, NO_CANONICAL_SYLLABUS_MESSAGE } from '../../src/types/canonicalAssessment.types';

const app = express();
app.use(express.json());
app.use('/api/assessment', canonicalAssessmentRoutes);

const gen = canonicalPreTestService.generatePreTest as jest.Mock;
beforeEach(() => jest.clearAllMocks());

const body = { examId: 'SSC_CGL', cycleId: '2026' };

describe('POST /api/assessment/pretest', () => {
  it('201 with the full audit trail when a syllabus resolves', async () => {
    gen.mockResolvedValue({
      outcome: 'GENERATED', attemptId: 'qa_1', questionCount: 2,
      nodeIdsUsed: ['topic:a', 'topic:b'],
      request: { examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_v1',
                 syllabusVersion: '2026-v1', requestId: 'pretest_abc' },
    });
    const r = await request(app).post('/api/assessment/pretest').send(body);
    expect(r.status).toBe(201);
    // Every field needed to answer "why was this question asked to this student?".
    expect(r.body).toMatchObject({
      outcome: 'GENERATED', attemptId: 'qa_1', syllabusId: 'syl_v1',
      syllabusVersion: '2026-v1', nodeIdsUsed: ['topic:a', 'topic:b'],
    });
  });

  it('409 NO_CANONICAL_SYLLABUS — with a student-safe message and no questions', async () => {
    gen.mockResolvedValue({
      outcome: 'NO_CANONICAL_SYLLABUS', examId: 'SSC_CGL', cycleId: '2026',
      reason: 'NO_CURRENT_SYLLABUS', detail: 'internal detail',
      studentMessage: NO_CANONICAL_SYLLABUS_MESSAGE,
    });
    const r = await request(app).post('/api/assessment/pretest').send(body);
    expect(r.status).toBe(409);
    expect(r.body.outcome).toBe('NO_CANONICAL_SYLLABUS');
    expect(r.body.message).toBe(NO_CANONICAL_SYLLABUS_MESSAGE);
    expect(r.body).not.toHaveProperty('questions');
    expect(r.body).not.toHaveProperty('attemptId');
  });

  it('503 when resolution is UNAVAILABLE — never conflated with "no syllabus"', async () => {
    gen.mockRejectedValue(new SyllabusUnavailableError('SSC_CGL', '2026', 'DEADLINE_EXCEEDED'));
    const r = await request(app).post('/api/assessment/pretest').send(body);
    expect(r.status).toBe(503);
    expect(r.body.outcome).toBe('UNAVAILABLE');
    expect(r.body.message).not.toMatch(/not currently available/i);
  });

  it('502 when a resolved syllabus then fails generation or validation', async () => {
    gen.mockResolvedValue({
      outcome: 'FAILED', examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_v1',
      reason: 'CANONICAL_VALIDATION_FAILED', detail: 'node rejected',
    });
    const r = await request(app).post('/api/assessment/pretest').send(body);
    expect(r.status).toBe(502);
    expect(r.body.reason).toBe('CANONICAL_VALIDATION_FAILED');
  });

  it('400 when examId or cycleId is missing — neither is ever defaulted', async () => {
    for (const b of [{}, { examId: 'SSC_CGL' }, { cycleId: '2026' }]) {
      const r = await request(app).post('/api/assessment/pretest').send(b);
      expect(r.status).toBe(400);
      expect(gen).not.toHaveBeenCalled();
    }
  });

  it('studentId comes from the token and CANNOT be supplied in the body', async () => {
    gen.mockResolvedValue({
      outcome: 'GENERATED', attemptId: 'qa_1', questionCount: 1, nodeIdsUsed: [],
      request: { examId: 'SSC_CGL', cycleId: '2026', syllabusId: 's', syllabusVersion: 'v', requestId: 'r' },
    });
    await request(app).post('/api/assessment/pretest')
      .set('x-test-uid', 'real_student')
      .send({ ...body, studentId: 'VICTIM_UID', userId: 'VICTIM_UID' });

    // Persisting an assessment onto someone else's record must be impossible by construction.
    expect(gen).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'real_student' }));
    const arg = gen.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain('VICTIM_UID');
  });

  it('there is no parameter that can request a non-canonical fallback test', async () => {
    gen.mockResolvedValue({
      outcome: 'NO_CANONICAL_SYLLABUS', examId: 'SSC_CGL', cycleId: '2026',
      reason: 'NO_CURRENT_SYLLABUS', detail: '', studentMessage: NO_CANONICAL_SYLLABUS_MESSAGE,
    });
    // Every plausible escape hatch a caller might try.
    const r = await request(app).post('/api/assessment/pretest').send({
      ...body, allowFallback: true, allowUnanchored: true, useLegacyBank: true, generic: true,
    });
    expect(r.status).toBe(409);
    const passed = JSON.stringify(gen.mock.calls[0][0]);
    for (const k of ['allowFallback', 'allowUnanchored', 'useLegacyBank', 'generic']) {
      expect(passed).not.toContain(k);
    }
  });

  it('questionCount is clamped rather than trusted', async () => {
    gen.mockResolvedValue({
      outcome: 'GENERATED', attemptId: 'q', questionCount: 1, nodeIdsUsed: [],
      request: { examId: 'x', cycleId: 'y', syllabusId: 's', syllabusVersion: 'v', requestId: 'r' },
    });
    for (const [input, expected] of [[9999, 50], [-5, 1], ['abc', 10]] as const) {
      gen.mockClear();
      await request(app).post('/api/assessment/pretest').send({ ...body, questionCount: input });
      expect(gen).toHaveBeenCalledWith(expect.objectContaining({ questionCount: expected }));
    }
  });
});
