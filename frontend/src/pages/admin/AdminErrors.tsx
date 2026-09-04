import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, XCircle, AlertCircle, Info } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Errors — the real `admin_alerts` event stream (latency spikes, verification failures,
 * token-budget events), newest first. There is no separate durable request/debug log store
 * in this codebase; that gap is stated in `note` below rather than papered over.
 */

interface LogEntry {
  id: string;
  level: 'error' | 'warn' | 'info';
  type: string;
  message: string;
  timestamp: number;
}

interface LogsResponse {
  logs: LogEntry[];
  source: string;
  note: string;
}

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  error: 'bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-400',
  warn: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  info: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
};

const LEVEL_ICON: Record<LogEntry['level'], typeof XCircle> = {
  error: XCircle,
  warn: AlertCircle,
  info: Info,
};

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminErrors() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | LogEntry['level']>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<LogsResponse>('/admin/logs', { params: { limit: 200 } });
      setData(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const logs = data?.logs.filter((l) => levelFilter === 'all' || l.level === levelFilter) ?? [];
  const errorCount = data?.logs.filter((l) => l.level === 'error').length ?? 0;
  const warnCount = data?.logs.filter((l) => l.level === 'warn').length ?? 0;

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[62ch]">
        The real event stream behind the platform's alerting — latency, verification
        failures, and token-budget events — newest first. Application request/debug logs go
        to stdout, not here; see the note below.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 p-0.5 text-[12px]">
          {(['all', 'error', 'warn', 'info'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2.5 py-1.5 rounded-[10px] font-medium capitalize transition-colors ${
                levelFilter === lvl
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {data && (
          <span className="text-[12px] text-slate-400 dark:text-gray-500">
            {errorCount} error{errorCount === 1 ? '' : 's'} · {warnCount} warning{warnCount === 1 ? '' : 's'} ·{' '}
            {data.logs.length} total
          </span>
        )}
      </div>

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load logs.</p>
          <button
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {!error && loading && !data && (
        <div className={`${CARD} mt-6 p-10 text-center text-[13px] text-slate-400 dark:text-gray-500`}>Loading…</div>
      )}

      {!error && data && (
        <div className={`${CARD} mt-6 overflow-hidden`}>
          {logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
              {data.logs.length === 0 ? 'No events recorded.' : 'Nothing at this level.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {logs.map((l) => {
                const Icon = LEVEL_ICON[l.level];
                return (
                  <li key={l.id} className="px-5 py-3.5 flex items-start gap-3">
                    <span className={`mt-0.5 rounded-full p-1 ${LEVEL_STYLE[l.level]}`}>
                      <Icon className="w-3 h-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{l.type}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${LEVEL_STYLE[l.level]}`}>
                          {l.level}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-slate-600 dark:text-gray-300 break-words">{l.message}</p>
                    </div>
                    <span className="shrink-0 text-[11.5px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                      {absoluteTime(l.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[11.5px] text-slate-400 dark:text-gray-500">
            {data.note}
          </div>
        </div>
      )}
    </div>
  );
}
