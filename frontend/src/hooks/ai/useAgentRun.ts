import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  AgentArtifactKind,
  AgentEvent,
  AgentRun,
  AgentRunStatus,
  AgentStepState,
  TERMINAL_EVENT_TYPES,
  TERMINAL_RUN_STATUSES,
  agentApi,
} from '../../lib/api/agent';

/**
 * Follows one agent run: loads it, then applies its live events until it finishes. If the
 * connection drops it resumes from the last event it saw (the server replays anything after
 * `Last-Event-ID`), so a flaky network costs a pause, never a missing step.
 */

export interface RunArtifactRef {
  artifactId: string;
  title?: string;
  kind?: AgentArtifactKind;
  pageCount?: number;
  cardCount?: number;
  questionCount?: number;
  weakAreaCount?: number;
  dayCount?: number;
  weekCount?: number;
}

export interface AgentRunView {
  status: AgentRunStatus | 'loading' | 'missing';
  goal?: string;
  workflowId?: string;
  steps: AgentStepState[];
  summary?: string;
  outcome?: 'success' | 'partial' | 'no_result' | null;
  errorMessage?: string;
  artifacts: RunArtifactRef[];
  startedAt?: number;
  completedAt?: number;
  connection: 'idle' | 'live' | 'reconnecting' | 'offline';
  stopping: boolean;
  lastSeq: number;
}

const initialView: AgentRunView = { status: 'loading', steps: [], artifacts: [], connection: 'idle', stopping: false, lastSeq: 0 };

type Action =
  | { type: 'loaded'; run: AgentRun }
  | { type: 'missing' }
  | { type: 'event'; event: AgentEvent }
  | { type: 'connection'; connection: AgentRunView['connection'] }
  | { type: 'stopping' }
  | { type: 'artifactMeta'; artifactId: string; title: string; kind: RunArtifactRef['kind']; pageCount: number; cardCount?: number; questionCount?: number; weakAreaCount?: number; dayCount?: number; weekCount?: number };

const isTerminal = (s: AgentRunView['status']) => TERMINAL_RUN_STATUSES.includes(s as AgentRunStatus);

function withStep(steps: AgentStepState[], id: string | undefined, patch: Partial<AgentStepState>, label?: string): AgentStepState[] {
  if (!id) return steps;
  if (!steps.some((s) => s.id === id)) return [...steps, { id, label: label ?? id, status: 'pending', ...patch }];
  return steps.map((s) => (s.id === id ? { ...s, ...patch, label: s.label || label || id } : s));
}

export function applyAgentEvent(view: AgentRunView, e: AgentEvent): AgentRunView {
  if (e.seq <= view.lastSeq) return view; // replay overlap: already applied
  const next: AgentRunView = { ...view, lastSeq: e.seq };
  const d = e.data ?? {};
  switch (e.type) {
    case 'agent.started':
    case 'agent.planning':
      next.status = 'planning';
      next.startedAt = next.startedAt ?? e.ts;
      break;
    case 'agent.plan_ready':
      next.status = 'executing';
      next.steps = (d.steps ?? []).map((s: any) => view.steps.find((x) => x.id === s.id) ?? { id: s.id, label: s.label, status: 'pending' as const });
      break;
    case 'agent.step.started':
      next.steps = withStep(view.steps, e.stepId, { status: 'running' }, e.label);
      break;
    case 'agent.step.completed':
      next.steps = withStep(view.steps, e.stepId, { status: 'completed' }, e.label);
      break;
    case 'agent.step.failed':
      next.steps = withStep(view.steps, e.stepId, { status: d.reason === 'budget' ? 'cancelled' : 'failed', error: d.failureClass ? { class: d.failureClass, message: d.reason } : undefined }, e.label);
      break;
    case 'agent.step.skipped':
      next.steps = withStep(view.steps, e.stepId, { status: 'skipped' }, e.label);
      break;
    case 'agent.artifact.ready':
      if (d.artifactId && !view.artifacts.some((a) => a.artifactId === d.artifactId)) {
        next.artifacts = [
          ...view.artifacts,
          { artifactId: d.artifactId, title: d.title, kind: d.kind ?? 'document', pageCount: d.pageCount, cardCount: d.cardCount, questionCount: d.questionCount, weakAreaCount: d.weakAreaCount, dayCount: d.dayCount, weekCount: d.weekCount },
        ];
      }
      break;
    case 'agent.verification.started':
      next.status = 'verifying';
      break;
    case 'agent.completed':
    case 'agent.failed':
    case 'agent.cancelled':
      next.status = e.type === 'agent.completed' ? 'completed' : e.type === 'agent.failed' ? 'failed' : 'cancelled';
      next.summary = d.summary ?? view.summary;
      next.outcome = d.outcome ?? null;
      next.errorMessage = d.error?.message;
      next.completedAt = e.ts;
      next.stopping = false;
      // Anything still marked as running did not finish.
      next.steps = view.steps.map((s) => (s.status === 'running' || s.status === 'pending' ? { ...s, status: 'cancelled' as const } : s));
      break;
    default:
      break;
  }
  return next;
}

function fromRun(run: AgentRun): Partial<AgentRunView> {
  const steps: AgentStepState[] = run.steps?.length
    ? run.steps
    : (run.plan?.steps ?? []).map((s) => ({ id: s.id, label: s.label, status: 'pending' as const }));
  return {
    status: run.status,
    goal: run.goal,
    workflowId: run.workflowId,
    steps,
    summary: run.result?.summary ?? run.error?.message,
    outcome: run.result?.outcome ?? null,
    errorMessage: run.error?.message,
    artifacts: (run.artifactIds ?? []).map((artifactId) => ({ artifactId })),
    startedAt: run.startedAt ?? run.createdAt,
    completedAt: run.completedAt,
  };
}

function reducer(view: AgentRunView, action: Action): AgentRunView {
  switch (action.type) {
    case 'loaded':
      // A finished run is shown from its record. An active one is rebuilt from its events, which
      // replay from the start, so the record only fills the gap until the first event arrives.
      return { ...view, ...fromRun(action.run), lastSeq: 0 };
    case 'missing':
      return { ...view, status: 'missing' };
    case 'event':
      return applyAgentEvent(view, action.event);
    case 'connection':
      return { ...view, connection: action.connection };
    case 'stopping':
      return { ...view, stopping: true };
    case 'artifactMeta':
      return {
        ...view,
        artifacts: view.artifacts.map((a) =>
          a.artifactId === action.artifactId
            ? {
                ...a,
                title: a.title ?? action.title,
                kind: a.kind ?? action.kind,
                pageCount: a.pageCount ?? action.pageCount,
                cardCount: a.cardCount ?? action.cardCount,
                questionCount: a.questionCount ?? action.questionCount,
                weakAreaCount: a.weakAreaCount ?? action.weakAreaCount,
                dayCount: a.dayCount ?? action.dayCount,
                weekCount: a.weekCount ?? action.weekCount,
              }
            : a,
        ),
      };
    default:
      return view;
  }
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 8_000, 8_000];

export function useAgentRun(runId: string | undefined) {
  const [view, dispatch] = useReducer(reducer, initialView);
  const lastSeqRef = useRef(0);
  const terminalRef = useRef(false);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    lastSeqRef.current = 0;
    terminalRef.current = false;

    const onEvent = (event: AgentEvent) => {
      if (event.seq > lastSeqRef.current) lastSeqRef.current = event.seq;
      if (TERMINAL_EVENT_TYPES.includes(event.type)) terminalRef.current = true;
      dispatch({ type: 'event', event });
    };

    (async () => {
      let run: AgentRun;
      try {
        run = await agentApi.getRun(runId);
      } catch {
        if (!controller.signal.aborted) dispatch({ type: 'missing' });
        return;
      }
      if (controller.signal.aborted) return;
      dispatch({ type: 'loaded', run });
      if (TERMINAL_RUN_STATUSES.includes(run.status)) return;

      for (let attempt = 0; !controller.signal.aborted && !terminalRef.current; attempt++) {
        dispatch({ type: 'connection', connection: attempt === 0 ? 'live' : 'reconnecting' });
        try {
          await agentApi.streamEvents(runId, { afterSeq: lastSeqRef.current, signal: controller.signal, onEvent });
          if (terminalRef.current) break;
          // The server closed a healthy stream before the run ended (a proxy timeout, a deploy).
          // Resume from where it stopped — after a short pause, so a misbehaving server cannot
          // turn this into a tight reconnect loop.
          attempt = -1;
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          if (controller.signal.aborted) return;
          if (attempt >= BACKOFF_MS.length) {
            dispatch({ type: 'connection', connection: 'offline' });
            return;
          }
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        }
      }
      if (!controller.signal.aborted) dispatch({ type: 'connection', connection: 'idle' });
    })();

    return () => controller.abort();
  }, [runId]);

  // A run loaded from its record knows its documents only by id (titles arrive with live
  // `agent.artifact.ready` events), so fetch the names once for any document shown without one.
  const untitled = view.artifacts.filter((a) => !a.title).map((a) => a.artifactId).join(',');
  useEffect(() => {
    if (!untitled) return;
    let live = true;
    for (const artifactId of untitled.split(',')) {
      agentApi
        .getArtifact(artifactId)
        .then((meta) => {
          if (live) {
            dispatch({ type: 'artifactMeta', artifactId, title: meta.title, kind: meta.kind, pageCount: meta.pageCount, cardCount: meta.cardCount, questionCount: meta.questionCount, weakAreaCount: meta.weakAreaCount, dayCount: meta.dayCount, weekCount: meta.weekCount });
          }
        })
        .catch(() => undefined); // the card keeps its generic label; opening it still works
    }
    return () => {
      live = false;
    };
  }, [untitled]);

  const cancel = useCallback(async () => {
    if (!runId || isTerminal(view.status)) return;
    dispatch({ type: 'stopping' });
    try {
      await agentApi.cancel(runId);
    } catch {
      /* the stream reports the outcome either way */
    }
  }, [runId, view.status]);

  return { view, cancel, isTerminal: isTerminal(view.status) };
}
