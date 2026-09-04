import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, Lock, RefreshCw, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api/client';
import { useAuth } from '../../lib/AuthContext';

/**
 * Settings — real, read-only runtime configuration plus feature flags, PLUS a live API-key
 * manager for a fixed set of third-party services (see runtimeSecrets.service.ts). No
 * secrets are ever returned by /admin/settings itself (settings.controller.ts only reads
 * env names, never values); the API-key section below is a write-mostly surface of its
 * own, gated separately (requireSuperAdmin) and never echoes a value back either — only a
 * masked last4.
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

interface SecretRow {
  key: string;
  service: string;
  label: string;
  liveNote: string;
  source: 'override' | 'env' | 'unset';
  last4: string | null;
  updatedAt: number | null;
  updatedByEmail: string | null;
}

const CARD = 'rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719]';

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SOURCE_STYLE: Record<SecretRow['source'], string> = {
  override: 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]',
  env: 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400',
  unset: 'bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-400',
};
const SOURCE_LABEL: Record<SecretRow['source'], string> = {
  override: 'Set here',
  env: 'From .env',
  unset: 'Not set',
};

function SecretKeyRow({
  row,
  onSave,
  onClear,
}: {
  row: SecretRow;
  onSave: (key: string, value: string) => Promise<boolean>;
  onClear: (key: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const ok = await onSave(row.key, value);
      if (ok) {
        setValue('');
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onClear(row.key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-3.5 border-t border-slate-100 dark:border-white/[0.05] first:border-t-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-medium text-slate-900 dark:text-white">{row.service}</div>
          <div className="text-[11.5px] text-slate-400 dark:text-gray-500">{row.label}</div>
        </div>
        <div className="flex items-center gap-2">
          {row.last4 && (
            <span className="font-mono text-[11.5px] text-slate-400 dark:text-gray-500">•••• {row.last4}</span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[row.source]}`}>
            {SOURCE_LABEL[row.source]}
          </span>
        </div>
      </div>

      {row.source === 'override' && row.updatedAt && (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-gray-500">
          Set {absoluteTime(row.updatedAt)} by {row.updatedByEmail || 'unknown'}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`New ${row.service} ${row.label.toLowerCase()}…`}
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-transparent pl-3 pr-9 py-2 text-[12.5px] font-mono text-slate-800 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#c8e558]/40"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button
          onClick={() => void save()}
          disabled={busy || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-white px-3 py-2 text-[12.5px] font-medium text-white dark:text-slate-900 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {justSaved ? <Check className="w-3.5 h-3.5" /> : null}
          {busy ? 'Saving…' : justSaved ? 'Saved' : 'Save'}
        </button>
        {row.source === 'override' && (
          <button
            onClick={() => void clear()}
            disabled={busy}
            title="Revert to the .env value"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-2.5 py-2 text-[12px] font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-gray-500">{row.liveNote}</p>
    </div>
  );
}

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
  const { adminRole } = useAuth();
  const isSuperAdmin = adminRole === 'super_admin';

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [secrets, setSecrets] = useState<SecretRow[] | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(isSuperAdmin);
  const [secretsError, setSecretsError] = useState(false);

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

  const loadSecrets = useCallback(async () => {
    if (!isSuperAdmin) return;
    setSecretsLoading(true);
    setSecretsError(false);
    try {
      const res = await api.get<{ secrets: SecretRow[] }>('/admin/secrets');
      setSecrets(res.data.secrets);
    } catch {
      setSecretsError(true);
    } finally {
      setSecretsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void load();
    void loadSecrets();
  }, [load, loadSecrets]);

  const saveSecret = async (key: string, value: string): Promise<boolean> => {
    try {
      await api.post(`/admin/secrets/${key}`, { value });
      await loadSecrets();
      return true;
    } catch {
      return false;
    }
  };

  const clearSecret = async (key: string) => {
    try {
      await api.delete(`/admin/secrets/${key}`);
      await loadSecrets();
    } catch {
      // Leave the row as-is; the admin can retry.
    }
  };

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

      {/* ── API keys ──────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-400 dark:text-gray-500" />
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">API keys</h2>
        </div>
        <p className="mt-1 text-[12.5px] text-slate-500 dark:text-gray-400 max-w-[62ch]">
          Set or rotate the key each service authenticates with. A key you save here is
          encrypted at rest, never displayed again — only a masked last 4 characters — and
          takes effect immediately in this running server; see each row's note for the exact
          scope. Leave a service untouched and it keeps using its .env value forever.
        </p>

        {!isSuperAdmin && (
          <div className={`${CARD} mt-4 p-6 flex items-center gap-3`}>
            <Lock className="w-4 h-4 text-slate-400 dark:text-gray-500 shrink-0" />
            <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
              Owner access required. API keys are restricted to super_admin, one step
              stricter than the rest of this page.
            </p>
          </div>
        )}

        {isSuperAdmin && secretsError && (
          <div className={`${CARD} mt-4 p-10 text-center`}>
            <AlertTriangle className="w-5 h-5 mx-auto text-slate-400 dark:text-gray-500" />
            <p className="mt-3 text-[13.5px] text-slate-600 dark:text-gray-300">Unable to load API keys.</p>
            <button
              onClick={() => void loadSecrets()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        {isSuperAdmin && !secretsError && secretsLoading && !secrets && (
          <div className={`${CARD} mt-4 p-10 text-center text-[13px] text-slate-400 dark:text-gray-500`}>
            Loading…
          </div>
        )}

        {isSuperAdmin && !secretsError && secrets && (
          <div className={`${CARD} mt-4 px-5`}>
            {secrets.map((row) => (
              <SecretKeyRow key={row.key} row={row} onSave={saveSecret} onClear={clearSecret} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
