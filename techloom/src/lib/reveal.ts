import { useEffect } from 'react';
import type { CSSProperties } from 'react';

/**
 * Scroll reveal.
 *
 * One observer for the whole document rather than one per component: sections
 * opt in with a `data-reveal` attribute, the observer sets `data-revealed` the
 * first time each one crosses the viewport, and styles.css does the rest with a
 * transform and an opacity. Nothing here touches layout, and each element is
 * unobserved as soon as it fires, so a long page costs one observer and no
 * scroll listener.
 */
export function useRevealObserver(routeKey: string) {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (elements.length === 0) return;

    const reveal = (el: HTMLElement) => {
      el.dataset.revealed = 'true';
    };

    // Reduced motion, or a browser without the API: show everything immediately.
    // The content is the point; the animation is not.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      elements.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      // A small bottom inset means an element animates as it comes up rather than
      // the instant its first pixel appears.
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // Re-scan on navigation: the previous page's nodes are gone and the new
    // page's have never been observed.
  }, [routeKey]);
}

type RevealStyle = CSSProperties & { '--reveal-delay'?: string };

/**
 * Props for one revealed element. The delay staggers items in a list; keep it
 * small — a stagger long enough to notice reads as a page that is slow, not one
 * that is considered.
 */
export function revealProps(delayMs = 0): { 'data-reveal': string; style?: RevealStyle } {
  return delayMs > 0
    ? { 'data-reveal': '', style: { '--reveal-delay': `${delayMs}ms` } }
    : { 'data-reveal': '' };
}
