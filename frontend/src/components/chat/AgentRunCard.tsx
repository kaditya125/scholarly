import { useEffect, useState } from 'react';
import { Check, RotateCcw, Square, X } from 'lucide-react';
import { ArtifactKindIcon, artifactKindName, describeArtifact } from './artifactKind';
import { cn } from '../../lib/utils';
import { AgentStepState } from '../../lib/api/agent';
import { AgentRunView, useAgentRun } from '../../hooks/ai/useAgentRun';
import MarkdownMessage from './MarkdownMessage';

/**
 * The live view of an agent run inside the chat thread: its steps as they happen, a Stop button
 * while it works, the result when it is done, and any document it made. Styling follows
 * ReasoningTimeline (spinner, emerald check, muted dots, left-ruled list) so a run reads as part
 * of the reply rather than a widget dropped into it.
 */

function StepIcon({ status }: { status: AgentStepState['status'] }) {
  switch (status) {
    case 'running':
      return <span className="block w-3.5 h-3.5 rounded-full border-2 border-indigo-500/25 border-t-indigo-500 motion-safe:animate-spin shrink-0" aria-hidden />;
    case 'completed':
      return (
        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0" aria-hidden>
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      );
    case 'failed':
      return (
        <span className="w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0" aria-hidden>
          <X className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      );
    case 'skipped':
    case 'cancelled':
      return <span className="block w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-gray-600 shrink-0" aria-hidden />;
    default:
      return (
        <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0" aria-hidden>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600" />
        </span>
      );
  }
}

const STEP_NOTE: Partial<Record<AgentStepState['status'], string>> = {
  skipped: 'not needed',
  cancelled: 'stopped',
};

function useElapsed(view: AgentRunView, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!view.startedAt) return 0;
  const end = view.completedAt ?? (active ? now : view.startedAt);
  return Math.max(0, Math.round((end - view.startedAt) / 1000));
}

function headline(view: AgentRunView): { text: string; tone: 'active' | 'done' | 'failed' | 'muted' } {
  switch (view.status) {
    case 'loading':
      return { text: 'Loading the task…', tone: 'active' };
    case 'missing':
      return { text: 'This task is no longer available.', tone: 'muted' };
    case 'queued':
      return { text: 'Waiting to start…', tone: 'active' };
    case 'planning':
      return { text: 'Planning the steps…', tone: 'active' };
    case 'verifying':
      return { text: 'Checking the results…', tone: 'active' };
    case 'executing': {
      const current = view.steps.find((s) => s.status === 'running');
      return { text: current ? `${current.label}…` : 'Working on it…', tone: 'active' };
    }
    case 'completed':
      return { text: view.outcome === 'no_result' ? 'Needs your input' : 'Done', tone: view.outcome === 'no_result' ? 'muted' : 'done' };
    case 'cancelled':
      return { text: 'Stopped', tone: 'muted' };
    case 'failed':
      return { text: 'Couldn’t finish', tone: 'failed' };
    default:
      return { text: 'Working on it…', tone: 'active' };
  }
}

export interface AgentRunCardProps {
  runId: string;
  onOpenArtifact?: (artifactId: string, title?: string) => void;
  /** Starts the same goal again; the card follows whatever run id it is given next. */
  onRetry?: (goal: string, workflowId?: string) => void;
}

function RunCardBody({ runId, onOpenArtifact, onRetry, onReload }: AgentRunCardProps & { onReload: () => void }) {
  const { view, cancel, isTerminal } = useAgentRun(runId);
  const active = !isTerminal && view.status !== 'missing';
  const seconds = useElapsed(view, active);
  const head = headline(view);
  const done = view.steps.filter((s) => s.status === 'completed').length;
  const runningIndex = view.steps.findIndex((s) => s.status === 'running');

  return (
    <div className="mt-3 w-full rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-2.5 text-[13.5px]" role="status" aria-live="polite">
        {head.tone === 'active' && <span className="w-4 h-4 rounded-full border-2 border-indigo-500/25 border-t-indigo-500 motion-safe:animate-spin shrink-0" aria-hidden />}
        {head.tone === 'done' && (
          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0" aria-hidden>
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
        {head.tone === 'failed' && (
          <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0" aria-hidden>
            <X className="w-3 h-3" strokeWidth={3} />
          </span>
        )}
        {head.tone === 'muted' && <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 shrink-0 mx-[5px]" aria-hidden />}

        <span className={cn('min-w-0 truncate', head.tone === 'active' ? 'text-neutral-800 dark:text-neutral-100 font-medium' : 'text-neutral-700 dark:text-neutral-300')}>
          {head.text}
        </span>
        {view.steps.length > 0 && (
          <span className="text-slate-400 dark:text-gray-500 shrink-0 tabular-nums hidden sm:inline">
            · {active && runningIndex >= 0 ? `Step ${runningIndex + 1} of ${view.steps.length}` : `${done} of ${view.steps.length} steps`}
          </span>
        )}
        {seconds > 0 && <span className="text-slate-400 dark:text-gray-500 shrink-0 tabular-nums">· {seconds}s</span>}

        <span className="ml-auto flex items-center gap-2 shrink-0">
          {view.connection === 'reconnecting' && <span className="text-[12px] text-amber-600 dark:text-amber-400">Reconnecting…</span>}
          {view.connection === 'offline' && (
            <button onClick={onReload} className="text-[12px] text-indigo-600 dark:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded">
              Connection lost — refresh
            </button>
          )}
          {active && (
            <button
              onClick={cancel}
              disabled={view.stopping}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <Square className="w-3 h-3" strokeWidth={2} fill="currentColor" />
              {view.stopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </span>
      </div>

      {view.steps.length > 0 && (
        <ol className="mt-2.5 ml-[7px] pl-3.5 border-l border-slate-200 dark:border-white/10 flex flex-col gap-1.5">
          {view.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2 text-[13px] leading-5">
              <span className="flex mt-[3px]"><StepIcon status={step.status} /></span>
              <span className="min-w-0">
                <span
                  className={cn(
                    step.status === 'running' && 'text-neutral-900 dark:text-white font-medium',
                    step.status === 'completed' && 'text-neutral-700 dark:text-neutral-300',
                    (step.status === 'pending' || step.status === 'skipped' || step.status === 'cancelled') && 'text-slate-400 dark:text-gray-500',
                    step.status === 'failed' && 'text-rose-700 dark:text-rose-400',
                  )}
                >
                  {step.label}
                </span>
                {STEP_NOTE[step.status] && <span className="ml-1.5 text-[11.5px] text-slate-400/90 dark:text-gray-500">{STEP_NOTE[step.status]}</span>}
                {step.status === 'failed' && step.error?.message && (
                  <span className="block text-[12px] text-slate-500 dark:text-gray-400">{step.error.message}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {isTerminal && view.summary && (
        <div className="chat-md w-full min-w-0 mt-3 pt-3 border-t border-neutral-100 dark:border-white/[0.06]">
          <MarkdownMessage content={view.summary} />
        </div>
      )}

      {view.artifacts.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {view.artifacts.map((a) => (
            <button
              key={a.artifactId}
              onClick={() => onOpenArtifact?.(a.artifactId, a.title)}
              className="group w-full flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2.5 text-left hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            >
              <ArtifactKindIcon kind={a.kind} />
              <span className="min-w-0 flex flex-col">
                <span className="text-[13.5px] font-medium text-neutral-900 dark:text-neutral-100 truncate">{a.title || artifactKindName(a.kind)}</span>
                <span className="text-[12px] text-slate-500 dark:text-gray-400">{describeArtifact(a)}</span>
              </span>
              <span className="ml-auto text-[12.5px] font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline shrink-0">Open</span>
            </button>
          ))}
        </div>
      )}

      {(view.status === 'failed' || view.status === 'cancelled') && onRetry && view.goal && (
        <div className="mt-3">
          <button
            onClick={() => onRetry(view.goal!, view.workflowId)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12.5px] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export default function AgentRunCard(props: AgentRunCardProps) {
  // Re-keying remounts the hook, which reloads the run and reopens its stream.
  const [nonce, setNonce] = useState(0);
  return <RunCardBody key={`${props.runId}:${nonce}`} {...props} onReload={() => setNonce((n) => n + 1)} />;
}
