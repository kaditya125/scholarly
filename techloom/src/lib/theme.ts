import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'srijya-theme';

/** What the page is actually showing right now, including the system default. */
function resolveTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Light/dark, with the system preference as the default.
 *
 * The initial value is read from the DOM rather than from storage, because the
 * inline script in index.html has already applied it — reading it back is what
 * keeps the toggle's label correct on first paint instead of flipping after
 * hydration. A visitor who has not chosen keeps following their system setting,
 * including when they change it mid-visit.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'light' : resolveTheme()
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      // Only follow the system while the visitor has expressed no preference.
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* private mode */
      }
      if (stored !== 'light' && stored !== 'dark') setTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* The choice still applies for this page view. */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
