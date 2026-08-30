import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firestore';
import { useAuth } from '../lib/AuthContext';

const TYPING_TTL_MS = 6000; // treat as "typing" only if updated within this window
const THROTTLE_MS = 3000; // rewrite our own typing doc at most this often

export interface TypingUser {
  uid: string;
  name: string;
}

/**
 * Typing indicators for a conversation/channel. `basePath` is the path segments of the parent doc
 * (e.g. `['dmConversations', convId]` or `['studyGroups', gid, 'channels', cid]`); typing docs live
 * in a `typing/{uid}` subcollection. `notifyTyping()` throttles writes and auto-clears after a pause.
 */
export function useTyping(basePath: string[] | null) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const lastWrite = useRef(0);
  const stopTimer = useRef<number | null>(null);

  const pathKey = basePath && basePath.every(Boolean) ? basePath.join('/') : '';
  const myTypingPath = pathKey && user?.uid ? `${pathKey}/typing/${user.uid}` : '';

  // Observe who's typing (excluding self), expiring stale entries via the TTL window.
  useEffect(() => {
    if (!pathKey || !user?.uid) {
      setTypingUsers([]);
      return;
    }
    const raw = new Map<string, { uid: string; name?: string; at?: number }>();
    const recompute = () => {
      const now = Date.now();
      setTypingUsers(
        [...raw.values()]
          .filter((d) => d.uid !== user.uid && d.at && now - d.at < TYPING_TTL_MS)
          .map((d) => ({ uid: d.uid, name: d.name || 'Someone' }))
      );
    };

    const unsub = onSnapshot(
      collection(db, `${pathKey}/typing`),
      (snap) => {
        raw.clear();
        snap.forEach((d) => raw.set(d.id, d.data() as any));
        recompute();
      },
      () => {}
    );
    const ttlTimer = window.setInterval(recompute, 2000);
    return () => {
      unsub();
      clearInterval(ttlTimer);
    };
  }, [pathKey, user?.uid]);

  // Clean up our own typing doc when leaving the conversation/channel.
  useEffect(() => {
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (myTypingPath) deleteDoc(doc(db, myTypingPath)).catch(() => {});
    };
  }, [myTypingPath]);

  const notifyTyping = () => {
    if (!myTypingPath || !user?.uid) return;
    const now = Date.now();
    if (now - lastWrite.current >= THROTTLE_MS) {
      lastWrite.current = now;
      setDoc(
        doc(db, myTypingPath),
        { uid: user.uid, name: user.displayName || 'Someone', at: now },
        { merge: true }
      ).catch(() => {});
    }
    // Clear our typing state a little after the last keystroke.
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => {
      lastWrite.current = 0;
      deleteDoc(doc(db, myTypingPath)).catch(() => {});
    }, TYPING_TTL_MS);
  };

  return { typingUsers, notifyTyping };
}
