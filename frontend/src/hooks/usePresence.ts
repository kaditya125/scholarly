import { useEffect, useState } from 'react';
import { collection, onSnapshot, query as fsQuery, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { getAuth } from 'firebase/auth';

const HEARTBEAT_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 60_000;
const FRESH_MS = 300_000; // 5 minutes

// Resolve the backend base URL the same way the rest of the app does
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function postPresence(state: 'online' | 'offline') {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    const endpoint = state === 'online'
      ? `${API_BASE}/presence/heartbeat`
      : `${API_BASE}/presence/offline`;
    await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // silent – presence is best-effort
  }
}

/**
 * Publishes the current user's presence via the backend API (Admin SDK bypass).
 * Mount once app-wide via GlobalPresencePublisher in App.tsx.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    let lastWriteTime = 0;

    const write = (state: 'online' | 'offline', force = false) => {
      const now = Date.now();
      if (!force && state === 'online' && now - lastWriteTime < ACTIVITY_THROTTLE_MS) {
        return;
      }
      lastWriteTime = now;
      postPresence(state);
    };

    // Initial write
    write('online', true);

    // Periodic heartbeat
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        write('online', true);
      }
    }, HEARTBEAT_MS);

    // User activity listeners (throttled)
    const onUserActivity = () => {
      if (document.visibilityState === 'visible') {
        write('online', false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        write('online', true);
      } else {
        write('offline', true);
      }
    };

    const onHide = () => write('offline', true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('click', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('click', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      write('offline', true);
    };
  }, [user?.uid]);
}

/** Reactive set of the given uids that are currently online (fresh heartbeat within 5min). */
export function useOnlineStatuses(uids: string[]): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());
  const key = [...new Set(uids.filter(Boolean))].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setOnline(new Set());
      return;
    }

    const statuses = new Map<string, { state: string; lastActive: number }>();
    const recompute = () =>
      setOnline(
        new Set(
          [...statuses.entries()]
            .filter(([, v]) => v.state === 'online' && Date.now() - (v.lastActive || 0) < FRESH_MS)
            .map(([k]) => k)
        )
      );

    const unsubs: (() => void)[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const q = fsQuery(collection(db, 'presence'), where('uid', 'in', chunk));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            snap.forEach((d) => {
              const data = d.data() as { uid: string; state: string; lastActive?: number };
              statuses.set(data.uid, { state: data.state, lastActive: data.lastActive || 0 });
            });
            recompute();
          },
          () => {}
        )
      );
    }

    // Re-evaluate periodically so users drop to offline even without a new snapshot event.
    const staleTimer = window.setInterval(recompute, HEARTBEAT_MS);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(staleTimer);
    };
  }, [key]);

  return online;
}
