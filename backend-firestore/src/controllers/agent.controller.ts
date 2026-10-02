import { NextFunction, Request, Response } from 'express';
import { featureFlags } from '../config/featureFlags';
import {
  AgentEvent,
  AgentRunError,
  TERMINAL_EVENT_TYPES,
  ensureAgentRecovery,
  getAgentRuntime,
  isTerminal,
  routeGoal,
  toPublicRun,
} from '../agents';
import { ArtifactError, getArtifactsService } from '../agents/artifacts/artifacts.service';
import { toPublicArtifact } from '../agents/artifacts/artifact.types';
import { SessionAccessError } from '../repositories/chat.repository';
import { ChatService } from '../services/chat.service';
import { logger } from '../utils/logger';

/**
 * Agent mode HTTP surface. Every endpoint:
 *   - requires a verified Firebase token (router-level requireAuth) and uses req.user.uid only;
 *   - answers 404 while AGENT_MODE_ENABLED is off, so the feature is invisible until switched on;
 *   - treats another user's run as not found.
 */

const SSE_POLL_MS = 2_000;
const SSE_PING_MS = 15_000;

function sendError(res: Response, err: any) {
  if (err instanceof AgentRunError) return res.status(err.statusCode).json({ code: err.code, error: err.message });
  if (err instanceof ArtifactError) return res.status(err.statusCode).json({ code: err.code, error: err.message });
  if (err instanceof SessionAccessError) return res.status(403).json({ code: err.code, error: err.message });
  if (err?.code === 'QUOTA_EXHAUSTED') {
    return res.status(403).json({
      code: 'QUOTA_EXHAUSTED',
      feature: 'agentRuns',
      error: 'You have used all your agent tasks for this period. Upgrade to Pro for more.',
      used: err.used,
      limit: err.limit,
      remaining: err.remaining,
      resetsAt: err.resetsAt,
      plan: err.plan,
    });
  }
  return null;
}

export class AgentController {
  private readonly chat = new ChatService();

  private enabled(res: Response): boolean {
    if (featureFlags.agentMode) return true;
    res.status(404).json({ error: 'Not found' });
    return false;
  }

  /** POST /api/agent/runs  { goal, sessionId?, workflowId? } */
  startRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.enabled(res)) return;
      await ensureAgentRecovery();

      const { goal, sessionId, workflowId } = req.body ?? {};
      if (typeof goal !== 'string' || !goal.trim()) {
        return res.status(400).json({ code: 'INVALID_GOAL', error: 'Tell me what you would like me to do.' });
      }
      if (sessionId !== undefined && typeof sessionId !== 'string') {
        return res.status(400).json({ code: 'INVALID_SESSION', error: 'sessionId must be a string.' });
      }
      if (sessionId) await this.chat.assertSessionAccess(sessionId, userId);

      // A named workflow is only ever a template id; the runtime rejects unknown ids.
      const decision = routeGoal(goal, { explicitAgent: true });
      const chosen = typeof workflowId === 'string' && workflowId ? workflowId : decision.workflowId;
      if (!chosen) {
        return res.status(422).json({
          code: 'NO_AGENT_WORKFLOW',
          error: decision.agentCandidate
            ? "Agent mode can't do this kind of task yet. Ask it in chat instead."
            : 'This looks like a question rather than a task — ask it in chat.',
          intent: decision.intent,
        });
      }

      const run = await getAgentRuntime().startRun({ userId, goal, workflowId: chosen, sessionId, source: 'api' });
      return res.status(202).json({
        runId: run.runId,
        workflowId: run.workflowId,
        status: run.status,
        eventsUrl: `/api/agent/runs/${run.runId}/events`,
      });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** GET /api/agent/runs/:runId */
  getRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.enabled(res)) return;
      const run = await getAgentRuntime().getRunForUser(req.params.runId, userId);
      return res.json(toPublicRun(run));
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** GET /api/agent/runs?limit=20 */
  listRuns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.enabled(res)) return;
      const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
      const runs = await getAgentRuntime().listRunsForUser(userId, Number.isFinite(limit) ? limit : 20);
      return res.json({ runs: runs.map(toPublicRun) });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** POST /api/agent/runs/:runId/cancel */
  cancelRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.enabled(res)) return;
      const run = await getAgentRuntime().cancelRun(req.params.runId, userId);
      return res.status(202).json({ runId: run.runId, status: run.status, cancelRequested: true });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** GET /api/agent/workflows — what Agent mode can do right now. */
  listWorkflows = async (req: Request, res: Response) => {
    if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!this.enabled(res)) return;
    return res.json({ workflows: getAgentRuntime().availableWorkflows() });
  };

  /** GET /api/agent/tools — the registered tools (metadata only). */
  listTools = async (req: Request, res: Response) => {
    if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!this.enabled(res)) return;
    return res.json({ tools: getAgentRuntime().toolDescriptors() });
  };

  /**
   * Artifacts. Files are never public: no download token is minted, no signed URL is handed out,
   * and the bytes are served from here only after the owner check. Another user's artifact is
   * reported as not found, like runs.
   */
  private artifactsEnabled(res: Response): boolean {
    if (!this.enabled(res)) return false;
    if (featureFlags.agentArtifacts) return true;
    res.status(404).json({ error: 'Not found' });
    return false;
  }

  /** GET /api/agent/artifacts */
  listArtifacts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.artifactsEnabled(res)) return;
      const docs = await getArtifactsService().listForUser(userId, Number(req.query.limit) || 20);
      return res.json({ artifacts: docs.map(toPublicArtifact) });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** GET /api/agent/artifacts/:artifactId */
  getArtifact = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.artifactsEnabled(res)) return;
      const doc = await getArtifactsService().getForUser(req.params.artifactId, userId);
      return res.json({ ...toPublicArtifact(doc), spec: doc.spec });
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /** GET /api/agent/artifacts/:artifactId/file[?version=n] — the PDF itself, owner only. */
  getArtifactFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!this.artifactsEnabled(res)) return;
      const version = req.query.version ? Number(req.query.version) : undefined;
      if (version !== undefined && !Number.isInteger(version)) {
        return res.status(400).json({ code: 'INVALID_VERSION', error: 'version must be a whole number.' });
      }
      const { buffer, filename } = await getArtifactsService().readFile(req.params.artifactId, userId, version);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // A student's own document must never be cached by a shared proxy.
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(buffer);
    } catch (err) {
      if (sendError(res, err)) return;
      next(err);
    }
  };

  /**
   * GET /api/agent/runs/:runId/events — Server-Sent Events, replayable.
   *
   * Resumes after `Last-Event-ID` (or `?after=`). Subscribes to live events BEFORE replaying the
   * persisted ones so nothing emitted during the replay is lost, de-duplicates by seq, polls the
   * store as a safety net (another instance, a dropped live event), and closes after the terminal
   * event. `X-Accel-Buffering: no` stops nginx from holding events back.
   */
  streamEvents = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!this.enabled(res)) return;
    const runtime = getAgentRuntime();
    const runId = req.params.runId;

    let run;
    try {
      run = await runtime.getRunForUser(runId, userId);
    } catch (err) {
      if (sendError(res, err)) return;
      return next(err);
    }

    const headerId = req.headers['last-event-id'];
    const after = Number.parseInt(String((Array.isArray(headerId) ? headerId[0] : headerId) ?? req.query.after ?? '0'), 10);
    let lastSent = Number.isFinite(after) && after > 0 ? after : 0;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    let replaying = true;
    const buffered: AgentEvent[] = [];
    let poll: NodeJS.Timeout | undefined;
    let ping: NodeJS.Timeout | undefined;
    let unsubscribe: () => void = () => undefined;

    const cleanup = () => {
      closed = true;
      if (poll) clearInterval(poll);
      if (ping) clearInterval(ping);
      unsubscribe();
    };
    const finish = () => {
      if (closed) return;
      cleanup();
      res.end();
    };
    /**
     * Delivery is strictly contiguous: `lastSent` only ever advances one seq at a time, and an
     * event that arrives early waits in `early` until the gap before it fills.
     *
     * That ordering is not cosmetic. `Last-Event-ID` is a watermark, so a client that received 9
     * and then dropped would resume from 9 and never see 8. Events CAN arrive out of order here:
     * the run's writes to Firestore are deliberately concurrent (ordering them serially made
     * cancellation take seconds), so the 2 s poll can read 9 before 8 has committed — while the
     * live hub, which is ordered, delivers 8 a moment later.
     */
    const early = new Map<number, AgentEvent>();
    let terminalSeq: number | null = null;
    let stalledPolls = 0;

    const write = (e: AgentEvent) => {
      res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      lastSent = e.seq;
      if (TERMINAL_EVENT_TYPES.includes(e.type)) terminalSeq = e.seq;
    };

    const drain = () => {
      let next: AgentEvent | undefined;
      while ((next = early.get(lastSent + 1))) {
        early.delete(next.seq);
        write(next);
      }
      if (terminalSeq !== null && lastSent >= terminalSeq) finish();
    };

    const send = (e: AgentEvent) => {
      if (closed || e.seq <= lastSent || early.has(e.seq)) return;
      if (e.seq === lastSent + 1) write(e);
      else early.set(e.seq, e);
      drain();
    };

    /**
     * Safety valve: a write that never landed would otherwise hold the stream open forever. When
     * the run is finished and three polls in a row have not closed the gap, deliver what is held
     * and close — a lost event is better than a stream that never ends.
     */
    const flushStalled = () => {
      if (!early.size) return;
      const held = [...early.values()].sort((a, b) => a.seq - b.seq);
      logger.warn('[agent] SSE gap never filled; flushing held events', { runId, from: lastSent + 1, held: held.map((e) => e.seq) });
      early.clear();
      for (const e of held) write(e);
      finish();
    };

    res.on('close', cleanup);
    unsubscribe = runtime.subscribe(runId, (e) => {
      if (replaying) buffered.push(e);
      else send(e);
    });

    try {
      for (const e of await runtime.listEventsForUser(runId, userId, lastSent)) send(e);
      replaying = false;
      for (const e of buffered.sort((a, b) => a.seq - b.seq)) send(e);
      buffered.length = 0;
      if (closed) return;

      if (isTerminal(run.status)) {
        // Terminal run whose terminal event was already delivered earlier (resume after it).
        const fresh = await runtime.getRunForUser(runId, userId);
        if (isTerminal(fresh.status)) return finish();
      }

      poll = setInterval(async () => {
        if (closed) return;
        try {
          const more = await runtime.listEventsForUser(runId, userId, lastSent);
          for (const e of more) send(e);
          if (closed) return;
          if (more.length === 0 || early.size > 0) {
            const fresh = await runtime.getRunForUser(runId, userId);
            if (!isTerminal(fresh.status)) return;
            // The run is over. Either everything has been delivered, or a gap is not going to fill.
            if (early.size === 0) return finish();
            if (++stalledPolls >= 3) flushStalled();
          }
        } catch (e: any) {
          logger.warn('[agent] SSE poll failed', { runId, error: String(e?.message ?? e) });
        }
      }, SSE_POLL_MS);
      ping = setInterval(() => {
        if (!closed) res.write(': ping\n\n');
      }, SSE_PING_MS);
    } catch (e: any) {
      logger.warn('[agent] SSE replay failed', { runId, error: String(e?.message ?? e) });
      if (!closed) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Could not load this task’s progress. Refresh to try again.' })}\n\n`);
        finish();
      }
    }
  };
}
