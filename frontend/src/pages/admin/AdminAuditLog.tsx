import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Admin audit log — every mutating admin request, real and durable, written by
 * auditLog.middleware.ts as it happens. There is no backfill: entries exist only from the
 * moment logging started, which this page says outright rather than implying a longer
 * history than the data holds.
 */

interface AuditEntry {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  actorRole: string | null;
  method: string;
  path: string;
  params: Record<string, string>;
  statusCode: number;
  timestamp: number;
}

interface AuditOverview {
  entries: AuditEntry[];
  truncated: boolean;
}

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const METHOD_STYLE: Record<string, string> = {
  POST: 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]',
  PATCH: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  PUT: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  DELETE: 'bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-400',
};

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminAuditLog() {
  const [data, setData] = useState<AuditOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<AuditOverview>('/admin/audit', { params: { limit: 200 } });
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

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[62ch]">
        Every state-changing admin request — who, what, when — newest first. Reads (GET)
        are not logged; only actions that changed something are. This trail starts from the
        moment logging shipped, not before.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {data && (
          <span className="text-[12px] text-slate-400 dark:text-gray-500">
            {data.entries.length} entr{data.entries.length === 1 ? 'y' : 'ies'}
            {data.truncated ? ' (showing the most recent 200)' : ''}
          </span>
        )}
      </div>

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load the audit log.</p>
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
          {data.entries.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
              No actions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-gray-500">
                    <th className="font-medium px-5 py-2.5">Actor</th>
                    <th className="font-medium px-5 py-2.5">Method</th>
                    <th className="font-medium px-5 py-2.5">Path</th>
                    <th className="font-medium px-5 py-2.5">Status</th>
                    <th className="font-medium px-5 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                      <td className="px-5 py-3">
                        <div className="text-[13px] font-medium text-slate-900 dark:text-white">
                          {e.actorEmail || e.actorUid}
                        </div>
                        {e.actorRole && (
                          <div className="text-[11.5px] text-slate-400 dark:text-gray-500 capitalize">{e.actorRole.replace('_', ' ')}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${METHOD_STYLE[e.method] || 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'}`}>
                          {e.method}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[12px] text-slate-600 dark:text-gray-300 font-mono whitespace-nowrap">
                        {e.path}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[12px] font-medium ${e.statusCode >= 400 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-gray-300'}`}>
                          {e.statusCode}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11.5px] text-slate-400 dark:text-gray-500 whitespace-nowrap">
                        {absoluteTime(e.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
