/**
 * Durable, cross-reload cache for rendered book covers (JPEG data URLs), backed by localStorage.
 *
 * Covers are fetched from the backend and rasterized with pdfjs — both slow — so without a
 * persistent cache every page reload re-does that work and briefly shows the placeholder before
 * the real cover fades in. Persisting the rendered image means that once a cover has been seen,
 * it reappears INSTANTLY on the next load (synchronous read, no network, no re-render).
 *
 * localStorage is used (not IndexedDB) specifically because it's synchronous, so the cover can be
 * hydrated during the very first render with zero flash. To stay within the ~5MB quota we store
 * compact JPEGs and evict the oldest covers automatically when a write would overflow.
 */

const PREFIX = 'bc_v2:';
const INDEX_KEY = 'bc_idx_v2';

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export const coverStore = {
  /** Synchronously returns a previously-rendered cover data URL, or null. */
  get(id: string): string | null {
    try {
      return localStorage.getItem(PREFIX + id);
    } catch {
      return null;
    }
  },

  /** Persists a rendered cover, evicting the oldest entries if the quota is hit. */
  set(id: string, dataUrl: string): void {
    const index = readIndex();

    const tryWrite = (): boolean => {
      try {
        localStorage.setItem(PREFIX + id, dataUrl);
        return true;
      } catch {
        return false;
      }
    };

    if (tryWrite()) {
      if (!index.includes(id)) {
        index.push(id);
        writeIndex(index);
      }
      return;
    }

    // Quota exceeded → drop the oldest covers one by one until the new one fits.
    while (index.length > 0) {
      const oldest = index.shift();
      if (!oldest || oldest === id) continue;
      try {
        localStorage.removeItem(PREFIX + oldest);
      } catch {
        /* ignore */
      }
      if (tryWrite()) {
        if (!index.includes(id)) index.push(id);
        writeIndex(index);
        return;
      }
    }
    // Couldn't cache even after evicting everything — give up silently.
    writeIndex(index);
  },
};
