/**
 * The voice tutor's getStudentContext tool.
 *
 * WHY THIS EXISTS. Three times now this codebase has read a field name that exists on no schema,
 * got `undefined`, coerced it to a default, and shipped a silently empty answer:
 *
 *   1. `profile.examId` / `profile.exam` instead of `profile.targetExam` — every syllabus lookup
 *      answered "no exam selected for this student".
 *   2. `memory.recentTopics` — appears nowhere in the codebase. Always [].
 *   3. `analytics.weakAreas` — weakAreas is real, but lives on the PROFILE document.
 *
 * Each one type-checked, threw nothing, and logged nothing. (2) and (3) were the worse pair,
 * because the tool's own description promised the model "recent study activity" and told it to
 * answer "what they have been studying" — so the model asked, got nothing back, and had to
 * improvise about a real student.
 *
 * These tests assert the tool returns the DATA, not merely the shape.
 */

const mockContext = {
  identity: { name: 'Riya' },
  profile: {
    targetExam: 'UPSC CSE',
    subjects: ['Polity', 'Economy'],
    goal: 'Clear prelims 2027',
    classLevel: 'Graduate',
    weakAreas: ['Modern History'],
  },
  memory: {
    weakTopics: ['Fundamental Rights'],
    strongTopics: ['Geography'],
    learningSpeed: 'medium',
    comprehensionDepth: 'intermediate',
    preferredModes: [],
  },
  analytics: null,             // the normal production shape — nothing writes this document
  planner: {
    todayTasks: [
      { title: 'Revise Article 21', type: 'revision', completed: false, priority: 'high' },
      { title: 'Already done task', type: 'practice', completed: true, priority: 'low' },
    ],
  },
  notebooks: {
    totalNotebooks: 3,
    recentNotebookNames: ['Indian Polity — Laxmikanth', 'Economic Survey 2026'],
    totalSources: 12,
  },
};

jest.mock('../../src/services/studentContext.service', () => ({
  studentContextService: { aggregateContext: jest.fn(async () => mockContext) },
}));
jest.mock('../../src/services/rag/retrieval.service', () => ({ retrievalService: {} }));
jest.mock('../../src/services/exam/examMaster.service', () => ({ examMasterService: {} }));

import { executeVoiceTool, VOICE_TOOL_DECLARATIONS } from '../../src/services/voice/voiceTools';

const CTX = { userId: 'student-1' } as any;
const call = () => executeVoiceTool('getStudentContext', {}, CTX);

describe('the tutor can say what the student has been studying', () => {
  it('returns the material they were actually working with', async () => {
    const r: any = await call();
    expect(r.found).toBe(true);
    expect(r.recentNotebooks).toEqual(['Indian Polity — Laxmikanth', 'Economic Survey 2026']);
  });

  it('returns what is still outstanding on today plan, excluding completed work', async () => {
    const r: any = await call();
    expect(r.todayPlan).toEqual(['Revise Article 21']);
    expect(r.todayPlan).not.toContain('Already done task');
  });

  it('knows who it is speaking to', async () => {
    const r: any = await call();
    expect(r.name).toBe('Riya');
    expect(r.exam).toBe('UPSC CSE');
    expect(r.subjects).toEqual(['Polity', 'Economy']);
    expect(r.level).toBe('Graduate');
  });
});

describe('the dead field names must not come back', () => {
  it('reads weak topics from memory, not from the analytics block that has no such field', async () => {
    const r: any = await call();
    expect(r.weakTopics).toEqual(['Fundamental Rights']);
    expect(r.strongTopics).toEqual(['Geography']);
  });

  it('falls back to profile.weakAreas when memory has none — that is where the field lives', async () => {
    const svc = require('../../src/services/studentContext.service').studentContextService;
    svc.aggregateContext.mockResolvedValueOnce({
      ...mockContext,
      memory: { ...mockContext.memory, weakTopics: [] },
    });
    const r: any = await call();
    expect(r.weakTopics).toEqual(['Modern History']);
  });

  it('survives analytics being null, which is the normal production shape', async () => {
    const r: any = await call();
    // The old code read analytics.weakAreas; analytics is null in normal operation, so this
    // must not throw and must not produce a phantom empty "weak areas" answer.
    expect(r.found).toBe(true);
    expect(r).not.toHaveProperty('weakAreas');
    expect(r).not.toHaveProperty('recentTopics');
  });

  it('the source file reads no field that exists on no schema', () => {
    const src = require('fs')
      .readFileSync(require('path').join(__dirname, '../../src/services/voice/voiceTools.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('memory?.recentTopics');
    expect(src).not.toContain('analytics?.weakAreas');
  });
});

describe('empty is reported as empty, never improvised', () => {
  it('returns empty lists rather than inventing activity for a brand-new student', async () => {
    const svc = require('../../src/services/studentContext.service').studentContextService;
    svc.aggregateContext.mockResolvedValueOnce({
      identity: { name: 'New' }, profile: { targetExam: 'SSC CGL' },
      memory: null, analytics: null, planner: null, notebooks: null,
    });
    const r: any = await call();
    expect(r.recentNotebooks).toEqual([]);
    expect(r.todayPlan).toEqual([]);
    expect(r.weakTopics).toEqual([]);
  });

  it('the tool description tells the model that empty means "I do not know"', () => {
    const decl: any = (VOICE_TOOL_DECLARATIONS as readonly any[])
      .find((d) => d.name === 'getStudentContext');
    expect(decl).toBeDefined();
    // Without this the model fills the gap conversationally, which is how an empty field became
    // an invented statement about a real student.
    expect(decl.description).toMatch(/empty list means you do not know/i);
    expect(decl.description).toMatch(/recentNotebooks/);
  });
});
