import { api, API_BASE_URL } from './client';
import { auth } from '../firebase';

/**
 * Agent mode (backend: /api/agent/*). A goal sent in Agent mode becomes a background run; the
 * chat reply carries its id, and everything else about the run — its steps, its progress, the
 * document it made — comes from these endpoints. All of them are owner-only on the server, and
 * all of them answer 404 while agent mode is switched off there.
 */

export type AgentRunStatus = 'queued' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export const TERMINAL_RUN_STATUSES: AgentRunStatus[] = ['completed', 'failed', 'cancelled'];
export const TERMINAL_EVENT_TYPES = ['agent.completed', 'agent.failed', 'agent.cancelled'];

export interface AgentStepState {
  id: string;
  label: string;
  tool?: string;
  status: AgentStepStatus;
  attempts?: number;
  error?: { class: string; message: string };
}

export interface AgentRunResult {
  outcome: 'success' | 'partial' | 'no_result';
  summary: string;
  data?: Record<string, unknown>;
  completed: string[];
  failed: string[];
}

export interface AgentRun {
  runId: string;
  goal: string;
  workflowId: string;
  status: AgentRunStatus;
  steps: AgentStepState[];
  plan?: { steps: Array<{ id: string; label: string; dependsOn: string[] }> };
  result?: AgentRunResult;
  error?: { class: string; message: string; stepId?: string };
  artifactIds: string[];
  usage?: { steps: number; toolCalls: number; elapsedMs: number };
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentEvent {
  runId: string;
  seq: number;
  type: string;
  ts: number;
  label?: string;
  stepId?: string;
  tool?: string;
  data?: Record<string, any>;
}

export interface Flashcard {
  front: string;
  back: string;
  kind?: 'formula' | 'definition' | 'symbol';
  note?: string;
}

/** A quiz's own record points at the student's quiz attempt, which holds the questions. */
export interface QuizSpec {
  title: string;
  attemptId: string;
  questionCount: number;
  durationMinutes: number;
  topics: Array<{ topic: string; count: number }>;
  origin: Array<{ label: string; count: number }>;
  sourceArtifactId?: string;
  validation?: { checked: number; accepted: number; rejected: Record<string, number> };
  sourceNote?: string;
}

export interface WeakArea {
  topic: string;
  accuracy: number;
  correct: number;
  total: number;
  /** 0–1: how much evidence stands behind this area. */
  confidence: number;
  examId?: string;
  syllabusNodeId?: string;
  syllabusPath?: string[];
  syllabusMatch?: 'exact' | 'name';
  refs?: Array<{ label: string; page?: number }>;
}

export interface ReportSpec {
  title: string;
  basis: { attempts: Array<{ attemptId: string; title: string; completedAt?: string; accuracy: number; questions: number }>; questionsAnswered: number };
  weakAreas: WeakArea[];
  strongAreas: Array<{ topic: string; accuracy: number; total: number }>;
  mistakes: Array<{ question: string; topic: string; yourAnswer?: string; correctAnswer: string; note?: string }>;
  recommendations: Array<{ action: string; topic?: string }>;
  sourceArtifactIds?: string[];
}

export interface StudyPlanSpec {
  title: string;
  startDate: string;
  dailyMinutes: number;
  days: Array<{ date: string; tasks: Array<{ kind: 'learn' | 'revise' | 'flashcards' | 'practice' | 'review' | 'test'; title: string; minutes: number; topic?: string; ref?: string }> }>;
  focus: Array<{ topic: string; reason: string }>;
  sourceArtifactId?: string;
  // Phase 7 — a whole exam's preparation ("Prepare me for SSC CGL in 90 days").
  exam?: { examId: string; name: string; scope: string[]; notIncluded: string[] };
  horizon?: { days: number; endDate: string; source: 'goal' | 'saved_goal' | 'default' };
  outlook?: { units: number; scheduled: number; firstPassHours: number; availableHours: number; fitsInTime: boolean; note?: string };
  weeks?: Array<{
    week: number;
    startDate: string;
    endDate: string;
    phase: 'learn' | 'practise' | 'revise';
    focus: Array<{ subject: string; minutes: number; units: string[] }>;
    milestone: string;
  }>;
  strategy?: Array<{ title: string; detail: string }>;
  sources?: Array<{ label: string; url?: string; detail?: string }>;
}

export type AgentArtifactKind = 'document' | 'flashcards' | 'quiz' | 'report' | 'studyplan';

export interface AgentArtifact {
  artifactId: string;
  /** 'document' is a rendered PDF; every other kind is structured content with no file. */
  kind: AgentArtifactKind;
  title: string;
  status: 'ready' | 'failed';
  currentVersion: number;
  pageCount: number;
  sizeBytes: number;
  cardCount?: number;
  questionCount?: number;
  weakAreaCount?: number;
  dayCount?: number;
  /** Exam preparation plans only. */
  weekCount?: number;
  createdAt: number;
  updatedAt: number;
  /** Absent for kinds with no file. */
  fileUrl?: string;
  /** The structured content: a deck's cards, a quiz's QuizSpec, a ReportSpec, a StudyPlanSpec. */
  spec?: any;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Parses one SSE block ("id: 4\nevent: agent.step.started\ndata: {...}"). Comments return null. */
export function parseSseBlock(block: string): { id?: number; event?: string; data?: any } | null {
  const lines = block.split('\n').filter((l) => l && !l.startsWith(':'));
  if (!lines.length) return null;
  const frame: { id?: number; event?: string; data?: any } = {};
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('id:')) frame.id = Number(line.slice(3).trim());
    else if (line.startsWith('event:')) frame.event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length) {
    try {
      frame.data = JSON.parse(dataLines.join('\n'));
    } catch {
      frame.data = dataLines.join('\n');
    }
  }
  return frame;
}

let availability: Promise<boolean> | null = null;

export const agentApi = {
  /**
   * Whether agent mode is switched on for this deployment. The server is the only source of truth
   * (the flag lives there), so the UI asks instead of reading a build-time variable that could
   * disagree with it. Asked once per page load.
   */
  isAvailable(): Promise<boolean> {
    if (!availability) {
      availability = api
        .get('/agent/workflows')
        .then(() => true)
        .catch(() => false);
    }
    return availability;
  },

  async getRun(runId: string): Promise<AgentRun> {
    const res = await api.get(`/agent/runs/${encodeURIComponent(runId)}`);
    return res.data;
  },

  async start(input: { goal: string; workflowId?: string; sessionId?: string }): Promise<{ runId: string; workflowId: string }> {
    const res = await api.post('/agent/runs', input);
    return res.data;
  },

  async cancel(runId: string): Promise<AgentRun> {
    const res = await api.post(`/agent/runs/${encodeURIComponent(runId)}/cancel`);
    return res.data;
  },

  async getArtifact(artifactId: string): Promise<AgentArtifact> {
    const res = await api.get(`/agent/artifacts/${encodeURIComponent(artifactId)}`);
    return res.data;
  },

  /** The PDF itself. Fetched with the student's token — there is no public URL for it. */
  async downloadArtifact(artifactId: string, version?: number): Promise<Blob> {
    const query = version ? `?version=${version}` : '';
    const res = await fetch(`${API_BASE_URL}/agent/artifacts/${encodeURIComponent(artifactId)}/file${query}`, {
      headers: await authHeader(),
    });
    if (!res.ok) throw new Error(res.status === 404 ? 'This document is no longer available.' : `Could not load the document (${res.status}).`);
    return res.blob();
  },

  /**
   * Streams a run's events from `afterSeq` until the run ends or `signal` aborts. EventSource
   * cannot send an Authorization header, so this reads the SSE stream through fetch. Resolves when
   * the server closes the stream; throws on a network or HTTP failure so the caller can resume
   * from the last seq it saw.
   */
  async streamEvents(
    runId: string,
    opts: { afterSeq: number; signal: AbortSignal; onEvent: (e: AgentEvent) => void },
  ): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/agent/runs/${encodeURIComponent(runId)}/events`, {
      headers: { ...(await authHeader()), Accept: 'text/event-stream', 'Last-Event-ID': String(opts.afterSeq) },
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(`event stream failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseSseBlock(block);
        if (!frame) continue;
        if (frame.event === 'error') throw new Error(frame.data?.error || 'The task’s progress could not be loaded.');
        if (frame.data && typeof frame.data === 'object' && typeof frame.data.seq === 'number') opts.onEvent(frame.data as AgentEvent);
      }
    }
  },
};
