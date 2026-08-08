import { useEffect, useState } from 'react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';

/**
 * Fetches the current user's subscription plan from the backend so the UI can show a
 * "Pro" badge and hide upgrade CTAs once the user has paid. Re-runs when the user changes.
 */
export function usePlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<string>('free');
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setPlan('free');
      setIsPro(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get('/payments/subscription')
      .then((res) => {
        if (cancelled) return;
        setPlan(res.data?.plan || 'free');
        setIsPro(!!res.data?.isPro);
      })
      .catch(() => { /* default to free on error */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  return { plan, isPro, loading };
}
