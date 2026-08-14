/**
 * Phase 3M: class sessions — live video attached to a class.
 *
 * The video provider is mocked at the module boundary (it's a network dependency to a vendor,
 * not something to exercise for real — same posture as Razorpay in classPurchase.test.ts). What's
 * under test is everything this phase's own service is responsible for: ownership, one-live-
 * session-at-a-time, per-role join info that never leaks the other role's code, and ACTIVE-
 * membership re-checked fresh on every join.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = {
  classes: {}, classSessions: {}, classEnrollments: {},
};

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any) => { store[col][id] = v; },
    update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
  };
}
let autoId = 0;
function makeCollection(col: string, filters: [string, any][] = [], limitN: number | null = null): any {
  return {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, _op: string, value: any) { return makeCollection(col, [...filters, [field, value]], limitN); },
    orderBy() { return makeCollection(col, filters, limitN); },
    limit(n: number) { return makeCollection(col, filters, n); },
    get: async () => {
      let docs = Object.values(store[col]).filter((d: any) => filters.every(([f, v]) => d[f] === v));
      if (limitN != null) docs = docs.slice(0, limitN);
      return { empty: docs.length === 0, docs: docs.map((d: any) => ({ data: () => d })) };
    },
  };
}

jest.mock('../../src/config/firebase', () => ({
  db: { collection: (c: string) => makeCollection(c) },
}));

const mockCreateRoom = jest.fn();
const mockEndRoom = jest.fn();
const mockIsConfigured = jest.fn();
const mockBuildJoinUrl = jest.fn((code: string) => `https://test.app.100ms.live/meeting/${code}`);
jest.mock('../../src/services/video', () => ({
  getVideoProvider: () => ({
    name: 'mock',
    isConfigured: mockIsConfigured,
    createRoom: mockCreateRoom,
    endRoom: mockEndRoom,
    buildJoinUrl: mockBuildJoinUrl,
  }),
}));

import { classSessionService } from '../../src/services/classSession.service';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const OUTSIDER = 'outsider-1';
const CLASS = 'class-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = { id: CLASS, ownerUid: TEACHER, title: 'Maths', status: 'published', ...over };
}
function seedActive(uid: string, over: Record<string, any> = {}) {
  store.classEnrollments[`${CLASS}_${uid}`] = { classId: CLASS, studentUid: uid, teacherUid: TEACHER, state: 'ACTIVE', ...over };
}
const ROOM_CODES = { teacher: 'code-teacher-xyz', student: 'code-student-abc' };

beforeEach(() => {
  store.classes = {}; store.classSessions = {}; store.classEnrollments = {};
  autoId = 0;
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockCreateRoom.mockResolvedValue({ providerRoomId: 'room_1', roomCodes: ROOM_CODES });
  mockEndRoom.mockResolvedValue(undefined);
});

describe('goLive', () => {
  it('lets the owner start a session', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER, 'Live doubt session');
    expect(session.status).toBe('live');
    expect(session.title).toBe('Live doubt session');
    expect(session.providerRoomId).toBe('room_1');
    expect(mockCreateRoom).toHaveBeenCalledWith(expect.objectContaining({ classId: CLASS, sessionId: session.id }));
  });

  it('defaults the title to the class title when none is given', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    expect(session.title).toBe('Maths');
  });

  it('refuses a non-owner', async () => {
    seedClass(); seedActive(STUDENT);
    await expect(classSessionService.goLive(CLASS, STUDENT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  it('refuses a second concurrent session on the same class', async () => {
    seedClass();
    const first = await classSessionService.goLive(CLASS, TEACHER);
    await expect(classSessionService.goLive(CLASS, TEACHER)).rejects.toMatchObject({ code: 'ALREADY_LIVE', sessionId: first.id });
    expect(mockCreateRoom).toHaveBeenCalledTimes(1);
  });

  it('allows a new session once the previous one has ended', async () => {
    seedClass();
    const first = await classSessionService.goLive(CLASS, TEACHER);
    await classSessionService.endSession(CLASS, first.id, TEACHER);
    const second = await classSessionService.goLive(CLASS, TEACHER);
    expect(second.id).not.toBe(first.id);
  });

  it('refuses when the video provider is not configured, without ever calling createRoom', async () => {
    mockIsConfigured.mockReturnValue(false);
    seedClass();
    await expect(classSessionService.goLive(CLASS, TEACHER)).rejects.toMatchObject({ code: 'VIDEO_NOT_CONFIGURED' });
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('ends a live session and calls the provider', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    const ended = await classSessionService.endSession(CLASS, session.id, TEACHER);
    expect(ended.status).toBe('ended');
    expect(mockEndRoom).toHaveBeenCalledWith('room_1');
  });

  it('refuses a non-owner', async () => {
    seedClass(); seedActive(STUDENT);
    const session = await classSessionService.goLive(CLASS, TEACHER);
    await expect(classSessionService.endSession(CLASS, session.id, STUDENT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('is idempotent — ending an already-ended session just returns it', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    await classSessionService.endSession(CLASS, session.id, TEACHER);
    mockEndRoom.mockClear();
    const again = await classSessionService.endSession(CLASS, session.id, TEACHER);
    expect(again.status).toBe('ended');
    expect(mockEndRoom).not.toHaveBeenCalled();
  });

  it('still marks the session ended even when the provider call fails', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    mockEndRoom.mockRejectedValue(new Error('provider down'));
    const ended = await classSessionService.endSession(CLASS, session.id, TEACHER);
    expect(ended.status).toBe('ended');
  });
});

describe('getJoinInfo', () => {
  it('the single most important test in this phase: never hands the teacher\'s code to a student', async () => {
    seedClass(); seedActive(STUDENT);
    const session = await classSessionService.goLive(CLASS, TEACHER);
    const teacherInfo = await classSessionService.getJoinInfo(CLASS, session.id, TEACHER);
    const studentInfo = await classSessionService.getJoinInfo(CLASS, session.id, STUDENT);
    expect(teacherInfo.role).toBe('teacher');
    expect(teacherInfo.roomCode).toBe(ROOM_CODES.teacher);
    expect(studentInfo.role).toBe('student');
    expect(studentInfo.roomCode).toBe(ROOM_CODES.student);
    expect(studentInfo.roomCode).not.toBe(teacherInfo.roomCode);
    expect(teacherInfo.joinUrl).toContain(ROOM_CODES.teacher);
    expect(studentInfo.joinUrl).toContain(ROOM_CODES.student);
  });

  it('refuses a non-member — NOT_FOUND, not FORBIDDEN, so the session\'s existence is not leaked', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    await expect(classSessionService.getJoinInfo(CLASS, session.id, OUTSIDER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a student who has since left the class', async () => {
    seedClass(); seedActive(STUDENT);
    const session = await classSessionService.goLive(CLASS, TEACHER);
    store.classEnrollments[`${CLASS}_${STUDENT}`].state = 'LEFT';
    await expect(classSessionService.getJoinInfo(CLASS, session.id, STUDENT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses to join a session that has ended', async () => {
    seedClass();
    const session = await classSessionService.goLive(CLASS, TEACHER);
    await classSessionService.endSession(CLASS, session.id, TEACHER);
    await expect(classSessionService.getJoinInfo(CLASS, session.id, TEACHER)).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });
});

describe('listForClass', () => {
  it('strips roomCodes from every entry, for the owner too', async () => {
    seedClass();
    await classSessionService.goLive(CLASS, TEACHER);
    const sessions = await classSessionService.listForClass(CLASS, TEACHER);
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as any).roomCodes).toBeUndefined();
  });

  it('shows an ACTIVE member the same list', async () => {
    seedClass(); seedActive(STUDENT);
    await classSessionService.goLive(CLASS, TEACHER);
    const sessions = await classSessionService.listForClass(CLASS, STUDENT);
    expect(sessions).toHaveLength(1);
  });

  it('refuses an outsider with no relationship to the class', async () => {
    seedClass();
    await expect(classSessionService.listForClass(CLASS, OUTSIDER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
