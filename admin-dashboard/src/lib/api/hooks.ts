import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

async function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  const { data } = await apiClient.get<T>(url, { params });
  return data;
}

// ─── Read hooks (one per admin module) ──────────────────────────────
export const useAIMetrics = () =>
  useQuery({ queryKey: ['ai-metrics'], queryFn: () => get('/admin/metrics/ai'), refetchInterval: 30_000 });

export const useCostAnalytics = (days = 30) =>
  useQuery({ queryKey: ['costs', days], queryFn: () => get('/admin/metrics/costs', { days }) });

export const useSystemHealth = () =>
  useQuery({ queryKey: ['system-health'], queryFn: () => get('/admin/system/health'), refetchInterval: 15_000 });

export const useEvaluation = () =>
  useQuery({ queryKey: ['evaluation'], queryFn: () => get('/admin/evaluation') });

export const useIngestionJobs = () =>
  useQuery({ queryKey: ['curriculum-jobs'], queryFn: () => get('/admin/curriculum/jobs'), refetchInterval: 20_000 });

export const useKnowledgeGraph = () =>
  useQuery({ queryKey: ['knowledge-graph'], queryFn: () => get('/admin/knowledge-graph/nodes') });

export const useVectorDB = () =>
  useQuery({ queryKey: ['vector-db'], queryFn: () => get('/admin/vector-db/namespaces') });

export const usePrompts = () =>
  useQuery({ queryKey: ['prompts'], queryFn: () => get('/admin/prompts') });

export const useLearningAssets = () =>
  useQuery({ queryKey: ['assets'], queryFn: () => get('/admin/assets') });

export const useNotebooks = () =>
  useQuery({ queryKey: ['notebooks'], queryFn: () => get('/admin/notebooks') });

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => get('/admin/users') });

export const useSecurity = () =>
  useQuery({ queryKey: ['security'], queryFn: () => get('/admin/security/threats'), refetchInterval: 30_000 });

export const useLogs = () =>
  useQuery({ queryKey: ['logs'], queryFn: () => get('/admin/logs'), refetchInterval: 20_000 });

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => get('/admin/notifications'), refetchInterval: 30_000 });

export const useBackups = () =>
  useQuery({ queryKey: ['backups'], queryFn: () => get('/admin/backups') });

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => get('/admin/settings') });

export const useFeatureFlags = () =>
  useQuery({ queryKey: ['feature-flags'], queryFn: () => get('/admin/feature-flags') });

export const useDeleteNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/vector-db/namespaces/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vector-db'] })
  });
};

export const useVectorQuery = () =>
  useMutation({
    mutationFn: (data: { query: string; namespace: string; topK?: number }) =>
      apiClient.post('/admin/vector-db/query', data).then(res => res.data)
  });

// ─── Settings ────────────────────────────────────────────────────────
// ─── Mutations (with optimistic updates) ────────────────────────────
export const useToggleFeatureFlag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiClient.patch(`/admin/feature-flags/${name}`, { enabled }).then((r) => r.data),
    onMutate: async ({ name, enabled }) => {
      await qc.cancelQueries({ queryKey: ['feature-flags'] });
      const prev = qc.getQueryData<any>(['feature-flags']);
      qc.setQueryData<any>(['feature-flags'], (old: any) =>
        old
          ? { ...old, flags: (old.flags || []).map((f: any) => (f.name === name ? { ...f, enabled } : f)) }
          : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['feature-flags'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
  });
};

export const useResolveAlert = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/admin/security/alerts/${id}/resolve`).then((r) => r.data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['security'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

// ─── Exchange rates (display-only, external API) ────────────────────
// Fetches live USD-based FX rates for the Cost Analytics currency selector.
// Cached for 6h; callers fall back to approximate bundled rates on failure.
export const useExchangeRates = () =>
  useQuery({
    queryKey: ['fx-rates-usd'],
    queryFn: async () => {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data?.result !== 'success' || !data?.rates) throw new Error('FX rates unavailable');
      return data.rates as Record<string, number>;
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

// ─── Notebook management (detail + mutations) ───────────────────────
export const useNotebookDetail = (id: string | null) =>
  useQuery({
    queryKey: ['notebook-detail', id],
    queryFn: () => get(`/admin/notebooks/${id}`),
    enabled: !!id,
  });

export const useArchiveNotebook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      apiClient.patch(`/admin/notebooks/${id}`, { isArchived }).then((r) => r.data),
    onMutate: async ({ id, isArchived }) => {
      await qc.cancelQueries({ queryKey: ['notebooks'] });
      const prev = qc.getQueryData<any>(['notebooks']);
      qc.setQueryData<any>(['notebooks'], (old: any) =>
        old ? { ...old, notebooks: (old.notebooks || []).map((n: any) => (n.id === id ? { ...n, isArchived } : n)) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['notebooks'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notebooks'] }),
  });
};

export const useDeleteNotebook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/notebooks/${id}`).then((r) => r.data),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['notebooks'] });
      const prev = qc.getQueryData<any>(['notebooks']);
      qc.setQueryData<any>(['notebooks'], (old: any) =>
        old ? { ...old, notebooks: (old.notebooks || []).filter((n: any) => n.id !== id) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['notebooks'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notebooks'] }),
  });
};

export const useRenameNotebook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiClient.patch(`/admin/notebooks/${id}`, { title }).then((r) => r.data),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notebooks'] }),
  });
};
