import { useEffect, useState } from 'react';
import { documentsApi } from '../../lib/api/documents';
import { renderFirstPageDataUrl } from '../../lib/pdfCover';
import { coverStore } from '../../lib/coverStore';
import { auth } from '../../lib/firebase';

// In-memory cache for the current session (fast, survives SPA navigation) layered on top of the
// durable localStorage cache (survives full reloads). Together they mean a cover is fetched +
// rasterized at most once, then reappears instantly forever after.
const coverCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

// A cover load downloads a full PDF and rasterizes its first page client-side — real work, not
// a thumbnail fetch. A collection grid can mount dozens of cards at once; without a cap, every
// one of them fires its own concurrent PDF download + canvas render simultaneously, which is
// exactly what was hanging the page on mobile (limited memory and a much weaker CPU than
// desktop make a burst of ~20-50 concurrent PDF rasterizations far more punishing there).
// Viewport gating in BookCover.tsx is the primary fix — this queue is the safety net for
// whatever still ends up "visible enough" at once (fast scrolling, larger screens).
const MAX_CONCURRENT_LOADS = 3;
let activeLoads = 0;
const loadQueue: (() => void)[] = [];

function runNext() {
  if (activeLoads >= MAX_CONCURRENT_LOADS) return;
  const next = loadQueue.shift();
  if (next) next();
}

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    const attempt = () => {
      activeLoads++;
      resolve();
    };
    if (activeLoads < MAX_CONCURRENT_LOADS) attempt();
    else loadQueue.push(attempt);
  });
}

function releaseSlot() {
  activeLoads--;
  runNext();
}

/** Returns an already-available cover (memory → persistent store) without any network work. */
function readCached(id: string): string | null {
  const mem = coverCache.get(id);
  if (mem) return mem;
  const stored = coverStore.get(id);
  if (stored) {
    coverCache.set(id, stored); // promote into the fast in-memory cache
    return stored;
  }
  return null;
}

async function loadCover(notebookId: string): Promise<string> {
  const cached = readCached(notebookId);
  if (cached) return cached;

  const existing = inFlight.get(notebookId);
  if (existing) return existing;

  const promise = (async () => {
    await acquireSlot();
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(documentsApi.coverUrl(notebookId), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Cover fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      const dataUrl = await renderFirstPageDataUrl(buf);
      coverCache.set(notebookId, dataUrl);
      coverStore.set(notebookId, dataUrl); // persist so it survives reloads
      return dataUrl;
    } finally {
      releaseSlot();
    }
  })();

  inFlight.set(notebookId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(notebookId);
  }
}

/**
 * Lazily provides a book's real cover. On any load where the cover was seen before (this session
 * OR a previous one, via localStorage), it's returned synchronously on the FIRST render — no
 * flash, no backend round-trip. Only first-ever views hit the network.
 */
export function useBookCover(notebookId: string | null, enabled = true): { coverUrl: string | null; isLoading: boolean } {
  const [coverUrl, setCoverUrl] = useState<string | null>(() => (notebookId ? readCached(notebookId) : null));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!notebookId || !enabled) return;

    const cached = readCached(notebookId);
    if (cached) {
      setCoverUrl(cached);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    loadCover(notebookId)
      .then((url) => { if (!cancelled) setCoverUrl(url); })
      .catch(() => { if (!cancelled) setCoverUrl(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [notebookId, enabled]);

  return { coverUrl, isLoading };
}
