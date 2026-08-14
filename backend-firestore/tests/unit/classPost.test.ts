/**
 * Phase 3H: class posts — announcements and discussion, in one flat feed.
 *
 * `notificationService` is mocked at the module boundary (it writes to a per-user subcollection
 * this file has no reason to model) — what's exercised for real is every ownership and
 * visibility decision `classPostService` makes, using the same in-memory Firestore stand-in
 * pattern as the other class-scoped test suites.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = {
  classes: {}, classPosts: {}, classEnrollments: {},
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
function makeCollection(col: string) {
  const filters: [string, any][] = [];
  const q: any = {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, _op: string, value: any) { filters.push([field, value]); return q; },
    orderBy() { return q; },
    get: async () => ({
      docs: Object.values(store[col])
        .filter((d: any) => filters.every(([f, v]) => d[f] === v))
        .map((d: any) => ({ data: () => d })),
    }),
  };
  return q;
}

jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: { collection: (c: string) => makeCollection(c) },
}));

jest.mock('../../src/services/notification/notification.service', () => ({
  notificationService: { createNotification: jest.fn().mockResolvedValue(undefined) },
}));

import { classPostService } from '../../src/services/classPost.service';
import { notificationService } from '../../src/services/notification/notification.service';
import { MAX_POST_BODY } from '../../src/types/classPost';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const STUDENT_2 = 'student-2';
const OUTSIDER = 'outsider-1';
const CLASS = 'class-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = { id: CLASS, ownerUid: TEACHER, title: 'Maths', status: 'published', ...over };
}
function seedActive(uid: string, over: Record<string, any> = {}) {
  store.classEnrollments[`${CLASS}_${uid}`] = { classId: CLASS, studentUid: uid, teacherUid: TEACHER, state: 'ACTIVE', ...over };
}

beforeEach(() => {
  store.classes = {}; store.classPosts = {}; store.classEnrollments = {};
  autoId = 0;
  jest.clearAllMocks();
  (notificationService.createNotification as jest.Mock).mockResolvedValue(undefined);
});

describe('creating an announcement', () => {
  it('lets the owner post one', async () => {
    seedClass(); seedActive(STUDENT);
    const post = await classPostService.create(CLASS, TEACHER, { kind: 'announcement', title: 'Welcome', body: 'Class starts Monday.' });
    expect(post.kind).toBe('announcement');
    expect(post.authorRole).toBe('teacher');
    expect(post.parentId).toBeNull();
  });

  it('refuses a non-owner, even an ACTIVE member', async () => {
    seedClass(); seedActive(STUDENT);
    await expect(classPostService.create(CLASS, STUDENT, { kind: 'announcement', body: 'x' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('notifies every ACTIVE member except the poster', async () => {
    seedClass(); seedActive(STUDENT); seedActive(STUDENT_2); seedActive(TEACHER); // teacher is not really "active" via this doc, but proves self-exclusion by uid
    await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'Heads up.' });
    const notifiedUids = (notificationService.createNotification as jest.Mock).mock.calls.map((c) => c[0].userId);
    expect(notifiedUids.sort()).toEqual([STUDENT, STUDENT_2].sort());
    expect(notifiedUids).not.toContain(TEACHER);
  });

  it('rejects a blank body', async () => {
    seedClass();
    await expect(classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: '   ' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a body over the length cap', async () => {
    seedClass();
    await expect(classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'x'.repeat(MAX_POST_BODY + 1) }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects an unrecognised kind', async () => {
    seedClass();
    await expect(classPostService.create(CLASS, TEACHER, { kind: 'memo' as any, body: 'x' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('creating a discussion post', () => {
  it('lets an ACTIVE member post', async () => {
    seedClass(); seedActive(STUDENT);
    const post = await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'Question about topic 3.' });
    expect(post.authorRole).toBe('student');
  });

  it('lets the owner post too', async () => {
    seedClass();
    const post = await classPostService.create(CLASS, TEACHER, { kind: 'discussion', body: 'Anyone stuck?' });
    expect(post.authorRole).toBe('teacher');
  });

  it('refuses someone with no ACTIVE edge — NOT_FOUND, not FORBIDDEN, so class existence is not leaked', async () => {
    seedClass();
    await expect(classPostService.create(CLASS, OUTSIDER, { kind: 'discussion', body: 'x' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a student who has since left the class', async () => {
    seedClass(); seedActive(STUDENT, { state: 'LEFT' });
    await expect(classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'x' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('accepts a reply to an existing post in the same class', async () => {
    seedClass(); seedActive(STUDENT); seedActive(STUDENT_2);
    const original = await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'New material posted.' });
    const reply = await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'Thanks!', parentId: original.id });
    expect(reply.parentId).toBe(original.id);
  });

  it('notifies the parent post author on a reply, not the replier', async () => {
    seedClass(); seedActive(STUDENT);
    const original = await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'New material posted.' });
    (notificationService.createNotification as jest.Mock).mockClear();
    await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'Thanks!', parentId: original.id });
    expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
    expect((notificationService.createNotification as jest.Mock).mock.calls[0][0].userId).toBe(TEACHER);
  });

  it('does not notify when replying to your own post', async () => {
    seedClass(); seedActive(STUDENT);
    const original = await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'Starting a thread.' });
    (notificationService.createNotification as jest.Mock).mockClear();
    await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'Following up on my own post.', parentId: original.id });
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('rejects a parentId from another class', async () => {
    seedClass();
    store.classPosts['foreign-post'] = { id: 'foreign-post', classId: 'some-other-class', kind: 'discussion', authorUid: TEACHER, body: 'x' };
    await expect(classPostService.create(CLASS, TEACHER, { kind: 'discussion', body: 'x', parentId: 'foreign-post' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a parentId that does not exist', async () => {
    seedClass();
    await expect(classPostService.create(CLASS, TEACHER, { kind: 'discussion', body: 'x', parentId: 'does-not-exist' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('listing a class feed', () => {
  it('shows the owner everything', async () => {
    seedClass(); seedActive(STUDENT);
    await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'a' });
    await classPostService.create(CLASS, STUDENT, { kind: 'discussion', body: 'b' });
    const posts = await classPostService.listForClass(CLASS, TEACHER);
    expect(posts).toHaveLength(2);
  });

  it('shows an ACTIVE member the same feed', async () => {
    seedClass(); seedActive(STUDENT);
    await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'a' });
    const posts = await classPostService.listForClass(CLASS, STUDENT);
    expect(posts).toHaveLength(1);
  });

  it('the single most important test in this phase: excludes a student who has since left the class', async () => {
    seedClass(); seedActive(STUDENT);
    await classPostService.create(CLASS, TEACHER, { kind: 'announcement', body: 'a' });
    store.classEnrollments[`${CLASS}_${STUDENT}`].state = 'LEFT';
    await expect(classPostService.listForClass(CLASS, STUDENT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses an outsider with no relationship to the class', async () => {
    seedClass();
    await expect(classPostService.listForClass(CLASS, OUTSIDER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
