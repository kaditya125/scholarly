import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query as fsQuery, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

const HEARTBEAT_MS = 30_000;
const FRESH_MS = 60_000;

/**
 * Publishes the current user's presence: writes `online` immediately, then heartbeats every 30s
 * while the tab is visible, and best-effort `offline` on unmount / page hide. Mount once app-wide.
 * Staleness (a closed tab that can't write offline) is handled by readers via the freshness window.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, 'presence', user.uid);
    const write = (state: 'online' | 'offline') =>
      setDoc(ref, { uid: user.uid, state, lastActive: Date.now() }, { merge: true }).catch(() => {});

    write('online');
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') write('online');
    }, HEARTBEAT_MS);

    const onVisibility = () => write(document.visibilityState === 'visible' ? 'online' : 'offline');
    const onHide = () => write('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      write('offline');
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
