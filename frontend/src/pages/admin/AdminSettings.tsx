import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api/client';

/**
 * Settings — real, read-only runtime configuration plus feature flags. No secrets are
 * ever returned (settings.controller.ts / getSettings() only reads env names, never
 * values like API keys). Nothing on this page is editable yet; flipping a feature flag is
 * still done through /admin/feature-flags directly.
 */

interface SettingsResponse {
  settings: {
    environment: string;
    port: number;
    aiProvider: string;
    chatModel: string;
    embeddingModel: string;
    pineconeIndex: string | null;
    pineconeNamespace: string | null;
    corsConfigured: boolean;
    redisConfigured: boolean;
  };
  featureFlags: { name: string; enabled: boolean; scope: string }[];
  note: string;
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

function Row({ label, value }: { label: string; value: string | number | boolean | null }) {
  const rendered =
    typeof value === 'boolean' ? (
      <span className={value ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-gray-600'}>
        {value ? 'Configured' : 'Not configured'}
      </span>
    ) : (
      value ?? '—'
    );
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-[12.5px] text-slate-500 dark:text-gray-400">{label}</dt>
      <dd className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 font-mono">{rendered}</dd>
    </div>
  );
}

export default function AdminSettings() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<SettingsResponse>('/admin/settings');
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
        Live runtime configuration — environment, models, Pinecone index — and the current
        feature flags. Read-only: secret values (API keys, private keys) are never returned
        or shown here.
      </p>

      <div className="mt-5">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
          <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load settings.</p>
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
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Runtime</h2>
            <dl className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.05]">
              <Row label="Environment" value={data.settings.environment} />
              <Row label="Port" value={data.settings.port} />
              <Row label="AI provider" value={data.settings.aiProvider} />
              <Row label="Chat model" value={data.settings.chatModel} />
              <Row label="Embedding model" value={data.settings.embeddingModel} />
            </dl>
          </div>

          <div className={`${CARD} p-5`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Infrastructure</h2>
            <dl className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.05]">
              <Row label="Pinecone index" value={data.settings.pineconeIndex} />
              <Row label="Pinecone namespace" value={data.settings.pineconeNamespace} />
              <Row label="CORS" value={data.settings.corsConfigured} />
              <Row label="Redis" value={data.settings.redisConfigured} />
            </dl>
          </div>

          <div className={`${CARD} p-5 lg:col-span-2`}>
            <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Feature flags</h2>
            {data.featureFlags.length === 0 ? (
              <p className="mt-3 text-[13px] text-slate-400 dark:text-gray-500">No flags recorded.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.featureFlags.map((f) => (
                  <span
                    key={f.name}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
                      f.enabled
                        ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                        : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${f.enabled ? 'bg-[#8FAE2B]' : 'bg-slate-300 dark:bg-gray-600'}`} />
                    {f.name}
                    <span className="text-slate-400 dark:text-gray-500">· {f.scope}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="lg:col-span-2 text-[11.5px] text-slate-400 dark:text-gray-500">{data.note}</p>
        </div>
      )}
    </div>
  );
}
