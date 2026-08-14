/**
 * Phase 3F: attaching a notebook to a class, and keeping notebook access in lockstep with
 * enrolment.
 *
 * Unlike the other service tests in this codebase, this one does NOT mock notebookService /
 * NotebookSharingService / notebookRepository — it lets them run for real against the same
 * in-memory `db` stand-in as classResourceRepository and classRepository. The value in this
 * phase is almost entirely in the WIRING between three previously-separate services (classes,
 * enrolment, notebooks), so a test that mocks the wiring away would verify nothing that
 * actually matters here.
 *
 * This works because every real module involved (`notebook.repository.ts` included) imports
 * `db` from the same `../config/firebase`, which is mocked below — so they all transparently
 * operate on one shared store. `notebook.repository.ts` also imports `Filter`/`FieldValue` from
 * `firebase-admin/firestore` directly; those are left unmocked deliberately, since they are pure
 * builder exports that need no live Firestore app and this test never exercises the one query
 * (`getNotebooksByUser`) that actually calls `Filter.or`.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

// notebook.service.ts imports uuid for createNotebook(), a method nothing here calls — but the
// import happens at module load regardless, and uuid's current build ships ESM-only, which
// Jest's default node_modules transform ignore can't parse. Mocked out rather than exercised.
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const store: Record<string, Record<string, any>> = {
  classes: {}, classResources: {}, classEnrollments: {}, notebooks: {},
};

let autoId = 0;

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any, opts?: { merge?: boolean }) => {
      store[col][id] = opts?.merge ? { ...(store[col][id] || {}), ...v } : v;
    },
    update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
    delete: async () => { delete store[col][id]; },
  };
}

function makeCollection(col: string) {
  const filters: [string, string, any][] = [];
  const q: any = {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, op: string, value: any) { filters.push([field, op, value]); return q; },
    orderBy() { return q; },
    limit() { return q; },
    get: async () => ({
      docs: Object.values(store[col])
        .filter((d: any) => filters.every(([f, , v]) => d[f] === v))
        .map((d: any) => ({ data: () => d })),
    }),
  };
  return q;
}

jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: { collection: (c: string) => makeCollection(c) },
}));

import { classResourceService } from '../../src/services/classResource.service';
import { NotebookSharingService } from '../../src/services/notebookSharing.service';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const CLASS = 'class-1';
const NOTEBOOK = 'nb-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = {
    id: CLASS, ownerUid: TEACHER, title: 'Maths', status: 'published',
    pricing: { type: 'free', amountINR: 0, currency: 'INR' },
    capacity: null, counts: { enrolled: 0 }, syllabus: [], ...over,
  };
}
function seedNotebook(id = NOTEBOOK, over: Record<string, any> = {}) {
  store.notebooks[id] = {
    id, owner: TEACHER, userId: TEACHER, title: 'Physics Notes',
    editors: [], viewers: [], auditLogs: [], ...over,
  };
}
function seedActiveEdge(studentUid = STUDENT, over: Record<string, any> = {}) {
  store.classEnrollments[`${CLASS}_${studentUid}`] = {
    id: `${CLASS}_${studentUid}`, classId: CLASS, studentUid, teacherUid: TEACHER,
    state: 'ACTIVE', source: 'invitation', activatedAt: '__ts__', blockedBy: null, ...over,
  };
}

beforeEach(() => {
  store.classes = {}; store.classResources = {}; store.classEnrollments = {}; store.notebooks = {};
  autoId = 0;
});

/* ── Attach ────────────────────────────────────────────────────────────────────────── */

describe('attach', () => {
  it('creates the resource and shares with every currently active student', async () => {
    seedClass(); seedNotebook(); seedActiveEdge();
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    expect(r.notebookId).toBe(NOTEBOOK);
    expect(r.classId).toBe(CLASS);
    expect(store.notebooks[NOTEBOOK].viewers).toContain(STUDENT);
  });

  it('defaults provenance to teacher_authored and title to the notebook title', async () => {
    seedClass(); seedNotebook(NOTEBOOK, { title: 'Chapter 4: Optics' });
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    expect(r.title).toBe('Chapter 4: Optics');
    expect(r.provenance).toEqual({ source: 'teacher_authored', createdBy: TEACHER });
  });

  it('honours an explicit title and a valid declared source', async () => {
    seedClass(); seedNotebook();
    const r = await classResourceService.attach(CLASS, TEACHER, {
      notebookId: NOTEBOOK, title: 'Custom title', source: 'licensed',
    });
    expect(r.title).toBe('Custom title');
    expect(r.provenance.source).toBe('licensed');
  });

  it('falls back to teacher_authored for an unrecognised source rather than storing garbage', async () => {
    seedClass(); seedNotebook();
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK, source: 'made_up' as any });
    expect(r.provenance.source).toBe('teacher_authored');
  });

  it('rejects a missing notebookId', async () => {
    seedClass();
    await expect(classResourceService.attach(CLASS, TEACHER, {})).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it("refuses a class the caller doesn't own", async () => {
    seedClass({ ownerUid: 'someone-else' }); seedNotebook();
    await expect(classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // The tighter check than notebookSharing's own — see the service's doc comment.
  it("refuses a notebook the caller doesn't own, even if merely shared with them", async () => {
    seedClass();
    seedNotebook(NOTEBOOK, { owner: 'someone-else', userId: 'someone-else', viewers: [TEACHER] });
    await expect(classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK }))
      .rejects.toMatchObject({ code: 'NOTEBOOK_NOT_OWNED' });
  });

  it('reports a nonexistent notebook distinctly from an unowned one', async () => {
    seedClass();
    await expect(classResourceService.attach(CLASS, TEACHER, { notebookId: 'ghost' }))
      .rejects.toMatchObject({ code: 'NOTEBOOK_NOT_FOUND' });
  });
});

/* ── List / visibility ─────────────────────────────────────────────────────────────── */

describe('listForClass', () => {
  it('shows the owner their resources', async () => {
    seedClass(); seedNotebook();
    await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    await expect(classResourceService.listForClass(CLASS, TEACHER)).resolves.toHaveLength(1);
  });

  it('shows an ACTIVE member the same list', async () => {
    seedClass(); seedNotebook(); seedActiveEdge();
    await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    await expect(classResourceService.listForClass(CLASS, STUDENT)).resolves.toHaveLength(1);
  });

  // Discoverability (published/active) answers "should I join", not "am I in" — a stranger
  // must not see the resource list of a class they have no relationship to.
  it('hides resources from a stranger even though the class is published', async () => {
    seedClass(); seedNotebook();
    await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    await expect(classResourceService.listForClass(CLASS, 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hides resources from a student who only REQUESTED and was not yet accepted', async () => {
    seedClass();
    store.classEnrollments[`${CLASS}_${STUDENT}`] = {
      classId: CLASS, studentUid: STUDENT, teacherUid: TEACHER, state: 'REQUESTED',
    };
    await expect(classResourceService.listForClass(CLASS, STUDENT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* ── Detach ────────────────────────────────────────────────────────────────────────── */

describe('detach', () => {
  it('revokes access from active students and removes the wrapper, but keeps the notebook', async () => {
    seedClass(); seedNotebook(); seedActiveEdge();
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    expect(store.notebooks[NOTEBOOK].viewers).toContain(STUDENT);

    await classResourceService.detach(CLASS, r.id, TEACHER);

    expect(store.classResources[r.id]).toBeUndefined();
    expect(store.notebooks[NOTEBOOK].viewers).not.toContain(STUDENT);
    expect(store.notebooks[NOTEBOOK]).toBeDefined(); // the notebook itself survives
  });

  it("refuses a non-owner", async () => {
    seedClass(); seedNotebook();
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    await expect(classResourceService.detach(CLASS, r.id, 'someone-else')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses when the resource belongs to a different class', async () => {
    seedClass(); seedNotebook();
    const r = await classResourceService.attach(CLASS, TEACHER, { notebookId: NOTEBOOK });
    await expect(classResourceService.detach('other-class', r.id, TEACHER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* ── Enrolment sync ────────────────────────────────────────────────────────────────── */

describe('syncAccessForEnrollment', () => {
  it('shares every attached resource when granted', async () => {
    seedClass(); seedNotebook('nb-1'); seedNotebook('nb-2', { title: 'Chemistry' });
    await classResourceService.attach(CLASS, TEACHER, { notebookId: 'nb-1' });
    await classResourceService.attach(CLASS, TEACHER, { notebookId: 'nb-2' });
    // No active edge existed at attach time, so the student was not shared yet.
    expect(store.notebooks['nb-1'].viewers).not.toContain(STUDENT);

    await classResourceService.syncAccessForEnrollment(CLASS, STUDENT, true);

    expect(store.notebooks['nb-1'].viewers).toContain(STUDENT);
    expect(store.notebooks['nb-2'].viewers).toContain(STUDENT);
  });

  it('revokes every attached resource when access is withdrawn', async () => {
    seedClass(); seedNotebook('nb-1'); seedNotebook('nb-2');
    await classResourceService.attach(CLASS, TEACHER, { notebookId: 'nb-1' });
    await classResourceService.attach(CLASS, TEACHER, { notebookId: 'nb-2' });
    await classResourceService.syncAccessForEnrollment(CLASS, STUDENT, true);

    await classResourceService.syncAccessForEnrollment(CLASS, STUDENT, false);

    expect(store.notebooks['nb-1'].viewers).not.toContain(STUDENT);
    expect(store.notebooks['nb-2'].viewers).not.toContain(STUDENT);
  });

  it('is a no-op, not a throw, for a class with no resources', async () => {
    seedClass();
    await expect(classResourceService.syncAccessForEnrollment(CLASS, STUDENT, true)).resolves.toBeUndefined();
  });

  it('is a no-op, not a throw, for a class that no longer exists', async () => {
    await expect(classResourceService.syncAccessForEnrollment('ghost-class', STUDENT, true)).resolves.toBeUndefined();
  });
});

/* ── notebookSharing.revokeAccess (the counterpart shareWithUser never had) ─────────── */

describe('NotebookSharingService.revokeAccess', () => {
  const sharing = new NotebookSharingService();

  it('is idempotent — revoking someone with no access is a no-op, not an error', async () => {
    seedNotebook();
    await expect(sharing.revokeAccess(NOTEBOOK, TEACHER, 'never-shared')).resolves.toBeUndefined();
  });

  it('removes the target from both viewers and editors defensively', async () => {
    seedNotebook(NOTEBOOK, { viewers: [STUDENT], editors: [STUDENT] });
    await sharing.revokeAccess(NOTEBOOK, TEACHER, STUDENT);
    expect(store.notebooks[NOTEBOOK].viewers).not.toContain(STUDENT);
    expect(store.notebooks[NOTEBOOK].editors).not.toContain(STUDENT);
  });

  it('throws if the caller does not own (or have access to) the notebook', async () => {
    seedNotebook(NOTEBOOK, { owner: 'someone-else', userId: 'someone-else' });
    await expect(sharing.revokeAccess(NOTEBOOK, TEACHER, STUDENT)).rejects.toThrow();
  });
});
