import { useEffect, useState } from 'react';
import { documentsApi } from '../../lib/api/documents';
import { renderFirstPageDataUrl } from '../../lib/pdfCover';
import { coverStore } from '../../lib/coverStore';
import { auth } from '../../lib/firebase';

// Session + persistent caches, keyed per chapter (notebook + source), so each chapter's real first
// page is fetched + rasterized at most once, then reappears instantly on every later view.
const mem = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

const keyFor = (notebookId: string, sourceId: string) => `ch:${notebookId}:${sourceId}`;

function readCached(key: string): string | null {
  const m = mem.get(key);
  if (m) return m;
  const stored = coverStore.get(key);
  if (stored) {
    mem.set(key, stored);
    return stored;
  }
  return null;
}

async function loadChapterCover(notebookId: string, sourceId: string): Promise<string> {
  const key = keyFor(notebookId, sourceId);
  const cached = readCached(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(documentsApi.chapterCoverUrl(notebookId, sourceId), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`Chapter cover fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const dataUrl = await renderFirstPageDataUrl(buf);
    mem.set(key, dataUrl);
    coverStore.set(key, dataUrl);
    return dataUrl;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Lazily provides the rendered first page of a chapter's PDF. Returns a cached data URL
 * synchronously on first render when seen before (this session or a previous one), so the real
 * page shows without a flash; only first-ever views hit the network. Returns null while loading or
 * when the chapter has no stored PDF — the caller keeps its own fallback.
 */
export function useChapterCover(
  notebookId: string | null,
  sourceId: string | null,
  enabled = true
): { coverUrl: string | null; isLoading: boolean } {
  const [coverUrl, setCoverUrl] = useState<string | null>(() =>
    notebookId && sourceId ? readCached(keyFor(notebookId, sourceId)) : null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!notebookId || !sourceId || !enabled) return;

    const cached = readCached(keyFor(notebookId, sourceId));
    if (cached) {
      setCoverUrl(cached);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    loadChapterCover(notebookId, sourceId)
      .then((url) => { if (!cancelled) setCoverUrl(url); })
      .catch(() => { if (!cancelled) setCoverUrl(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [notebookId, sourceId, enabled]);

  return { coverUrl, isLoading };
}
