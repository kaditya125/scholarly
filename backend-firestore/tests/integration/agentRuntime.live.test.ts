/**
 * LIVE integration test for Agent mode — opt-in, never part of the default suite.
 *
 * It talks to the real Firestore project configured in .env and runs the real retrieval tools
 * against production data. It writes agent_runs, user_usage and chat_sessions documents for two
 * synthetic users (ids prefixed `agent-live-`) and deletes every one of them afterwards — only ids
 * it created, and only after checking they belong to the synthetic users.
 *
 *   AGENT_LIVE_TEST=1 DISABLE_WORKERS=true REDIS_URL= \
 *     node --experimental-vm-modules ./node_modules/jest/bin/jest.js -c jest.live.config.js --runInBand
 *
 * (jest.live.config.js transpiles without typechecking, because several modules in the route's
 * import graph have long-standing type errors that would otherwise fail the suite before it runs.)
 *
 * Only Firebase ID-token verification is replaced (an `x-test-uid` header stands in for a verified
 * token, so no Auth account is created). Routes, controller, the production runtime wiring
 * (getAgentRuntime), the Firestore run store, the quota meter, the tool registry and the tools are
 * the code paths production uses. A second runtime built from the same parts covers what the
 * production wiring cannot be steered into: cross-instance cancellation, an unregistered tool,
 * a plan over budget, and crash recovery.
 */
import express from 'express';
import request from 'supertest';
import type { Firestore } from 'firebase-admin/firestore';
import type { AgentEvent, AgentRunDoc } from '../../src/agents/runtime/agent.types';
import type { AgentRuntime } from '../../src/agents/runtime/AgentRuntime';
import type { WorkflowTemplate } from '../../src/agents/workflows/WorkflowTemplate';

jest.mock('uuid', () => jest.requireActual('../helpers/uuidCjs'));
// Chat generates a session title with Gemini for short conversations: stubbed, rather than spend a
// real model call on a test title. The agent's own model calls (Phase 6's question writer and
// answer checker, labelled `agent_*`) are what golden case 2 tests, so those reach the real model.
jest.mock('../../src/services/ai/gemini.provider', () => {
  const actual = jest.requireActual('../../src/services/ai/gemini.provider');
  return {
    GeminiProvider: jest.fn().mockImplementation((...args: any[]) => {
      const real = new actual.GeminiProvider(...args);
      return {
        generateResponse: (history: any, system: any, opts: any) =>
          String(opts?.operation ?? '').startsWith('agent_') ? real.generateResponse(history, system, opts) : Promise.resolve({ reply: 'Agent live test' }),
      };
    }),
  };
});
jest.mock('../../src/middlewares/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { uid };
    next();
  },
}));

const LIVE = process.env.AGENT_LIVE_TEST === '1';
const describeLive = LIVE ? describe : describe.skip;

const TAG = `agent-live-${Date.now().toString(36)}`;
const USER_A = `${TAG}-a`;
const USER_B = `${TAG}-b`;
const SESSION_A = `${TAG}-session-a`;
const GOAL = 'Give me an overview of the SSC CGL exam';
const EXAM_TOOLS = ['resolve_exam_id', 'get_exam_syllabus', 'get_exam_pattern_analytics'];

const createdRunIds = new Set<string>();

interface SseFrame {
  id?: number;
  event?: string;
  data?: any;
}

function parseSse(body: string): SseFrame[] {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(':'))
    .map((block) => {
      const frame: SseFrame = {};
      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) frame.id = Number(line.slice(4));
        else if (line.startsWith('event: ')) frame.event = line.slice(7);
        else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
      }
      return frame;
    });
}

const waitFor = async <T>(probe: () => Promise<T | undefined>, timeoutMs: number, what: string): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

describeLive('Agent mode — live against real Firestore and real retrieval tools', () => {
  let app: express.Express;
  let db: Firestore;
  let firebaseApp: { delete(): Promise<void> };

  const sse = (path: string, uid: string, lastEventId?: string) =>
    new Promise<{ status: number; frames: SseFrame[]; raw: string }>((resolve, reject) => {
      const r = request(app).get(path).set('x-test-uid', uid);
      if (lastEventId) r.set('Last-Event-ID', lastEventId);
      r.buffer(true)
        .parse((res, cb) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c: string) => (body += c));
          res.on('end', () => cb(null, body));
        })
        .end((err, res) => (err ? reject(err) : resolve({ status: res.status, frames: parseSse(String(res.body)), raw: String(res.body) })));
    });

  const usageDocs = async (uid: string) => {
    const { FieldPath } = require('firebase-admin/firestore');
    const snap = await db
      .collection('user_usage')
      .where(FieldPath.documentId(), '>=', `${uid}_`)
      .where(FieldPath.documentId(), '<', `${uid}_`)
      .get();
    return snap.docs;
  };
  const agentRunsCharged = async (uid: string) =>
    (await usageDocs(uid)).reduce((n, d) => n + Number(d.data().agentRuns || 0), 0);

  beforeAll(async () => {
    process.env.AGENT_MODE_ENABLED = 'true';
    process.env.AGENT_ARTIFACTS_ENABLED = 'true';
    const firebase = require('../../src/config/firebase');
    db = firebase.db;
    firebaseApp = firebase.firebaseApp;
    const agentRoutes = require('../../src/routes/agent.routes').default;
    app = express();
    // The production server's limit (server.ts): a chat turn can carry a PDF, base64-encoded.
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/agent', agentRoutes);
    // Phase 6: the student takes an agent's quiz through the existing quiz routes and grader, and
    // attaches a document through the real chat stream endpoint.
    app.use('/api/quiz', require('../../src/routes/quiz.routes').default);
    app.use('/api/chat', require('../../src/routes/chat.routes').default);

    await db.collection('chat_sessions').doc(SESSION_A).set({
      sessionId: SESSION_A,
      userId: USER_A,
      topicType: 'TEACHER',
      model: 'agent-live-test',
      title: 'Agent live test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Loading the real route graph (agent + quiz routes and everything they import) on a cold
    // transpile cache can take over a minute on its own.
  }, 180_000);

  afterAll(async () => {
    const owned = (data: any) => typeof data?.userId === 'string' && data.userId.startsWith(TAG);
    const leftovers: string[] = [];
    for (const uid of [USER_A, USER_B]) {
      const runs = await db.collection('agent_runs').where('userId', '==', uid).get();
      runs.docs.forEach((d) => createdRunIds.add(d.id));
    }
    for (const runId of createdRunIds) {
      const ref = db.collection('agent_runs').doc(runId);
      const snap = await ref.get();
      if (snap.exists && owned(snap.data())) await db.recursiveDelete(ref);
      else if (snap.exists) leftovers.push(`agent_runs/${runId} (not owned by the test users — left alone)`);
    }
    for (const uid of [USER_A, USER_B]) {
      for (const d of await usageDocs(uid)) await d.ref.delete();
    }
    const session = db.collection('chat_sessions').doc(SESSION_A);
    const sessionSnap = await session.get();
    if (sessionSnap.exists && owned(sessionSnap.data())) await db.recursiveDelete(session);

    // Artifacts own files in Cloud Storage; deleteForUser removes both.
    const { getArtifactsService } = require('../../src/agents/artifacts/artifacts.service');
    for (const uid of [USER_A, USER_B]) {
      const mine = await db.collection('artifacts').where('userId', '==', uid).get();
      for (const d of mine.docs) await getArtifactsService().deleteForUser(d.id, uid);
      const left = await db.collection('artifacts').where('userId', '==', uid).get();
      if (!left.empty) leftovers.push(`${left.size} artifacts for ${uid}`);
    }

    // Phase 6: quizzes are real quiz attempts, and grading one rolls into the student's stats doc;
    // an attached document is kept as the student's upload (a record plus stored text).
    const { getAgentUploadsService } = require('../../src/agents/uploads/agentUploads.service');
    for (const uid of [USER_A, USER_B]) {
      const attempts = await db.collection('quiz_attempts').where('userId', '==', uid).get();
      for (const d of attempts.docs) if (owned(d.data())) await d.ref.delete();
      const stats = db.collection('user_stats').doc(uid);
      if ((await stats.get()).exists) await stats.delete();
      const uploads = await db.collection('agent_uploads').where('userId', '==', uid).get();
      for (const d of uploads.docs) await getAgentUploadsService().deleteForUser(uid, d.id);
    }

    // Prove the cleanup: nothing of the synthetic users remains.
    for (const uid of [USER_A, USER_B]) {
      const runs = await db.collection('agent_runs').where('userId', '==', uid).get();
      if (!runs.empty) leftovers.push(`${runs.size} agent_runs for ${uid}`);
      const usage = await usageDocs(uid);
      if (usage.length) leftovers.push(`${usage.length} user_usage docs for ${uid}`);
      const attempts = await db.collection('quiz_attempts').where('userId', '==', uid).get();
      if (!attempts.empty) leftovers.push(`${attempts.size} quiz_attempts for ${uid}`);
      if ((await db.collection('user_stats').doc(uid).get()).exists) leftovers.push(`user_stats/${uid}`);
      const uploads = await db.collection('agent_uploads').where('userId', '==', uid).get();
      if (!uploads.empty) leftovers.push(`${uploads.size} agent_uploads for ${uid}`);
    }
    if ((await session.get()).exists) leftovers.push(`chat_sessions/${SESSION_A}`);
    delete process.env.AGENT_MODE_ENABLED;
    delete process.env.AGENT_ARTIFACTS_ENABLED;
    await firebaseApp.delete();
    expect(leftovers).toEqual([]);
    // Each artifact's deletion also removes its stored file; a full Phase 6 run leaves a dozen or more.
  }, 600_000);

  describe('HTTP API with the production runtime wiring', () => {
    let runId = '';
    let frames: SseFrame[] = [];
    let run: AgentRunDoc;

    it('hides the whole API while the flag is off', async () => {
      process.env.AGENT_MODE_ENABLED = 'false';
      const r = await request(app).post('/api/agent/runs').set('x-test-uid', USER_A).send({ goal: GOAL });
      process.env.AGENT_MODE_ENABLED = 'true';
      expect(r.status).toBe(404);
    });

    it('lists the exam_overview workflow and the registered tools as metadata only', async () => {
      const w = await request(app).get('/api/agent/workflows').set('x-test-uid', USER_A);
      expect(w.status).toBe(200);
      // The document-producing workflows appear only because this suite switches artifacts on.
      expect(w.body.workflows.map((x: any) => x.id).sort()).toEqual([
        'chapter_briefing',
        'chapter_handout',
        'chapter_revision_notes',
        'document_study_pack',
        'exam_overview',
        'exam_prep',
        'flashcards_from_artifact',
        'formula_chart',
        'mock_test',
        'pyq_practice',
        'question_set',
        'quiz_from_artifact',
        'quiz_mistake_analysis',
        'revision_plan',
        'tests_analysis',
        'weak_area_quiz',
      ]);
      const t = await request(app).get('/api/agent/tools').set('x-test-uid', USER_A);
      const names = t.body.tools.map((x: any) => x.name);
      expect(names).toEqual(expect.arrayContaining(EXAM_TOOLS));
      expect(JSON.stringify(t.body)).not.toMatch(/"execute"/);
    });

    it("refuses to attach a run to another student's chat session, before charging anything", async () => {
      const r = await request(app).post('/api/agent/runs').set('x-test-uid', USER_B).send({ goal: GOAL, sessionId: SESSION_A });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('SESSION_FORBIDDEN');
      expect(await agentRunsCharged(USER_B)).toBe(0);
      expect((await db.collection('agent_runs').where('userId', '==', USER_B).get()).empty).toBe(true);
    }, 30_000);

    it('answers 422 for a goal no workflow can do yet, without charging quota', async () => {
      const r = await request(app).post('/api/agent/runs').set('x-test-uid', USER_A).send({ goal: 'Create flashcards on osmosis' });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe('NO_AGENT_WORKFLOW');
      expect(await agentRunsCharged(USER_A)).toBe(0);
    }, 30_000);

    it('runs the exam overview end to end: real tools, persisted run, one quota unit', async () => {
      const start = await request(app).post('/api/agent/runs').set('x-test-uid', USER_A).send({ goal: GOAL, sessionId: SESSION_A });
      expect(start.status).toBe(202);
      expect(start.body).toMatchObject({ workflowId: 'exam_overview', status: 'queued' });
      runId = start.body.runId;
      createdRunIds.add(runId);

      const stream = await sse(start.body.eventsUrl, USER_A);
      expect(stream.status).toBe(200);
      frames = stream.frames;
      const seqs = frames.map((f) => f.id);
      expect(seqs).toEqual(seqs.map((_, i) => i + 1)); // contiguous from 1, nothing lost or duplicated
      expect(frames[0].event).toBe('agent.started');
      expect(frames.at(-1)!.event).toBe('agent.completed');
      const planReady = frames.find((f) => f.event === 'agent.plan_ready')!;
      expect(planReady.data.data.steps.map((s: any) => s.id)).toEqual(['resolve_exam', 'syllabus', 'pattern']);
      for (const f of frames) {
        expect(f.data.runId).toBe(runId);
        expect(f.data.seq).toBe(f.id);
      }

      const got = await request(app).get(`/api/agent/runs/${runId}`).set('x-test-uid', USER_A);
      expect(got.status).toBe(200);
      run = got.body;
      expect(run.status).toBe('completed');
      expect(run.lease).toBeUndefined();
      expect(['success', 'partial']).toContain(run.result!.outcome);
      expect(run.result!.summary.length).toBeGreaterThan(0);
      expect(run.steps.find((s) => s.id === 'resolve_exam')!.status).toBe('completed');

      // Budget: every meter stayed inside the limits the run was created with.
      expect(run.usage.toolCalls).toBeLessThanOrEqual(run.budget.maxToolCalls);
      expect(run.usage.steps).toBeLessThanOrEqual(run.budget.maxSteps);
      expect(run.usage.elapsedMs).toBeLessThanOrEqual(run.budget.maxExecutionMs);
      expect(run.usage.costUsd).toBeLessThanOrEqual(run.budget.maxCostUsd);

      expect(await agentRunsCharged(USER_A)).toBe(1);

      // What the corpus actually produced this time — the assertions above accept success or
      // partial, so print the shape of the answer instead of leaving it to guesswork.
      console.log('[live] exam overview run:', {
        outcome: run.result!.outcome,
        steps: run.steps.map((s) => `${s.id}=${s.status}`).join(' '),
        toolCalls: run.usage.toolCalls,
        elapsedMs: run.usage.elapsedMs,
        costUsd: run.usage.costUsd,
        summary: run.result!.summary.slice(0, 400),
      });
    }, 240_000);

    it('backs every completed step with a real, recorded tool invocation', async () => {
      const calls = (await db.collection('agent_runs').doc(runId).collection('tool_calls').get()).docs.map((d) => d.data());
      expect(calls.length).toBe(run.usage.toolCalls);
      for (const c of calls) expect(EXAM_TOOLS).toContain(c.tool);
      for (const step of run.steps.filter((s) => s.status === 'completed')) {
        expect(calls.some((c) => c.stepId === step.id && c.tool === step.tool && c.status === 'ok')).toBe(true);
      }
      const toolEvents = frames.filter((f) => f.event === 'agent.tool.completed').length;
      expect(toolEvents).toBe(calls.filter((c) => c.status === 'ok').length);

      const resolved = await db.collection('agent_runs').doc(runId).collection('step_outputs').doc('resolve_exam').get();
      expect(resolved.exists).toBe(true);
      const examId = JSON.parse(resolved.data()!.json).examId;
      expect(typeof examId).toBe('string'); // SSC CGL is in the verified corpus
    }, 30_000);

    it('replays exactly the events after Last-Event-ID', async () => {
      const resumed = await sse(`/api/agent/runs/${runId}/events`, USER_A, '3');
      expect(resumed.frames.map((f) => f.id)).toEqual(frames.filter((f) => f.id! > 3).map((f) => f.id));
      expect(resumed.frames.map((f) => f.event)).toEqual(frames.filter((f) => f.id! > 3).map((f) => f.event));
    }, 30_000);

    it("posts the run's summary into the student's own chat session", async () => {
      const message = await waitFor(
        async () => {
          const snap = await db.collection('chat_sessions').doc(SESSION_A).collection('messages').get();
          return snap.docs.map((d) => d.data()).find((m) => m.agentRunId === runId);
        },
        10_000,
        'the chat summary message',
      );
      expect(message).toMatchObject({ role: 'ai', content: run.result!.summary });
    }, 30_000);

    it('never shows one student another student’s run', async () => {
      for (const [method, path] of [
        ['get', `/api/agent/runs/${runId}`],
        ['get', `/api/agent/runs/${runId}/events`],
        ['post', `/api/agent/runs/${runId}/cancel`],
      ] as const) {
        const r = await (request(app) as any)[method](path).set('x-test-uid', USER_B);
        expect(r.status).toBe(404);
      }
      const listB = await request(app).get('/api/agent/runs').set('x-test-uid', USER_B);
      expect(listB.body.runs.map((r: any) => r.runId)).not.toContain(runId);
      const listA = await request(app).get('/api/agent/runs').set('x-test-uid', USER_A);
      expect(listA.body.runs.map((r: any) => r.runId)).toContain(runId);
    }, 30_000);
  });

  // Phase 2 "done when": "Laws of Motion, Class 11" resolves to its chapter with its sections,
  // knowledge-graph neighbours and existing assets — through tools only, with no model call.
  describe('curriculum chapter briefing (Phase 2)', () => {
    const CURRICULUM_TOOLS = ['resolve_curriculum_chapter', 'get_chapter_knowledge_graph', 'get_chapter_assets'];

    it('hides web_research while its flag is off', async () => {
      const t = await request(app).get('/api/agent/tools').set('x-test-uid', USER_A);
      const names = t.body.tools.map((x: any) => x.name);
      expect(names).toEqual(expect.arrayContaining(CURRICULUM_TOOLS));
      expect(names).not.toContain('web_research');
    });

    it('resolves "Laws of Motion, Class 11 Physics" to the real chapter and briefs it from the corpus', async () => {
      const start = await request(app)
        .post('/api/agent/runs')
        .set('x-test-uid', USER_A)
        .send({ goal: 'Brief me on Laws of Motion, Class 11 Physics' });
      expect(start.status).toBe(202);
      expect(start.body.workflowId).toBe('chapter_briefing'); // routed by the goal, not named by the caller
      const runId = start.body.runId;
      createdRunIds.add(runId);

      const stream = await sse(start.body.eventsUrl, USER_A);
      expect(stream.frames.at(-1)!.event).toBe('agent.completed');

      const got = await request(app).get(`/api/agent/runs/${runId}`).set('x-test-uid', USER_A);
      const run: AgentRunDoc = got.body;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');

      const chapter = (run.result!.data as any)?.chapter;
      expect(chapter.notebookId).toBe('ncert-c11-physics');
      expect(chapter.chapterName).toMatch(/laws of motion/i);
      expect(chapter.confidence).toBeGreaterThanOrEqual(0.9);
      // The file is numbered, not named: the resolver must have used the chapter's metadata.
      expect(chapter.chapterTitle).toMatch(/Chapter 4/);

      expect(run.result!.summary).toMatch(/Laws of Motion/i);
      expect(run.result!.summary).toMatch(/Sections in this chapter/);

      const calls = (await db.collection('agent_runs').doc(runId).collection('tool_calls').get()).docs.map((d) => d.data());
      expect(calls.map((c) => c.tool).sort()).toEqual([...CURRICULUM_TOOLS].sort());
      expect(calls.every((c) => c.status === 'ok')).toBe(true);

      console.log('[live] chapter briefing:', {
        chapter: chapter.chapterName,
        confidence: chapter.confidence,
        graph: (run.result!.data as any)?.graph,
        assets: (run.result!.data as any)?.assets,
        elapsedMs: run.usage.elapsedMs,
        summary: run.result!.summary.slice(0, 400),
      });
    }, 240_000);

    it('asks which chapter is meant instead of briefing the wrong one', async () => {
      const start = await request(app)
        .post('/api/agent/runs')
        .set('x-test-uid', USER_A)
        .send({ goal: 'Tell me about motion, Class 11 Physics' });
      expect(start.status).toBe(202);
      createdRunIds.add(start.body.runId);
      await sse(start.body.eventsUrl, USER_A);

      const got = await request(app).get(`/api/agent/runs/${start.body.runId}`).set('x-test-uid', USER_A);
      const run: AgentRunDoc = got.body;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('no_result');
      expect(run.result!.summary).toMatch(/couldn't pin down which chapter/i);
      // It offers real chapters from the book rather than inventing options.
      expect((run.result!.data as any).alternatives.length).toBeGreaterThan(1);
      console.log('[live] ambiguous chapter:', run.result!.summary.slice(0, 300));
    }, 240_000);
  });

  // Phase 4 "done when": a run started from Chat shows live steps and opens its artifact.
  // This drives the real chat service (the path POST /api/chat/stream takes) in Agent mode.
  describe('agent run started from chat, producing a document (Phase 4)', () => {
    it('turns "Make a PDF on Laws of Motion, Class 11 Physics" into a stored handout the student owns', async () => {
      const { ChatService } = require('../../src/services/chat.service');
      const { getAgentRuntime } = require('../../src/agents');

      const writes: any[] = [];
      const res: any = {
        headersSent: true,
        writableEnded: false,
        write: (s: string) => {
          const m = /^data: (.*)\n\n$/s.exec(s);
          if (m) writes.push(m[1] === '[DONE]' ? '[DONE]' : JSON.parse(m[1]));
        },
        end: () => {
          res.writableEnded = true;
        },
        status: () => res,
        json: () => res,
      };
      await new ChatService().processChatStream(
        USER_A,
        SESSION_A,
        'Make a PDF on Laws of Motion, Class 11 Physics',
        'gemini',
        'TEACHER',
        res,
        undefined,
        undefined,
        undefined,
        false,
        { executionMode: 'agent' },
      );

      // The chat stream hands over to the agent and returns at once.
      const handoff = writes.find((w) => w?.type === 'agent_run');
      expect(handoff).toMatchObject({ workflowId: 'chapter_handout' });
      expect(writes.at(-1)).toBe('[DONE]');
      const runId: string = handoff.runId;
      createdRunIds.add(runId);

      await getAgentRuntime().waitForRun(runId);
      const run = (await db.collection('agent_runs').doc(runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      expect(run.artifactIds).toHaveLength(1);
      const artifactId = run.artifactIds[0];

      // Every step is a real tool call, in plan order, all succeeded.
      const calls = (await db.collection('agent_runs').doc(runId).collection('tool_calls').get()).docs.map((d) => d.data());
      expect(calls.map((c) => c.tool).sort()).toEqual(
        ['compose_chapter_handout', 'create_document_artifact', 'get_chapter_assets', 'get_chapter_knowledge_graph', 'resolve_curriculum_chapter'].sort(),
      );
      expect(calls.every((c) => c.status === 'ok')).toBe(true);

      // The workspace can open the document the moment it exists: the stream announces it.
      const events = (await db.collection('agent_runs').doc(runId).collection('events').orderBy('seq').get()).docs.map((d) => d.data());
      const ready = events.find((e) => e.type === 'agent.artifact.ready');
      expect(ready?.data?.artifactId).toBe(artifactId);
      expect(events.indexOf(ready!)).toBeLessThan(events.findIndex((e) => e.type === 'agent.completed'));

      // The document: built from the chapter, owned by the student, served only to them.
      const stored = (await db.collection('artifacts').doc(artifactId).get()).data() as any;
      expect(stored.userId).toBe(USER_A);
      expect(stored.title).toMatch(/laws of motion/i);
      expect(stored.spec.sections.map((s: any) => s.heading)).toContain('What this chapter covers');
      expect(JSON.stringify(stored.spec)).not.toMatch(/"type":"formulae"/); // unchecked formulae stay out
      const file = await request(app).get(`/api/agent/artifacts/${artifactId}/file`).set('x-test-uid', USER_A).buffer(true);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect((await request(app).get(`/api/agent/artifacts/${artifactId}/file`).set('x-test-uid', USER_B)).status).toBe(404);

      // Chat history: the reply that started the run carries its id (so a reload re-attaches the
      // card), and the run's own summary is marked so the card is not shown twice.
      const messages = await waitFor(
        async () => {
          const snap = await db.collection('chat_sessions').doc(SESSION_A).collection('messages').get();
          const mine = snap.docs.map((d) => d.data()).filter((m) => m.agentRunId === runId);
          return mine.length >= 2 ? mine : undefined;
        },
        15_000,
        'the handoff and summary chat messages',
      );
      expect(messages.find((m) => !m.agentRunSummary)).toMatchObject({ role: 'ai' });
      expect(messages.find((m) => m.agentRunSummary)).toMatchObject({ role: 'ai', content: run.result!.summary });

      console.log('[live] chat-started handout:', {
        workflowId: run.workflowId,
        pages: stored.versions[0].pageCount,
        bytes: stored.versions[0].sizeBytes,
        sections: stored.spec.sections.map((s: any) => `${s.heading} (${s.blocks[0].items?.length ?? 0})`),
        elapsedMs: run.usage.elapsedMs,
        summary: run.result!.summary,
      });
    }, 240_000);
  });

  // Phase 5 — the brief's FINAL ACCEPTANCE TEST, both steps, through the real chat service:
  //   "Prepare a formula chart for Class 11 Physics Laws of Motion."
  //   "Create flashcards from this formula chart."  (must reuse the chart, not rebuild it)
  describe('acceptance test: verified formula chart, then flashcards that reuse it (Phase 5)', () => {
    let chartId = '';
    let chartSpec: any;

    const chat = async (message: string) => {
      const { ChatService } = require('../../src/services/chat.service');
      const writes: any[] = [];
      const res: any = {
        headersSent: true,
        writableEnded: false,
        write: (s: string) => {
          const m = /^data: (.*)\n\n$/s.exec(s);
          if (m) writes.push(m[1] === '[DONE]' ? '[DONE]' : JSON.parse(m[1]));
        },
        end: () => {
          res.writableEnded = true;
        },
        status: () => res,
        json: () => res,
      };
      await new ChatService().processChatStream(USER_A, SESSION_A, message, 'gemini', 'TEACHER', res, undefined, undefined, undefined, false, {
        executionMode: 'agent',
      });
      return writes.find((w) => w?.type === 'agent_run');
    };
    const toolCalls = async (runId: string) =>
      (await db.collection('agent_runs').doc(runId).collection('tool_calls').get()).docs.map((d) => d.data());

    it('Prepare a formula chart for Class 11 Physics Laws of Motion.', async () => {
      const { getAgentRuntime } = require('../../src/agents');
      const handoff = await chat('Prepare a formula chart for Class 11 Physics Laws of Motion.');
      expect(handoff).toMatchObject({ workflowId: 'formula_chart' });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);

      const run = (await db.collection('agent_runs').doc(handoff.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');

      // Plan → real tool calls, in the brief's order: context, content, KG, extract, verify, structure, render.
      const calls = await toolCalls(handoff.runId);
      expect(calls.map((c) => c.tool).sort()).toEqual(
        [
          'resolve_curriculum_chapter',
          'get_chapter_knowledge_graph',
          'get_chapter_assets',
          'extract_chapter_formulae',
          'verify_formulae_against_chapter',
          'compose_formula_chart',
          'create_document_artifact',
        ].sort(),
      );
      expect(calls.every((c) => c.status === 'ok')).toBe(true);

      // artifact.ready was emitted (the workspace opens on it).
      const events = (await db.collection('agent_runs').doc(handoff.runId).collection('events').orderBy('seq').get()).docs.map((d) => d.data());
      expect(events.some((e) => e.type === 'agent.artifact.ready' && e.data?.artifactId === run.artifactIds[0])).toBe(true);

      // The chart: verified formulae only, every one cited to its page.
      chartId = run.artifactIds[0];
      const stored = (await db.collection('artifacts').doc(chartId).get()).data() as any;
      chartSpec = stored.spec;
      expect(stored.title).toBe('Laws of Motion — Formula Chart');
      const formulae = chartSpec.sections.flatMap((s: any) => s.blocks).filter((b: any) => b.type === 'formulae').flatMap((b: any) => b.items);
      expect(formulae.length).toBeGreaterThanOrEqual(15);
      for (const f of formulae) expect(f.note).toMatch(/p\. \d+ of the chapter PDF/);
      expect(formulae.map((f: any) => f.formula)).toEqual(expect.arrayContaining(['F = ma', 'p = mv']));
      const verifyOutput = JSON.parse(
        (await db.collection('agent_runs').doc(handoff.runId).collection('step_outputs').doc('verify').get()).data()!.json,
      );
      const rejected = new Set(verifyOutput.rejected.map((r: any) => r.formula));
      for (const f of formulae) expect(rejected.has(f.formula)).toBe(false);

      // Stored PDF, owner-only.
      const file = await request(app).get(`/api/agent/artifacts/${chartId}/file`).set('x-test-uid', USER_A).buffer(true);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect((await request(app).get(`/api/agent/artifacts/${chartId}/file`).set('x-test-uid', USER_B)).status).toBe(404);

      console.log('[live] formula chart:', {
        verified: verifyOutput.verified.length,
        rejected: verifyOutput.rejected.length,
        pages: stored.versions[0].pageCount,
        sections: chartSpec.sections.map((s: any) => s.heading),
        elapsedMs: run.usage.elapsedMs,
        summary: run.result!.summary,
      });
    }, 300_000);

    it('Create flashcards from this formula chart. — reusing it, with no retrieval', async () => {
      expect(chartId).toBeTruthy();
      const { getAgentRuntime } = require('../../src/agents');
      const handoff = await chat('Create flashcards from this formula chart.');
      expect(handoff).toMatchObject({ workflowId: 'flashcards_from_artifact' });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);

      const run = (await db.collection('agent_runs').doc(handoff.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');

      // Reuse, proven by what did NOT run: no chapter lookup, no graph, no assets, no verification.
      const calls = await toolCalls(handoff.runId);
      expect(calls.map((c) => c.tool).sort()).toEqual(
        ['compose_flashcards_from_document', 'create_flashcards_artifact', 'find_my_latest_document'].sort(),
      );

      const deckId = run.artifactIds[0];
      expect(deckId).toBeTruthy();
      expect(deckId).not.toBe(chartId); // the chart looked up is not announced as new
      const deck = (await db.collection('artifacts').doc(deckId).get()).data() as any;
      expect(deck).toMatchObject({ kind: 'flashcards', userId: USER_A, versions: [] });
      expect(deck.spec.sourceArtifactId).toBe(chartId);

      // Every formula card's answer is a formula from the chart — nothing new was introduced.
      const chartFormulae = new Set(
        chartSpec.sections.flatMap((s: any) => s.blocks).filter((b: any) => b.type === 'formulae').flatMap((b: any) => b.items.map((i: any) => i.formula)),
      );
      const formulaCards = deck.spec.cards.filter((c: any) => c.kind === 'formula');
      expect(formulaCards.length).toBeGreaterThan(0);
      for (const c of formulaCards) expect(chartFormulae.has(c.back)).toBe(true);

      // The deck is the student's alone, and has no file.
      const meta = await request(app).get(`/api/agent/artifacts/${deckId}`).set('x-test-uid', USER_A);
      expect(meta.status).toBe(200);
      expect(meta.body).toMatchObject({ kind: 'flashcards', cardCount: deck.spec.cards.length });
      expect(meta.body.fileUrl).toBeUndefined();
      expect((await request(app).get(`/api/agent/artifacts/${deckId}`).set('x-test-uid', USER_B)).status).toBe(404);

      console.log('[live] flashcards from the chart:', {
        cards: deck.spec.cards.length,
        kinds: [...new Set(deck.spec.cards.map((c: any) => c.kind))],
        elapsedMs: run.usage.elapsedMs,
        toolCalls: calls.map((c) => c.tool),
        summary: run.result!.summary,
      });
    }, 180_000);

    // ── Phase 6: the rest of §60 — quiz, mistake analysis, revision plan ──────────────────────
    let quizArtifactId = '';
    let attemptId = '';
    let reportId = '';
    let weakTopic = '';
    const finished = async (message: string, workflowId: string) => {
      const { getAgentRuntime } = require('../../src/agents');
      const handoff = await chat(message);
      expect(handoff).toMatchObject({ workflowId });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);
      const run = (await db.collection('agent_runs').doc(handoff.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      return { run, runId: handoff.runId as string, calls: await toolCalls(handoff.runId) };
    };

    it('Create a 20-question quiz from it. — reusing the chart, saved as a real quiz attempt', async () => {
      expect(chartId).toBeTruthy();
      const { run, runId, calls } = await finished('Create a 20-question quiz from it.', 'quiz_from_artifact');
      expect(run.result!.outcome).toBe('success');
      // Reuse again: no chapter lookup, no retrieval, no model.
      expect(calls.map((c) => c.tool).sort()).toEqual(['compose_quiz_from_document', 'create_quiz_artifact', 'find_my_study_material']);

      quizArtifactId = run.artifactIds[0];
      const quiz = (await db.collection('artifacts').doc(quizArtifactId).get()).data() as any;
      expect(quiz).toMatchObject({ kind: 'quiz', userId: USER_A, versions: [] });
      expect(quiz.spec).toMatchObject({ sourceArtifactId: chartId, questionCount: 20 });
      expect(JSON.stringify(quiz.spec)).not.toMatch(/correctAnswerIndex/); // the artifact never holds the key
      attemptId = quiz.spec.attemptId;

      // The questions live in the student's own quiz attempt, and every answer is the chart's entry.
      const stored = (await db.collection('quiz_attempts').doc(attemptId).get()).data() as any;
      expect(stored).toMatchObject({ userId: USER_A, status: 'in-progress', totalQuestions: 20, source: 'topic' });
      const blocks = chartSpec.sections.flatMap((s: any) => s.blocks);
      const formulae: string[] = blocks.filter((b: any) => b.type === 'formulae').flatMap((b: any) => b.items.map((i: any) => i.formula));
      const glossary: string[] = blocks.filter((b: any) => b.type === 'keyValue').flatMap((b: any) => b.items.flatMap((i: any) => [i.label, ...i.value.split(/\s+—\s+/)]));
      for (const q of stored.questions) {
        const answer = q.options[q.correctAnswerIndex];
        const fromChart = formulae.includes(answer) || formulae.some((f) => f.endsWith(answer)) || glossary.some((g) => g === answer);
        expect({ question: q.text, answer, fromChart }).toMatchObject({ fromChart: true });
        expect(q.questionOrigin).toBe('CURRICULUM_SYNTHESIZED');
        expect(new Set(q.options).size).toBe(4);
      }

      // The existing quiz route serves it to its owner with the key masked, and to nobody else.
      const masked = await request(app).get(`/api/quiz/attempts/${attemptId}`).set('x-test-uid', USER_A);
      expect(masked.status).toBe(200);
      expect(masked.body.questions.every((q: any) => q.correctAnswerIndex === -1 && q.explanation === '')).toBe(true);
      expect((await request(app).get(`/api/quiz/attempts/${attemptId}`).set('x-test-uid', USER_B)).status).toBe(404);
      // Nor do the run's events or step summaries carry the key.
      const events = (await db.collection('agent_runs').doc(runId).collection('events').get()).docs.map((d) => d.data());
      expect(JSON.stringify(events)).not.toMatch(/correctAnswerIndex/);

      console.log('[live] quiz from the chart:', {
        questions: stored.totalQuestions,
        topics: quiz.spec.topics,
        validation: quiz.spec.validation,
        elapsedMs: run.usage.elapsedMs,
      });
    }, 120_000);

    it('Analyze my quiz mistakes … — declines while the quiz has not been submitted', async () => {
      const { run } = await finished('Analyze my quiz mistakes and tell me what I should revise.', 'quiz_mistake_analysis');
      expect(run.result!.outcome).toBe('no_result');
      expect(run.result!.summary).toMatch(/haven't submitted/);
      expect(run.artifactIds).toEqual([]);
    }, 120_000);

    it('the student takes the quiz, and the existing grader scores it', async () => {
      const stored = (await db.collection('quiz_attempts').doc(attemptId).get()).data() as any;
      // Every question on the best-covered formula topic answered wrongly, the rest correctly.
      const counts = new Map<string, number>();
      for (const q of stored.questions) if (q.topic !== 'Symbols and SI units') counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
      weakTopic = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const answers: Record<string, number> = {};
      for (const q of stored.questions) answers[q.id] = q.topic === weakTopic ? (q.correctAnswerIndex + 1) % 4 : q.correctAnswerIndex;
      const wrong = stored.questions.filter((q: any) => q.topic === weakTopic).length;

      const r = await request(app).post(`/api/quiz/attempts/${attemptId}/submit`).set('x-test-uid', USER_A).send({ answers, timeSpentSeconds: 600 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'completed', correctCount: 20 - wrong, incorrectCount: wrong, accuracy: Math.round(((20 - wrong) / 20) * 100) });
      expect(r.body.weakTopics).toEqual([weakTopic]);
    }, 60_000);

    it('Analyze my quiz mistakes and tell me what I should revise.', async () => {
      const { run, calls } = await finished('Analyze my quiz mistakes and tell me what I should revise.', 'quiz_mistake_analysis');
      expect(run.result!.outcome).toBe('success');
      expect(calls.map((c) => c.tool).sort()).toEqual(['analyze_performance', 'create_report_artifact', 'find_my_latest_quiz_result']);

      reportId = run.artifactIds[0];
      const report = (await db.collection('artifacts').doc(reportId).get()).data() as any;
      expect(report).toMatchObject({ kind: 'report', userId: USER_A });
      const area = report.spec.weakAreas.find((w: any) => w.topic === weakTopic);
      expect(area).toMatchObject({ accuracy: 0, correct: 0 });
      // It points back to the chart's pages for that topic.
      expect(area.refs?.length).toBeGreaterThan(0);
      expect(area.refs.every((r: any) => typeof r.page === 'number')).toBe(true);
      expect(report.spec.mistakes).toHaveLength(area.total);
      expect(report.spec.sourceArtifactIds).toEqual([chartId]);
      expect(run.result!.summary).toContain(weakTopic);
      console.log('[live] mistake analysis:', { weakAreas: report.spec.weakAreas.map((w: any) => `${w.topic} ${w.correct}/${w.total}`), refs: area.refs, summary: run.result!.summary });
    }, 120_000);

    it('Create a revision plan for those weak areas.', async () => {
      const { run, calls } = await finished('Create a revision plan for those weak areas.', 'revision_plan');
      expect(run.result!.outcome).toBe('success');
      expect(calls.map((c) => c.tool).sort()).toEqual(['build_revision_plan', 'create_studyplan_artifact', 'find_my_latest_analysis']);

      const plan = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(plan).toMatchObject({ kind: 'studyplan', userId: USER_A });
      expect(plan.spec.sourceArtifactId).toBe(reportId);
      expect(plan.spec.days).toHaveLength(7);
      for (const day of plan.spec.days) expect(day.tasks.reduce((n: number, t: any) => n + t.minutes, 0)).toBeLessThanOrEqual(plan.spec.dailyMinutes);
      const tasks = plan.spec.days.flatMap((d: any) => d.tasks);
      expect(tasks.filter((t: any) => t.topic === weakTopic && t.kind === 'revise')).toHaveLength(1);
      expect(tasks.some((t: any) => t.topic === weakTopic && t.kind !== 'revise' && t.kind !== 'practice')).toBe(true);
      expect(tasks.find((t: any) => t.topic === weakTopic && t.kind === 'revise').ref).toMatch(/of the chapter/);
      console.log('[live] revision plan:', { title: plan.spec.title, days: plan.spec.days.map((d: any) => `${d.date}: ${d.tasks.map((t: any) => t.title).join(' | ')}`) });
    }, 120_000);

    it('Quiz me on my weak areas — only those topics, from the same chart', async () => {
      const { run } = await finished('Quiz me on my weak areas', 'weak_area_quiz');
      expect(run.result!.outcome).toBe('success');
      const quiz = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(quiz.spec.sourceArtifactId).toBe(chartId);
      const stored = (await db.collection('quiz_attempts').doc(quiz.spec.attemptId).get()).data() as any;
      expect(new Set(stored.questions.map((q: any) => q.topic))).toEqual(new Set([weakTopic]));
      expect(stored.source).toBe('weak-areas');
    }, 120_000);
  });

  // Phase 6 — golden case 3, over attempts anchored to the real NEET syllabus graph.
  describe('golden case 3: last 5 tests → weakness analysis → syllabus mapping → revision plan (Phase 6)', () => {
    it('Analyze my last 5 tests and create a revision plan.', async () => {
      const { getAgentRuntime } = require('../../src/agents');
      const { syllabusGraphService } = require('../../src/services/exam/syllabusGraph.service');
      const { quizAttemptsService } = require('../../src/services/tests/quizAttempts.service');
      const nodes: any[] = await syllabusGraphService.getSyllabusNodes({ examId: 'NEET_UG' });
      const cellTheory = nodes.find((n) => /^Cell theory and cell as the basic unit of life/i.test(String(n.label)));
      const cellDivision = nodes.find((n) => /Cell division: Cell cycle, mitosis, meiosis/i.test(String(n.label)));
      expect(cellTheory && cellDivision).toBeTruthy();

      // Two quizzes USER_B took, graded by the real grader. Test fixtures, not real questions.
      const q = (i: number, node: any, topic: string) => ({
        id: `g3_${i}`,
        text: `Live-test fixture question ${i} (${topic})`,
        topic,
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
        explanation: 'fixture',
        examId: 'NEET_UG',
        syllabusNodeId: node.id,
        identityStatus: 'CANONICAL',
        questionOrigin: 'GENERAL_KNOWLEDGE',
      });
      for (const [n, wrongCell] of [[0, 4], [1, 3]] as const) {
        const questions = [...Array.from({ length: 5 }, (_, i) => q(n * 10 + i, cellTheory, 'Cell structure')), ...Array.from({ length: 5 }, (_, i) => q(n * 10 + 5 + i, cellDivision, 'Cell division'))];
        const attempt = await quizAttemptsService.createFromQuestions(USER_B, questions, { title: `NEET cell practice ${n + 1}`, source: 'topic', mode: 'exam' });
        const answers: Record<string, number> = {};
        questions.forEach((x, i) => (answers[x.id] = i < wrongCell ? 1 : 0)); // the first `wrongCell` cell-structure answers wrong
        const graded = await request(app).post(`/api/quiz/attempts/${attempt.id}/submit`).set('x-test-uid', USER_B).send({ answers });
        expect(graded.status).toBe(200);
      }

      // USER_B has no chat session of its own; start the run the way the chat branch does.
      const { routeGoal } = require('../../src/agents/runtime/GoalRouter');
      const goal = 'Analyze my last 5 tests and create a revision plan.';
      const decision = routeGoal(goal, { explicitAgent: true });
      expect(decision).toMatchObject({ mode: 'agent', workflowId: 'tests_analysis' });
      const started = await getAgentRuntime().startRun({ userId: USER_B, goal, workflowId: decision.workflowId, source: 'api' });
      createdRunIds.add(started.runId);
      await getAgentRuntime().waitForRun(started.runId);
      const run = (await db.collection('agent_runs').doc(started.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      const calls = (await db.collection('agent_runs').doc(started.runId).collection('tool_calls').get()).docs.map((d) => d.data().tool);
      expect(calls.sort()).toEqual(
        ['build_revision_plan', 'create_report_artifact', 'create_studyplan_artifact', 'analyze_performance', 'get_my_test_history', 'map_weak_areas_to_syllabus'].sort(),
      );

      const artifacts = (await db.collection('artifacts').where('userId', '==', USER_B).get()).docs.map((d) => d.data() as any);
      const report = artifacts.find((a) => a.kind === 'report');
      const plan = artifacts.find((a) => a.kind === 'studyplan');
      // Test history: both attempts; weakness: cell structure 2/10 (weak), cell division 10/10 (strong).
      expect(report.spec.basis.attempts).toHaveLength(2);
      expect(report.spec.weakAreas).toEqual([
        expect.objectContaining({ topic: 'Cell structure', correct: 3, total: 10, accuracy: 30, examId: 'NEET_UG', syllabusNodeId: cellTheory.id, syllabusMatch: 'exact' }),
      ]);
      // Syllabus mapping: the real NEET path, from the questions' own syllabus node.
      expect(report.spec.weakAreas[0].syllabusPath.join(' › ')).toMatch(/BIOLOGY › UNIT 3: Cell Structure and Function › Cell theory/);
      expect(report.spec.strongAreas).toEqual([expect.objectContaining({ topic: 'Cell division', accuracy: 100 })]);
      // Study plan for that weak area.
      expect(plan.spec.sourceArtifactId).toBe(report.artifactId);
      expect(plan.spec.days.flatMap((d: any) => d.tasks).some((t: any) => t.topic === 'Cell structure' && t.kind === 'revise')).toBe(true);
      console.log('[live] golden case 3:', { weakAreas: report.spec.weakAreas, plan: plan.spec.title, summary: run.result!.summary });
    }, 180_000);
  });

  // Phase 6 — golden case 2, with real generation: the one live test here that spends model money
  // (about three US cents: writing plus the independent solver).
  describe('golden case 2: 30 NEET Biology questions from Cell Structure (Phase 6)', () => {
    it('Create 30 NEET Biology questions from Cell Structure.', async () => {
      const { ChatService } = require('../../src/services/chat.service');
      const { getAgentRuntime } = require('../../src/agents');
      const writes: any[] = [];
      const res: any = {
        headersSent: true,
        writableEnded: false,
        write: (s: string) => {
          const m = /^data: (.*)\n\n$/s.exec(s);
          if (m && m[1] !== '[DONE]') writes.push(JSON.parse(m[1]));
        },
        end: () => (res.writableEnded = true),
        status: () => res,
        json: () => res,
      };
      await new ChatService().processChatStream(USER_A, SESSION_A, 'Create 30 NEET Biology questions from Cell Structure.', 'gemini', 'TEACHER', res, undefined, undefined, undefined, false, {
        executionMode: 'agent',
      });
      const handoff = writes.find((w) => w?.type === 'agent_run');
      expect(handoff).toMatchObject({ workflowId: 'question_set' });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);

      const run = (await db.collection('agent_runs').doc(handoff.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      const calls = (await db.collection('agent_runs').doc(handoff.runId).collection('tool_calls').get()).docs.map((d) => d.data().tool);
      // Syllabus retrieval, topic retrieval, generation, validation, duplicate detection, quiz artifact.
      expect(calls.sort()).toEqual(
        [
          'resolve_exam_topic',
          'resolve_curriculum_chapter',
          'read_chapter_sections',
          'plan_question_blueprint',
          'find_verified_past_questions',
          'generate_grounded_questions',
          'validate_questions',
          'detect_duplicate_questions',
          'create_quiz_artifact',
        ].sort(),
      );
      expect(run.usage.costUsd).toBeLessThan(0.05);

      const quiz = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(quiz).toMatchObject({ kind: 'quiz', userId: USER_A });
      expect(quiz.spec.questionCount).toBeGreaterThanOrEqual(20);
      expect(quiz.spec.questionCount).toBeLessThanOrEqual(30);
      expect(quiz.spec.topics.length).toBeGreaterThanOrEqual(5);
      const stored = (await db.collection('quiz_attempts').doc(quiz.spec.attemptId).get()).data() as any;

      // The core claim, checked independently: every quoted sentence really is in the chapter.
      const outputs = (await db.collection('agent_runs').doc(handoff.runId).collection('step_outputs').doc('chapter').get()).data()!;
      const chapter = JSON.parse(outputs.json);
      expect(chapter).toMatchObject({ resolved: true, notebookId: 'ncert-c11-biology' });
      expect(chapter.chapterName).toMatch(/cell: the unit of life/i);
      const { loadChapterPages } = require('../../src/agents/tools/adapters/chapterText');
      const { evidenceKey } = require('../../src/agents/tools/adapters/grounded');
      const text = evidenceKey((await loadChapterPages(chapter.notebookId, chapter.sourceId)).pages.map((p: any) => p.text).join('\n'));
      for (const q of stored.questions) {
        expect(new Set(q.options).size).toBe(4);
        if (q.questionOrigin === 'AUTHENTIC_PYQ') {
          expect(q.sourceYear).toBeTruthy(); // only past-year questions with a verified source get here
          continue;
        }
        expect(q).toMatchObject({ questionOrigin: 'CURRICULUM_SYNTHESIZED', identityStatus: 'UNANCHORED', examId: 'NEET_UG' });
        const quote = /The chapter says: “(.+?)”/.exec(q.explanation)?.[1];
        expect(quote && text.includes(evidenceKey(quote))).toBe(true);
      }
      expect(run.result!.summary).toMatch(/Syllabus:\*\* NEET UG › BIOLOGY › UNIT 3: Cell Structure and Function/);
      console.log('[live] golden case 2:', {
        questions: stored.totalQuestions,
        topics: quiz.spec.topics,
        validation: quiz.spec.validation,
        costUsd: run.usage.costUsd,
        elapsedMs: run.usage.elapsedMs,
        sample: stored.questions.slice(0, 2).map((q: any) => ({ q: q.text, answer: q.options[q.correctAnswerIndex], explanation: q.explanation })),
        summary: run.result!.summary,
      });
    }, 360_000);
  });

  // Phase 6 — golden case 4, through the real chat stream endpoint with a real PDF attached (an
  // NCERT chapter from the curriculum bucket, standing in for the student's own file).
  describe('golden case 4: an uploaded PDF → revision notes + flashcards + quiz (Phase 6)', () => {
    it('Read this uploaded PDF and create revision notes + flashcards + quiz.', async () => {
      const { getAgentRuntime } = require('../../src/agents');
      const { notebookRepository } = require('../../src/repositories/notebook.repository');
      const { firebaseApp } = require('../../src/config/firebase');
      const { env } = require('../../src/config/env');
      const source = ((await notebookRepository.getSources('ncert-c11-biology')) as any[]).find((s) => /Chapter 8(\.pdf)?$/i.test(String(s.title)));
      const storagePath: string = source?.storagePath || String(source?.gcsPath ?? '').replace(/^gs:\/\/[^/]+\//, '');
      expect(storagePath).toBeTruthy();
      const bucket = env.FIREBASE_STORAGE_BUCKET ? firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET) : firebaseApp.storage().bucket();
      const [pdf] = await bucket.file(storagePath).download();

      const GOAL = 'Read this uploaded PDF and create revision notes + flashcards + quiz.';
      const stream = await request(app)
        .post('/api/chat/stream')
        .set('x-test-uid', USER_A)
        .send({
          sessionId: SESSION_A,
          message: GOAL,
          model: 'gemini',
          topicType: 'TEACHER',
          executionMode: 'agent',
          attachments: [{ name: 'Cell - The Unit of Life.pdf', mimeType: 'application/pdf', data: Buffer.from(pdf).toString('base64') }],
        })
        .buffer(true)
        .parse((res, cb) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c: string) => (body += c));
          res.on('end', () => cb(null, body));
        });
      expect(stream.status).toBe(200);
      const frames = String(stream.body)
        .split('\n\n')
        .map((b) => /^data: (.*)$/s.exec(b.trim())?.[1])
        .filter((d): d is string => Boolean(d) && d !== '[DONE]')
        .map((d) => JSON.parse(d));
      const handoff = frames.find((f) => f.type === 'agent_run');
      expect(handoff).toMatchObject({ workflowId: 'document_study_pack' });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);

      const run = (await db.collection('agent_runs').doc(handoff.runId).get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      // The goal is what was typed — not the PDF's text flattened into it.
      expect(run.goal).toBe(GOAL);
      expect(run.context?.uploadIds).toHaveLength(1);
      const upload = (await db.collection('agent_uploads').doc(run.context!.uploadIds![0]).get()).data() as any;
      expect(upload).toMatchObject({ userId: USER_A, name: 'Cell - The Unit of Life.pdf' });

      const calls = (await db.collection('agent_runs').doc(handoff.runId).collection('tool_calls').get()).docs.map((d) => d.data().tool);
      // Document retrieval, parallel generation of the three, artifact creation of the three.
      expect(calls.sort()).toEqual(
        ['read_my_document', 'write_revision_notes', 'write_document_flashcards', 'write_document_quiz', 'create_document_artifact', 'create_flashcards_artifact', 'create_quiz_artifact'].sort(),
      );
      const started = (await db.collection('agent_runs').doc(handoff.runId).collection('events').orderBy('seq').get()).docs
        .map((d) => d.data())
        .filter((e) => e.type === 'agent.step.started')
        .map((e) => e.stepId);
      // The three writers start before any of them has finished: they run in parallel.
      expect(started.slice(1, 4).sort()).toEqual(['cards', 'notes', 'quiz']);
      expect(run.usage.costUsd).toBeLessThan(0.05);

      const artifacts = (await Promise.all(run.artifactIds.map((id) => db.collection('artifacts').doc(id).get()))).map((d) => d.data() as any);
      expect(artifacts.map((a) => a.kind).sort()).toEqual(['document', 'flashcards', 'quiz']);
      expect(artifacts.every((a) => a.userId === USER_A)).toBe(true);

      // Every quiz answer is quoted from the document the student attached.
      const { getAgentUploadsService } = require('../../src/agents/uploads/agentUploads.service');
      const { evidenceKey } = require('../../src/agents/tools/adapters/grounded');
      const text = evidenceKey((await getAgentUploadsService().read(USER_A, upload.uploadId)).pages.map((p: any) => p.text).join('\n'));
      const quiz = artifacts.find((a) => a.kind === 'quiz');
      const attempt = (await db.collection('quiz_attempts').doc(quiz.spec.attemptId).get()).data() as any;
      for (const q of attempt.questions) {
        const quote = /Your document says: “(.+?)”/.exec(q.explanation)?.[1];
        expect(quote && text.includes(evidenceKey(quote))).toBe(true);
      }
      const deck = artifacts.find((a) => a.kind === 'flashcards');
      const notes = artifacts.find((a) => a.kind === 'document');
      console.log('[live] golden case 4:', {
        notes: { pages: notes.versions[0].pageCount, sections: notes.spec.sections.length, points: notes.spec.sections.reduce((n: number, s: any) => n + s.blocks[0].items.length, 0) },
        cards: deck.spec.cards.length,
        quiz: attempt.totalQuestions,
        costUsd: run.usage.costUsd,
        elapsedMs: run.usage.elapsedMs,
        summary: run.result!.summary,
      });
    }, 420_000);
  });

  // Phase 6 — past-year question practice against the real question bank. Nothing is generated:
  // every question served must be a real paper's, and each is re-checked here from Firestore.
  describe('past-year question practice (Phase 6)', () => {
    const runGoal = async (goal: string) => {
      const { routeGoal } = require('../../src/agents/runtime/GoalRouter');
      const { getAgentRuntime } = require('../../src/agents');
      const decision = routeGoal(goal, { explicitAgent: true });
      expect(decision).toMatchObject({ mode: 'agent', workflowId: 'pyq_practice' });
      const started = await getAgentRuntime().startRun({ userId: USER_A, goal, workflowId: decision.workflowId, source: 'api' });
      createdRunIds.add(started.runId);
      await getAgentRuntime().waitForRun(started.runId);
      const run = (await db.collection('agent_runs').doc(started.runId).get()).data() as AgentRunDoc;
      const calls = (await db.collection('agent_runs').doc(started.runId).collection('tool_calls').get()).docs.map((d) => d.data().tool);
      const found = JSON.parse((await db.collection('agent_runs').doc(started.runId).collection('step_outputs').doc('find').get()).data()?.json ?? 'null');
      return { run, calls, found };
    };

    it('Give me JEE Main 2023 Physics PYQs. — real papers only, each question traced to its source', async () => {
      const { run, calls, found } = await runGoal('Give me JEE Main 2023 Physics PYQs');
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      expect(calls.sort()).toEqual(['create_quiz_artifact', 'find_verified_past_year_questions']);
      expect(run.usage.costUsd).toBe(0); // nothing generated

      const quiz = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(quiz).toMatchObject({ kind: 'quiz', userId: USER_A });
      expect(quiz.spec.questionCount).toBeGreaterThanOrEqual(10);
      expect(quiz.spec.questionCount).toBeLessThanOrEqual(20);
      const attempt = (await db.collection('quiz_attempts').doc(quiz.spec.attemptId).get()).data() as any;
      expect(attempt.source).toBe('pyq-paper');

      // Independently of the tool: fetch each question's source record and each source's sitting.
      const sittings = new Map<string, any[]>();
      for (const q of attempt.questions) {
        expect(q).toMatchObject({ questionOrigin: 'AUTHENTIC_PYQ', examId: 'JEE_MAIN', sourceYear: 2023 });
        const snap = await db.collection('pyq_questions').where('questionId', '==', q.sourcePyqId).limit(1).get();
        const src = snap.docs[0]?.data() as any;
        expect(src).toBeTruthy();
        expect(src).toMatchObject({ origin: 'authentic_import', corpusBucket: 'OFFICIAL_PYQ', verificationStatus: 'OFFICIAL_CONFIRMED', sourceType: 'TIER_A_OFFICIAL', subject: 'Physics', year: 2023 });
        expect(['ARCHIVED_DUPLICATE', 'QUARANTINED']).not.toContain(src.ingestionState);
        expect(String(src.sourceId)).not.toMatch(/_nta$/); // the machine-written set measured on 26 Sep
        expect('ABCD'.indexOf(String(src.correctAnswer).toUpperCase())).toBe(q.correctAnswerIndex);
        expect(q.options).toHaveLength(4);
        expect(`${q.text} ${q.options.join(' ')}`).not.toMatch(/<img|<br|<p>|<span/i);
        if (!sittings.has(src.sourceId)) {
          const all = (await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').where('year', '==', 2023).where('shift', '==', src.shift).get()).docs.map((d) => d.data() as any);
          sittings.set(src.sourceId, all.filter((r) => r.sourceId === src.sourceId));
        }
      }
      // A real paper's key spreads across A–D: no source served here answers mostly one letter.
      for (const [sourceId, rows] of sittings) {
        const letters = rows.map((r) => String(r.correctAnswer).toUpperCase()).filter((a) => /^[A-D]$/.test(a));
        const top = Math.max(...['A', 'B', 'C', 'D'].map((l) => letters.filter((a) => a === l).length));
        expect(letters.length).toBeGreaterThanOrEqual(12);
        expect(top / letters.length).toBeLessThan(0.75);
        console.log('[live] PYQ source', sourceId, { lettered: letters.length, topShare: Math.round((top / letters.length) * 100) });
      }
      expect(found.excluded.implausible_answer_key ?? 0).toBeGreaterThan(0); // the machine-written set was seen and refused
      expect(run.result!.summary).toMatch(/Sadhya hasn't re-checked them against the key file/);

      // The student can take it: the masked attempt hides the answers and explanations.
      const masked = await request(app).get(`/api/quiz/attempts/${quiz.spec.attemptId}`).set('x-test-uid', USER_A);
      expect(masked.status).toBe(200);
      expect(masked.body.questions.every((q: any) => q.correctAnswerIndex === -1 && q.explanation === '')).toBe(true);
      console.log('[live] PYQ practice:', {
        questions: attempt.totalQuestions,
        sittings: found.sittings,
        excluded: found.excluded,
        checked: found.checked,
        elapsedMs: run.usage.elapsedMs,
        sample: attempt.questions.slice(0, 2).map((q: any) => ({ q: q.text.slice(0, 160), answer: q.options[q.correctAnswerIndex], topic: q.topic })),
        summary: run.result!.summary,
      });
    }, 180_000);

    it.each([
      ['Give me NEET 2022 Biology PYQs', 'template'],
      ['Give me SSC CGL 2023 PYQs', 'answers_not_officially_verified'],
    ])('%s — says honestly that nothing passes, and makes no quiz', async (goal, reason) => {
      const before = (await db.collection('artifacts').where('userId', '==', USER_A).get()).size;
      const { run, calls, found } = await runGoal(goal);
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('no_result');
      expect(calls).toEqual(['find_verified_past_year_questions']);
      expect(found.questions).toBeUndefined();
      expect(found.checked).toBeGreaterThan(0);
      expect(found.excluded[reason]).toBeGreaterThan(0);
      expect(run.result!.summary).toMatch(/none passes the checks for a real past paper/);
      expect((await db.collection('artifacts').where('userId', '==', USER_A).get()).size).toBe(before);
      console.log('[live] PYQ refusal:', goal, { checked: found.checked, excluded: found.excluded });
    }, 180_000);
  });

  // Phase 7 — golden case 5, through the real chat service in Agent mode. The planner model may
  // propose the steps (about a US cent); the plan itself is computed, and checked here against the
  // official syllabus read independently.
  describe('golden case 5: Prepare me for SSC CGL in 90 days (Phase 7)', () => {
    it('Prepare me for SSC CGL in 90 days.', async () => {
      const { ChatService } = require('../../src/services/chat.service');
      const { getAgentRuntime } = require('../../src/agents');
      const { examMasterService } = require('../../src/services/exam/examMaster.service');
      const { todayIn, addDays } = require('../../src/agents/tools/adapters/plan.adapter');
      const writes: any[] = [];
      const res: any = {
        headersSent: true,
        writableEnded: false,
        write: (s: string) => {
          const m = /^data: (.*)\n\n$/s.exec(s);
          if (m && m[1] !== '[DONE]') writes.push(JSON.parse(m[1]));
        },
        end: () => (res.writableEnded = true),
        status: () => res,
        json: () => res,
      };
      await new ChatService().processChatStream(USER_A, SESSION_A, 'Prepare me for SSC CGL in 90 days.', 'gemini', 'TEACHER', res, undefined, undefined, undefined, false, { executionMode: 'agent' });
      const handoff = writes.find((w) => w?.type === 'agent_run');
      expect(handoff).toMatchObject({ workflowId: 'exam_prep' });
      createdRunIds.add(handoff.runId);
      await getAgentRuntime().waitForRun(handoff.runId);

      const runRef = db.collection('agent_runs').doc(handoff.runId);
      const run = (await runRef.get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      expect(['model', 'template']).toContain(run.planSource);
      const calls = (await runRef.collection('tool_calls').get()).docs.map((d) => d.data().tool);
      for (const tool of ['resolve_exam_goal', 'get_exam_structure', 'build_exam_prep_plan', 'create_studyplan_artifact']) expect(calls).toContain(tool);
      expect(run.usage.costUsd).toBeLessThan(0.05);

      const doc = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(doc).toMatchObject({ kind: 'studyplan', userId: USER_A });
      const spec = doc.spec;
      const today = todayIn();
      // Exam identification, time calculation.
      expect(spec.exam).toMatchObject({ examId: 'SSC_CGL' });
      expect(spec.horizon).toEqual({ days: 90, endDate: addDays(today, 89), source: 'goal' });
      expect(spec.startDate).toBe(today);
      // Study plan with weekly milestones: 13 weeks in three phases, this week day by day.
      expect(spec.weeks).toHaveLength(13);
      expect(spec.weeks.map((w: any) => w.phase)).toEqual([...Array(8).fill('learn'), ...Array(3).fill('practise'), ...Array(2).fill('revise')]);
      expect(spec.days).toHaveLength(7);
      for (const d of spec.days) expect(d.tasks.reduce((n: number, t: any) => n + t.minutes, 0)).toBeLessThanOrEqual(spec.dailyMinutes);
      // Practice strategy, with the pattern the syllabus records.
      expect(spec.weeks[8].milestone).toContain('25 questions in 15 minutes per subject, as in Tier-I');
      expect(spec.weeks[11].milestone).toContain('Tier-I pattern: 100 questions in 60 minutes');
      expect(spec.strategy.map((s: any) => s.title)).toEqual(expect.arrayContaining(['Every day', 'Every week', 'Timed practice', 'Full-length tests', 'Past papers']));

      // Independently of the tools: the official syllabus as stored.
      const syllabus = await examMasterService.getCurrentSyllabus('SSC_CGL');
      expect(spec.sources[0].url).toBe(syllabus.sourceDocumentUrl);
      const tier1 = syllabus.nodes.find((n: any) => n.name === 'Tier-I');
      expect(tier1).toMatchObject({ questionCount: 100, durationMinutes: 60 });
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const official: string[] = [];
      const walk = (n: any) => {
        official.push(norm(String(n.name)));
        (n.children ?? []).forEach(walk);
      };
      syllabus.nodes.forEach(walk);
      const text = official.join(' | ');
      // Every topic in the plan is worded as the notice words it — none invented.
      const topics: string[] = spec.weeks.flatMap((w: any) => w.focus.flatMap((f: any) => f.units));
      expect(topics.length).toBeGreaterThan(20);
      for (const t of topics) expect(text.includes(norm(t.replace(/…$/, '')))).toBe(true);
      // The placeholder "official notification" dates (sourceDocumentHash of an empty file) are not used.
      expect(JSON.stringify(spec)).not.toMatch(/2026-09-1[5-9]|2026-09-2[0-6]|2026-12-1[0-3]/);
      expect(run.result!.summary).toMatch(/\*\*Time:\*\* 90 days/);
      console.log('[live] golden case 5:', {
        planSource: run.planSource,
        planNotes: run.planNotes,
        steps: run.plan?.steps.map((s) => s.tool),
        costUsd: run.usage.costUsd,
        elapsedMs: run.usage.elapsedMs,
        outlook: spec.outlook,
        week1: spec.weeks[0].milestone,
        summary: run.result!.summary,
      });
    }, 300_000);
  });

  // Phase 6 — a mock test is one real paper's multiple-choice part, re-checked here from Firestore.
  describe('mock test from a real paper (Phase 6)', () => {
    const runMock = async (goal: string) => {
      const { routeGoal } = require('../../src/agents/runtime/GoalRouter');
      const { getAgentRuntime } = require('../../src/agents');
      const decision = routeGoal(goal, { explicitAgent: true });
      expect(decision).toMatchObject({ mode: 'agent', workflowId: 'mock_test' });
      const started = await getAgentRuntime().startRun({ userId: USER_A, goal, workflowId: decision.workflowId, source: 'api' });
      createdRunIds.add(started.runId);
      await getAgentRuntime().waitForRun(started.runId);
      const runRef = db.collection('agent_runs').doc(started.runId);
      return {
        run: (await runRef.get()).data() as AgentRunDoc,
        calls: (await runRef.collection('tool_calls').get()).docs.map((d) => d.data().tool),
        found: JSON.parse((await runRef.collection('step_outputs').doc('find').get()).data()?.json ?? 'null'),
      };
    };

    it('Make a JEE Main mock test. — one real sitting, in paper order', async () => {
      const { run, calls, found } = await runMock('Make a JEE Main mock test');
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      expect(calls.sort()).toEqual(['create_quiz_artifact', 'find_real_past_paper']);
      const quiz = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      const attempt = (await db.collection('quiz_attempts').doc(quiz.spec.attemptId).get()).data() as any;
      expect(attempt.durationMinutes).toBe(attempt.questions.length * 2);
      expect(attempt.questions.length).toBeGreaterThanOrEqual(30);

      // Independently: every question is from the one sitting found, in its question order.
      const sources = new Set<string>();
      let lastNumber = 0;
      for (const q of attempt.questions) {
        const src = (await db.collection('pyq_questions').where('questionId', '==', q.sourcePyqId).limit(1).get()).docs[0]?.data() as any;
        expect(src).toMatchObject({ origin: 'authentic_import', examId: 'JEE_MAIN', year: found.sitting.year, shift: found.sitting.shift });
        expect(Number(src.questionNumber)).toBeGreaterThan(lastNumber);
        lastNumber = Number(src.questionNumber);
        sources.add(src.sourceId);
      }
      expect(sources.size).toBe(1);
      const [sourceId] = [...sources];
      expect(sourceId).not.toMatch(/_nta$/);
      const paperRows = (await db.collection('pyq_questions').where('examId', '==', 'JEE_MAIN').where('year', '==', found.sitting.year).where('shift', '==', found.sitting.shift).get()).docs
        .map((d) => d.data() as any)
        .filter((r) => r.sourceId === sourceId);
      const letters = paperRows.map((r) => String(r.correctAnswer).toUpperCase()).filter((a) => /^[A-D]$/.test(a));
      const top = Math.max(...['A', 'B', 'C', 'D'].map((l) => letters.filter((a) => a === l).length));
      expect(top / letters.length).toBeLessThan(0.75);
      expect(run.result!.summary).toMatch(/Sadhya's pacing, since the exam's own time limit isn't recorded in Sadhya/);
      console.log('[live] mock test:', { title: quiz.title, sitting: found.sitting, sections: found.sections, leftOut: found.leftOut, paperQuestions: found.paperQuestions, questions: attempt.questions.length, lettered: letters.length, topShare: Math.round((top / letters.length) * 100), summary: run.result!.summary });
    }, 180_000);

    it('Make a NEET mock test. — no real paper, so no mock', async () => {
      const { run, calls, found } = await runMock('Make a NEET mock test');
      expect(run.result!.outcome).toBe('no_result');
      expect(calls).toEqual(['find_real_past_paper']);
      expect(found.questions).toBeUndefined();
      expect(run.result!.summary).toMatch(/I couldn't find a real NEET UG paper I can stand behind/);
      console.log('[live] NEET mock refusal:', { checked: found.checked, excluded: found.excluded });
    }, 180_000);
  });

  // Phase 6 — revision notes for a named NCERT chapter, with real generation (about two US cents).
  describe('revision notes for an NCERT chapter (Phase 6)', () => {
    it('Make revision notes on Laws of Motion, Class 11 Physics.', async () => {
      const { routeGoal } = require('../../src/agents/runtime/GoalRouter');
      const { getAgentRuntime } = require('../../src/agents');
      const goal = 'Make revision notes on Laws of Motion, Class 11 Physics.';
      const decision = routeGoal(goal, { explicitAgent: true });
      expect(decision).toMatchObject({ mode: 'agent', workflowId: 'chapter_revision_notes' });
      const started = await getAgentRuntime().startRun({ userId: USER_A, goal, workflowId: decision.workflowId, source: 'api' });
      createdRunIds.add(started.runId);
      await getAgentRuntime().waitForRun(started.runId);
      const runRef = db.collection('agent_runs').doc(started.runId);
      const run = (await runRef.get()).data() as AgentRunDoc;
      expect(run.status).toBe('completed');
      expect(run.result!.outcome).toBe('success');
      const calls = (await runRef.collection('tool_calls').get()).docs.map((d) => d.data().tool);
      expect(calls.sort()).toEqual(['create_document_artifact', 'resolve_curriculum_chapter', 'write_chapter_revision_notes']);
      expect(run.usage.costUsd).toBeLessThan(0.05);

      const chapter = JSON.parse((await runRef.collection('step_outputs').doc('resolve_chapter').get()).data()!.json);
      expect(chapter).toMatchObject({ resolved: true });
      expect(chapter.chapterName).toMatch(/laws of motion/i);
      const notes = JSON.parse((await runRef.collection('step_outputs').doc('notes').get()).data()!.json);
      const doc = (await db.collection('artifacts').doc(run.artifactIds[0]).get()).data() as any;
      expect(doc).toMatchObject({ kind: 'document', userId: USER_A });
      expect(doc.versions[0].pageCount).toBeGreaterThanOrEqual(1);
      expect(notes.stats.kept).toBeGreaterThanOrEqual(10);

      // The core claim, checked independently: each kept point's sentence is in the chapter, on its page.
      const { loadChapterPages } = require('../../src/agents/tools/adapters/chapterText');
      const { evidenceKey } = require('../../src/agents/tools/adapters/grounded');
      const pages: Array<{ pageNumber: number; text: string }> = (await loadChapterPages(chapter.notebookId, chapter.sourceId)).pages;
      const whole = evidenceKey(pages.map((p) => p.text).join('\n'));
      for (const k of notes.kept) {
        expect(whole.includes(evidenceKey(k.evidence))).toBe(true);
        if (k.page) expect(evidenceKey(pages.find((p) => p.pageNumber === k.page)!.text).includes(evidenceKey(k.evidence))).toBe(true);
      }
      console.log('[live] chapter notes:', {
        chapter: chapter.chapterName,
        book: chapter.bookTitle,
        sections: doc.spec.sections.map((s: any) => `${s.heading} (${s.blocks[0].items.length})`),
        stats: notes.stats,
        pdfPages: doc.versions[0].pageCount,
        costUsd: run.usage.costUsd,
        elapsedMs: run.usage.elapsedMs,
        sample: doc.spec.sections[0].blocks[0].items.slice(0, 2),
        summary: run.result!.summary,
      });
    }, 300_000);
  });

  describe('a second runtime built from the same production parts', () => {
    let owner: AgentRuntime;
    let other: AgentRuntime;
    let slowToolAborted = false;

    beforeAll(() => {
      const { AgentRuntime: Runtime } = require('../../src/agents/runtime/AgentRuntime');
      const { FirestoreAgentRunStore } = require('../../src/agents/runtime/AgentRunStore');
      const { AgentEventHub } = require('../../src/agents/runtime/AgentEventHub');
      const { ToolRegistry } = require('../../src/agents/tools/ToolRegistry');
      const { ToolExecutor } = require('../../src/agents/tools/ToolExecutor');
      const { registerRetrievalTools } = require('../../src/agents/tools/adapters/retrievalTools.adapter');
      const { registerCurriculumTools } = require('../../src/agents/tools/adapters/curriculum.adapter');
      const { registerArtifactTools } = require('../../src/agents/tools/adapters/artifact.adapter');
      const { WorkflowRegistry } = require('../../src/agents/workflows/WorkflowTemplate');
      const { examOverviewWorkflow } = require('../../src/agents/workflows/examOverview.workflow');
      const { fakeTool, fixedWorkflow } = require('../unit/agents/helpers');

      const registry = new ToolRegistry();
      registerRetrievalTools(registry);
      registerCurriculumTools(registry);
      registerArtifactTools(registry);
      registry.register(
        fakeTool(
          'slow_wait',
          (_input: any, ctx: any) =>
            new Promise((resolve, reject) => {
              const timer = setTimeout(() => resolve({ waited: true }), 30_000);
              ctx.signal.addEventListener(
                'abort',
                () => {
                  slowToolAborted = true;
                  clearTimeout(timer);
                  reject(new Error('aborted'));
                },
                { once: true },
              );
            }),
          { timeoutMs: 60_000, retry: { maxAttempts: 1, baseBackoffMs: 1 } },
        ),
      );

      const step = (id: string, tool: string, input: any, dependsOn: string[] = []) => ({
        id,
        objective: id,
        label: id,
        type: 'retrieve',
        tool,
        input,
        dependsOn,
      });
      const base = { successCriteria: [], estimatedComplexity: 'low', requiresUserApproval: false };
      const tightBudget: WorkflowTemplate = {
        ...examOverviewWorkflow,
        id: 'live_tight_budget',
        budget: { ...examOverviewWorkflow.budget, maxToolCalls: 2 },
        buildPlan: (goal: string) => ({ ...examOverviewWorkflow.buildPlan(goal), workflowId: 'live_tight_budget' }),
      };
      const workflows = new WorkflowRegistry()
        .register(
          fixedWorkflow('live_cancel', {
            ...base,
            steps: [step('resolve_exam', 'resolve_exam_id', { query: 'SSC CGL' }), step('wait', 'slow_wait', { query: 'x' }, ['resolve_exam'])],
          }),
        )
        .register(fixedWorkflow('live_bad_tool', { ...base, steps: [step('wipe', 'delete_all_user_data', {})] }))
        // Chapter -> PDF: the artifact's title is $ref'd from what the resolver actually found, so
        // a passing run proves the document was built from corpus data, not from a fixed string.
        .register(
          fixedWorkflow('live_artifact', {
            ...base,
            steps: [
              step('resolve_chapter', 'resolve_curriculum_chapter', { query: 'Laws of Motion, Class 11 Physics' }),
              step(
                'render',
                'create_document_artifact',
                {
                  title: { $ref: 'resolve_chapter', path: 'chapterName' },
                  subtitle: { $ref: 'resolve_chapter', path: 'bookTitle' },
                  sourceNote: "From Sadhya's verified corpus",
                  sections: [
                    {
                      heading: 'Key formulae',
                      blocks: [{ type: 'formulae', items: [{ formula: 'F = ma', meaning: 'Newton’s second law' }] }],
                    },
                  ],
                },
                ['resolve_chapter'],
              ),
            ],
          }),
        )
        .register(tightBudget);

      const make = (instanceId: string) =>
        new Runtime({
          store: new FirestoreAgentRunStore(),
          registry,
          toolExecutor: new ToolExecutor(registry),
          hub: new AgentEventHub(),
          workflows,
          instanceId,
          lease: { heartbeatMs: 300, ttlMs: 5_000 },
        });
      owner = make(`${TAG}-owner`);
      other = make(`${TAG}-other`);
    });

    const events = async (runId: string): Promise<AgentEvent[]> =>
      (await db.collection('agent_runs').doc(runId).collection('events').orderBy('seq').get()).docs.map((d) => d.data() as AgentEvent);

    it('is cancellable from another API instance through the persisted cancel flag', async () => {
      const run = await owner.startRun({ userId: USER_A, goal: 'cancel me', workflowId: 'live_cancel', source: 'api' });
      createdRunIds.add(run.runId);
      await new Promise<void>((resolve) => {
        const off = owner.subscribe(run.runId, (e) => {
          if (e.type === 'agent.step.started' && e.stepId === 'wait') {
            off();
            resolve();
          }
        });
      });

      const requestedAt = Date.now();
      await other.cancelRun(run.runId, USER_A); // not this instance's run: only the Firestore flag is set
      await owner.waitForRun(run.runId);
      const tookMs = Date.now() - requestedAt;

      const final = (await db.collection('agent_runs').doc(run.runId).get()).data() as AgentRunDoc;
      expect(final.status).toBe('cancelled');
      expect(final.steps.find((s) => s.id === 'resolve_exam')!.status).toBe('completed');
      expect(final.steps.find((s) => s.id === 'wait')!.status).toBe('cancelled');
      expect(slowToolAborted).toBe(true);
      // The invariant is that the owner's heartbeat noticed the flag; the tool itself would have
      // run for 30 s. The margin is generous because each step of the teardown is a real Firestore
      // round trip from a developer machine.
      expect(tookMs).toBeLessThan(15_000);
      const evs = await events(run.runId);
      expect(evs.at(-1)!.type).toBe('agent.cancelled');
      expect(evs.map((e) => e.seq)).toEqual(evs.map((_, i) => i + 1));
    }, 120_000);

    it('never executes a plan that names an unregistered tool', async () => {
      const run = await owner.startRun({ userId: USER_A, goal: 'wipe everything', workflowId: 'live_bad_tool', source: 'api' });
      createdRunIds.add(run.runId);
      await owner.waitForRun(run.runId);
      const final = (await db.collection('agent_runs').doc(run.runId).get()).data() as AgentRunDoc;
      expect(final.status).toBe('failed');
      expect(final.error).toMatchObject({ class: 'validation' });
      expect((await db.collection('agent_runs').doc(run.runId).collection('tool_calls').get()).empty).toBe(true);
      expect((await events(run.runId)).map((e) => e.type)).toEqual(['agent.started', 'agent.planning', 'agent.failed']);
    }, 60_000);

    it('refuses up front a plan that cannot fit its budget, before any tool runs', async () => {
      const run = await owner.startRun({ userId: USER_A, goal: GOAL, workflowId: 'live_tight_budget', source: 'api' });
      createdRunIds.add(run.runId);
      await owner.waitForRun(run.runId);
      const final = (await db.collection('agent_runs').doc(run.runId).get()).data() as AgentRunDoc;
      expect(final.status).toBe('failed');
      expect(final.usage.toolCalls).toBe(0);
      expect((await db.collection('agent_runs').doc(run.runId).collection('tool_calls').get()).empty).toBe(true);
    }, 60_000);

    // Phase 3 "done when": a structured document renders to a PDF, is stored, and is fetchable
    // only by its owner.
    it('renders a real PDF from a resolved chapter, stores it, and serves it to its owner alone', async () => {
      const run = await owner.startRun({ userId: USER_A, goal: 'formula chart', workflowId: 'live_artifact', source: 'api' });
      createdRunIds.add(run.runId);
      await owner.waitForRun(run.runId);

      const final = (await db.collection('agent_runs').doc(run.runId).get()).data() as AgentRunDoc;
      expect(final.status).toBe('completed');
      expect(final.artifactIds).toHaveLength(1);
      const artifactId = final.artifactIds[0];

      // Stored: Firestore record + a real file in Cloud Storage, with the spec kept for re-use.
      const stored = (await db.collection('artifacts').doc(artifactId).get()).data() as any;
      expect(stored).toMatchObject({ userId: USER_A, kind: 'document', status: 'ready', currentVersion: 1 });
      expect(stored.title).toMatch(/laws of motion/i); // came from the resolver, not a literal
      expect(stored.spec.sections[0].blocks[0].items[0].formula).toBe('F = ma');
      expect(stored.versions[0].storagePath).toBe(`artifacts/${USER_A}/${artifactId}/v1.pdf`);

      // No public URL exists for a student's document.
      const { firebaseApp } = require('../../src/config/firebase');
      const [meta] = await firebaseApp.storage().bucket().file(stored.versions[0].storagePath).getMetadata();
      expect(JSON.stringify(meta.metadata ?? {})).not.toMatch(/firebaseStorageDownloadTokens/);
      expect(meta.contentType).toBe('application/pdf');

      // Fetchable by its owner, through the API.
      const fileRes = await request(app).get(`/api/agent/artifacts/${artifactId}/file`).set('x-test-uid', USER_A).buffer(true);
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers['content-type']).toBe('application/pdf');
      expect(fileRes.headers['cache-control']).toBe('private, no-store');
      const pdfBytes = Buffer.isBuffer(fileRes.body) ? fileRes.body : Buffer.from(fileRes.text ?? '', 'binary');
      expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
      const { PDFDocument } = require('pdf-lib');
      const reopened = await PDFDocument.load(pdfBytes);
      expect(reopened.getPageCount()).toBeGreaterThanOrEqual(1);

      // And by nobody else.
      for (const path of [`/api/agent/artifacts/${artifactId}`, `/api/agent/artifacts/${artifactId}/file`]) {
        const denied = await request(app).get(path).set('x-test-uid', USER_B);
        expect(denied.status).toBe(404);
      }
      const listB = await request(app).get('/api/agent/artifacts').set('x-test-uid', USER_B);
      expect(listB.body.artifacts.map((a: any) => a.artifactId)).not.toContain(artifactId);
      const listA = await request(app).get('/api/agent/artifacts').set('x-test-uid', USER_A);
      expect(listA.body.artifacts.map((a: any) => a.artifactId)).toContain(artifactId);

      console.log('[live] artifact:', {
        title: stored.title,
        pages: stored.versions[0].pageCount,
        bytes: stored.versions[0].sizeBytes,
        storagePath: stored.versions[0].storagePath,
      });
    }, 180_000);

    it('marks a run orphaned by a crashed process as failed and continues its event sequence', async () => {
      const { FirestoreAgentRunStore } = require('../../src/agents/runtime/AgentRunStore');
      const { resolveBudget } = require('../../src/agents/runtime/AgentPolicy');
      const store = new FirestoreAgentRunStore();
      const runId = `${TAG}-orphan`;
      createdRunIds.add(runId);
      const now = Date.now();
      await store.createRun({
        runId,
        userId: USER_A,
        goal: 'orphan',
        workflowId: 'exam_overview',
        source: 'api',
        status: 'executing',
        steps: [],
        budget: resolveBudget(undefined),
        usage: { steps: 0, toolCalls: 0, tokens: 0, costUsd: 0, elapsedMs: 0 },
        artifactIds: [],
        cancelRequested: false,
        lastEventSeq: 2,
        lease: { owner: 'a-process-that-died', expiresAt: now - 60_000 },
        createdAt: now - 120_000,
        updatedAt: now - 60_000,
      });
      await store.appendEvent({ runId, seq: 1, type: 'agent.started', ts: now - 110_000 });
      await store.appendEvent({ runId, seq: 2, type: 'agent.planning', ts: now - 100_000 });

      expect(await other.recoverInterruptedRuns()).toBeGreaterThanOrEqual(1);
      const final = (await db.collection('agent_runs').doc(runId).get()).data() as AgentRunDoc;
      expect(final.status).toBe('failed');
      expect(final.error).toMatchObject({ class: 'internal' });
      expect((await events(runId)).map((e) => [e.seq, e.type])).toEqual([
        [1, 'agent.started'],
        [2, 'agent.planning'],
        [3, 'agent.failed'],
      ]);
    }, 60_000);
  });
});

if (!LIVE) {
  it('agent live test skipped (set AGENT_LIVE_TEST=1 to run against real Firestore)', () => undefined);
}
