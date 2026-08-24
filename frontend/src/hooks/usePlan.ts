import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';

/**
 * Broadcast that the server-side entitlement has changed. Call this after a payment is verified
 * so every mounted `usePlan` refetches immediately.
 *
 * Without it the hook only refetched when `user` changed — and paying does not change the
 * Firebase user — so a member who had just upgraded kept seeing "Upgrade to Pro" in the sidebar
 * until they manually reloaded the page.
 */
export const ENTITLEMENT_CHANGED_EVENT = 'sadhya:entitlement-changed';
export const notifyEntitlementChanged = () =>
  window.dispatchEvent(new Event(ENTITLEMENT_CHANGED_EVENT));

/**
 * Fetches the current user's subscription plan from the backend so the UI can show a
 * "Pro" badge and hide upgrade CTAs once the user has paid.
 *
 * The backend is the only authority here: this reads GET /payments/subscription, which derives
 * from the same `users/{uid}` record the order endpoint enforces against. Nothing is cached in
 * localStorage, so the button and the API cannot disagree.
 */
export function usePlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<string>('free');
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

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
  }, [user, nonce]);

  // Refetch when a payment completes anywhere in the app, and when the tab regains focus —
  // the latter also covers an entitlement granted by the webhook while the tab sat idle.
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(ENTITLEMENT_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      window.removeEventListener(ENTITLEMENT_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [refresh]);

  return { plan, isPro, loading, refresh };
}
