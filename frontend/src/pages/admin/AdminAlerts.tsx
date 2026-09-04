import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Alert centre — active (unresolved) `admin_alerts`, real severity signals derived from
 * latency, verification failures and token usage (security.controller.ts / getSecurity()).
 * Resolving here calls the same endpoint the old Security screen used.
 */

interface Threat {
  id: string;
  type: string;
  severity: 'critical' | 'medium' | 'low';
  message: string;
  source: string;
  timestamp: number;
  status: 'resolved' | 'investigating';
}

interface SecurityOverview {
  threats: Threat[];
  stats: {
    activeAlerts: number;
    criticalAlerts: number;
    verificationFailures: number;
    guardrailPassRate: number;
  };
  alertTimeline: { time: string; events: number }[];
  note: string;
}

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SEVERITY_STYLE: Record<Threat['severity'], string> = {
  critical: 'bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-400',
  medium: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
  low: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
};

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

export default function AdminAlerts() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<SecurityOverview>('/admin/security/threats');
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

  const resolve = async (id: string) => {
    setResolvingId(id);
    try {
      await api.post(`/admin/security/alerts/${id}/resolve`);
      setData((prev) => (prev ? { ...prev, threats: prev.threats.filter((t) => t.id !== id) } : prev));
    } catch {
      // Leave the row in place; the admin can retry.
    } finally {
      setResolvingId(null);
    }
  };

  const maxTimeline = data ? Math.max(1, ...data.alertTimeline.map((h) => h.events)) : 1;

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[62ch]">
        Unresolved signals only — latency spikes, RAG verification failures, and token-usage
        events. Resolving an alert here is permanent; there's no dedicated prompt-injection
        or WAF tracking in this codebase yet (see the note below).
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
        {data && (
          <span className="text-[12px] text-slate-400 dark:text-gray-500">
            {data.stats.activeAlerts} active · {data.stats.criticalAlerts} critical ·{' '}
            {Math.round(data.stats.guardrailPassRate)}% guardrail pass rate
          </span>
        )}
      </div>

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load alerts.</p>
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
        <>
          {/* ── Last 24h ────────────────────────────────────────────────────── */}
          <div className={`${CARD} mt-6 p-5`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Last 24 hours</h2>
            <div className="mt-4 flex items-end gap-1 h-16">
              {data.alertTimeline.map((h) => (
                <div key={h.time} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.time} · ${h.events} event${h.events === 1 ? '' : 's'}`}>
                  <div
                    className={`w-full rounded-sm ${h.events > 0 ? 'bg-[#8FAE2B]' : 'bg-slate-100 dark:bg-white/[0.06]'}`}
                    style={{ height: `${Math.max((h.events / maxTimeline) * 100, h.events > 0 ? 8 : 2)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-slate-400 dark:text-gray-500">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
          </div>

          {/* ── Active alerts ───────────────────────────────────────────────── */}
          <div className={`${CARD} mt-6 overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-400 dark:text-gray-500" />
              <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Active alerts</h2>
            </div>

            {data.threats.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-slate-400 dark:text-gray-500">
                Nothing unresolved.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {data.threats.map((t) => (
                  <li key={t.id} className="px-5 py-3.5 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{t.type}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${SEVERITY_STYLE[t.severity]}`}>
                          {t.severity}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-slate-600 dark:text-gray-300 break-words">{t.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">
                        {t.source} · {absoluteTime(t.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => void resolve(t.id)}
                      disabled={resolvingId === t.id}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {resolvingId === t.id ? 'Resolving…' : 'Resolve'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-5 py-3 border-t border-slate-100 dark:border-white/[0.06] text-[11.5px] text-slate-400 dark:text-gray-500">
              {data.note}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
