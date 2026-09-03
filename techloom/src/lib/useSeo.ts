import { useEffect } from 'react';
import { absoluteUrl, COMPANY } from '@/site.config';

type Seo = {
  /** Full <title>. Pages pass their own; it is not decorated further. */
  title: string;
  description: string;
  /** Site-root-relative path, e.g. '/about'. Used for the canonical and og:url. */
  path: string;
};

/** Creates or updates a single meta/link tag, keyed by its identifying attribute. */
function setTag(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

/**
 * Per-route metadata for a client-rendered site.
 *
 * index.html carries the home page's tags for the crawlers and preview scrapers
 * that never run scripts; this keeps the tags honest for everyone who navigates
 * after that. Canonical and og:url are emitted only when the build knew its own
 * origin — see the SITE_URL note in vite.config.ts.
 */
export function useSeo({ title, description, path }: Seo) {
  useEffect(() => {
    document.title = title;

    setTag(
      'meta[name="description"]',
      () => Object.assign(document.createElement('meta'), { name: 'description' }),
      (el) => el.setAttribute('content', description)
    );

    const og: Array<[string, string]> = [
      ['og:title', title],
      ['og:description', description],
      ['og:site_name', COMPANY.name],
      ['og:type', 'website'],
    ];
    for (const [property, content] of og) {
      setTag(
        `meta[property="${property}"]`,
        () => {
          const el = document.createElement('meta');
          el.setAttribute('property', property);
          return el;
        },
        (el) => el.setAttribute('content', content)
      );
    }

    for (const [name, content] of [
      ['twitter:title', title],
      ['twitter:description', description],
    ] as Array<[string, string]>) {
      setTag(
        `meta[name="${name}"]`,
        () => Object.assign(document.createElement('meta'), { name }),
        (el) => el.setAttribute('content', content)
      );
    }

    const url = absoluteUrl(path);
    if (!url) return;

    setTag(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      (el) => el.setAttribute('href', url)
    );
    setTag(
      'meta[property="og:url"]',
      () => {
        const el = document.createElement('meta');
        el.setAttribute('property', 'og:url');
        return el;
      },
      (el) => el.setAttribute('content', url)
    );
  }, [title, description, path]);
}
