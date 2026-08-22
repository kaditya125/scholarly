import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query as fsQuery, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

const HEARTBEAT_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 60_000;
const FRESH_MS = 300_000; // 5 minutes

/**
 * Publishes the current user's presence: writes `online` immediately, then heartbeats every 60s
 * while the tab is visible, plus throttled updates on user interaction.
 * Mount once app-wide.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, 'presence', user.uid);
    let lastWriteTime = 0;

    const write = (state: 'online' | 'offline', force = false) => {
      const now = Date.now();
      if (!force && state === 'online' && now - lastWriteTime < ACTIVITY_THROTTLE_MS) {
        return;
      }
      lastWriteTime = now;
      setDoc(ref, { uid: user.uid, state, lastActive: now }, { merge: true }).catch(() => {});
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

/** Reactive set of the given uids that are currently online (fresh heartbeat within 60s). */
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
