import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';

export const ENTITLEMENT_CHANGED_EVENT = 'sadhya:entitlement-changed';
export const notifyEntitlementChanged = () =>
  window.dispatchEvent(new Event(ENTITLEMENT_CHANGED_EVENT));

export interface UsageMetric {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
}

export interface VoiceMetric {
  usedSeconds: number;
  usedMinutes: number;
  limitMinutes: number;
  remainingMinutes: number;
  percent: number;
}

export interface UserUsageData {
  plan: 'free' | 'pro';
  isPro: boolean;
  periodKey: string;
  periodStart: number;
  periodEnd: number;
  resetsAt: number;
  metrics: {
    chat: UsageMetric;
    voice: VoiceMetric;
    documents: UsageMetric;
    podcasts: UsageMetric;
    mockTests: UsageMetric;
  };
}

const DEFAULT_FREE_METRICS: UserUsageData = {
  plan: 'free',
  isPro: false,
  periodKey: 'default',
  periodStart: Date.now(),
  periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
  resetsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  metrics: {
    chat: { used: 0, limit: 100, remaining: 100, percent: 0 },
    voice: { usedSeconds: 0, usedMinutes: 0, limitMinutes: 15, remainingMinutes: 15, percent: 0 },
    documents: { used: 0, limit: 5, remaining: 5, percent: 0 },
    podcasts: { used: 0, limit: 1, remaining: 1, percent: 0 },
    mockTests: { used: 0, limit: 3, remaining: 3, percent: 0 },
  },
};

export function useEntitlements() {
  const { user } = useAuth();
  const [data, setData] = useState<UserUsageData>(DEFAULT_FREE_METRICS);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setData(DEFAULT_FREE_METRICS);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.get('/payments/usage')
      .then((res) => {
        if (cancelled) return;
        if (res.data && res.data.metrics) {
          setData(res.data);
        }
      })
      .catch((err) => {
        console.warn('[useEntitlements] fetch failed, fallback to defaults:', err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  // Refetch when entitlement changes or tab regains focus
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(ENTITLEMENT_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      window.removeEventListener(ENTITLEMENT_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [refresh]);

  return {
    plan: data.plan,
    isPro: data.isPro,
    usage: data.metrics,
    resetsAt: data.resetsAt,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    loading,
    refresh,
  };
}
