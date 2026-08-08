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
