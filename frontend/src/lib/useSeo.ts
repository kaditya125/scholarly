import { useEffect } from 'react';

/**
 * Sets the document title and social/meta tags for a route.
 *
 * ⚠ SCOPE, HONESTLY STATED: this app is a client-rendered SPA with no SSR and no
 * prerendering step, and index.html ships a single static <title>. Tags written here exist
 * only after React has run, which means:
 *
 *   · the browser tab, bookmarks and Google (which executes JS) DO see them;
 *   · Twitter/X, LinkedIn, WhatsApp, Slack and most other link unfurlers DO NOT — their
 *     scrapers read the raw HTML response and never run scripts.
 *
 * So this is worth having, but it is not a substitute for real Open Graph support. Making
 * link previews work needs prerendering or SSR for the public routes. Until then, treat the
 * og:* tags below as best-effort rather than as a shipped capability.
 *
 * Tags created here are removed on unmount so one route's metadata never leaks into another.
 */

export interface SeoOptions {
  title: string;
  description: string;
  /** Absolute URL for canonical + og:url. */
  url?: string;
  type?: string;
}

function upsertMeta(selector: string, attrs: Record<string, string>): { el: HTMLMetaElement; created: boolean } {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !el;
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
  return { el, created };
}

export function useSeo({ title, description, url, type = 'website' }: SeoOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    // Track what we touched so unmount can restore rather than blindly delete.
    const touched: { el: Element; created: boolean; prev: string | null; attr: string }[] = [];

    const set = (selector: string, attrs: Record<string, string>, contentAttr = 'content') => {
      const prev = document.head.querySelector(selector)?.getAttribute(contentAttr) ?? null;
      const { el, created } = upsertMeta(selector, attrs);
      touched.push({ el, created, prev, attr: contentAttr });
    };

    set('meta[name="description"]', { name: 'description', content: description });
    set('meta[property="og:title"]', { property: 'og:title', content: title });
    set('meta[property="og:description"]', { property: 'og:description', content: description });
    set('meta[property="og:type"]', { property: 'og:type', content: type });
    set('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    set('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    set('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    if (url) set('meta[property="og:url"]', { property: 'og:url', content: url });

    let link: HTMLLinkElement | null = null;
    let linkCreated = false;
    if (url) {
      link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
        linkCreated = true;
      }
      link.href = url;
    }

    return () => {
      document.title = prevTitle;
      touched.forEach(({ el, created, prev, attr }) => {
        if (created) el.remove();
        else if (prev !== null) el.setAttribute(attr, prev);
      });
      if (link && linkCreated) link.remove();
    };
  }, [title, description, url, type]);
}
