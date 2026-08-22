/**
 * J.11 — the generic discovery provider.
 *
 * Handles any authority that publishes through ordinary web infrastructure, which is most of them.
 * Strategies run in a deterministic order, weakest-evidence last:
 *
 *   1. REGISTERED_SOURCE  an operator already recorded this URL for the exam
 *   2. ROBOTS_REFERENCE   the authority's robots.txt names its sitemaps
 *   3. OFFICIAL_SITEMAP   the authority's own sitemap index
 *   4. OFFICIAL_HTML      links on the authority's own syllabus/notice pages
 *
 * EVERY URL ORIGINATES FROM SOMETHING THE AUTHORITY PUBLISHED. There is no strategy that builds a
 * URL from a guessed filename, and adding one would defeat the point: `/files/CGL_2026_Notice.pdf`
 * was exactly such a guess, and J.4 measured it returning the site's homepage under HTTP 200.
 *
 * This provider only LOCATES. It does not verify domains, validate payloads, hash, store or judge
 * relevance — those belong to services it deliberately cannot reach from here.
 */
import { logger } from '../../../utils/logger';
import type { ExamMaster } from '../../../types/exam.types';
import {
  OfficialDiscoveryProvider, DiscoveryContext, ProviderOutcome, StrategyEntry, DiscoveryStrategy,
} from './officialDiscoveryProvider';

/** Page paths worth checking on an authority's own host, from its registered official URLs. */
function candidatePages(exam: ExamMaster): string[] {
  const urls = exam.verifiedOfficialUrls ?? ({} as ExamMaster['verifiedOfficialUrls']);
  // Only URLs the exam registry already vouches for. Nothing is appended or invented.
  return [urls.syllabusPage, urls.notificationPage, urls.examPortal, urls.authorityHome]
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}

/** Extracts href/src targets from HTML without a DOM parser dependency. */
function extractLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    let resolved: string;
    try { resolved = new URL(href, baseUrl).toString(); } catch { continue; }
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ url: resolved, text });
  }
  return out;
}

/** Pulls <loc> entries out of a sitemap or sitemap index. */
function extractSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = loc.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

/** Sitemap: directives in robots.txt. */
function extractRobotsSitemaps(txt: string): string[] {
  return txt.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^sitemap\s*:/i.test(l))
    .map((l) => l.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean);
}

const looksLikeDocument = (url: string) => /\.(pdf|doc|docx)(\?|$)/i.test(url);

export class GenericOfficialDiscoveryProvider implements OfficialDiscoveryProvider {
  readonly id = 'generic-official';

  /** The fallback: claims any exam that has at least one registered official domain. */
  canHandle(exam: ExamMaster): boolean {
    return Array.isArray(exam.officialDomains) && exam.officialDomains.length > 0;
  }

  async discover(ctx: DiscoveryContext): Promise<ProviderOutcome> {
    const { exam, maxEntries } = ctx;
    const attempts: ProviderOutcome['attempts'] = [];
    const entries: StrategyEntry[] = [];

    const push = (list: StrategyEntry[]) => {
      for (const e of list) {
        if (entries.length >= maxEntries) return;
        if (!entries.some((x) => x.url === e.url)) entries.push(e);
      }
    };

    const record = (
      strategy: DiscoveryStrategy, url: string,
      outcome: ProviderOutcome['attempts'][number]['outcome'],
      entryCount: number, detail?: string, networkAttempted = true,
    ) => { attempts.push({ strategy, url, outcome, entryCount, detail, networkAttempted }); };

    // ── 1. REGISTERED_SOURCE ─────────────────────────────────────────────────────────────────
    // Strongest evidence: a human already recorded this as an official source for this exam.
    const registered = candidatePages(exam).filter(looksLikeDocument);
    if (registered.length > 0) {
      push(registered.map((url) => ({
        url, title: undefined, documentType: 'SYLLABUS' as const,
        strategy: 'REGISTERED_SOURCE' as const, foundVia: 'exam registry',
      })));
      // Local: reads the exam registry, contacts nobody.
      record('REGISTERED_SOURCE', 'exam registry', 'ENTRIES_FOUND', registered.length, undefined, false);
    } else {
      record('REGISTERED_SOURCE', 'exam registry', 'NO_ENTRIES', 0,
             'no registered official URL points directly at a document', false);
    }

    const origins = Array.from(new Set(
      candidatePages(exam).map((u) => { try { return new URL(u).origin; } catch { return null; } })
        .filter((o): o is string => !!o),
    ));

    // ── 2. ROBOTS_REFERENCE → 3. OFFICIAL_SITEMAP ────────────────────────────────────────────
    for (const origin of origins) {
      if (entries.length >= maxEntries) break;
      const robotsUrl = `${origin}/robots.txt`;
      let sitemaps: string[] = [];
      try {
        const res = await ctx.fetchText(robotsUrl);
        sitemaps = extractRobotsSitemaps(res.body);
        record('ROBOTS_REFERENCE', robotsUrl,
               sitemaps.length ? 'ENTRIES_FOUND' : 'NO_ENTRIES', sitemaps.length);
      } catch (err: any) {
        record('ROBOTS_REFERENCE', robotsUrl, 'UNAVAILABLE', 0, err?.message);
      }

      // A conventional sitemap location is only probed when robots.txt named none. This is the one
      // place a path is assumed rather than published — and it is a site-wide convention, not a
      // guessed document filename, so a miss yields nothing rather than a wrong document.
      if (sitemaps.length === 0) sitemaps = [`${origin}/sitemap.xml`];

      for (const sm of sitemaps.slice(0, 3)) {
        if (entries.length >= maxEntries) break;
        try {
          const res = await ctx.fetchText(sm);
          const locs = extractSitemapLocs(res.body);
          const docs = locs.filter(looksLikeDocument);
          push(docs.map((url) => ({
            url, strategy: 'OFFICIAL_SITEMAP' as const, foundVia: sm,
          })));
          record('OFFICIAL_SITEMAP', sm, docs.length ? 'ENTRIES_FOUND' : 'NO_ENTRIES', docs.length,
                 `${locs.length} loc entries, ${docs.length} document-like`);
        } catch (err: any) {
          record('OFFICIAL_SITEMAP', sm, 'UNAVAILABLE', 0, err?.message);
        }
      }
    }

    // ── 4. OFFICIAL_HTML ─────────────────────────────────────────────────────────────────────
    // Links on the authority's OWN pages. The link text becomes the candidate title, which is what
    // J.6's relevance assessment reads — so a link labelled "Answer Key" is disqualified there
    // rather than here. This layer does not judge.
    for (const page of candidatePages(exam)) {
      if (entries.length >= maxEntries) break;
      if (looksLikeDocument(page)) continue; // already taken as a registered source
      try {
        const res = await ctx.fetchText(page);
        if (!/html/i.test(res.contentType)) {
          record('OFFICIAL_HTML', page, 'SKIPPED', 0, `content-type ${res.contentType}`);
          continue;
        }
        const links = extractLinks(res.body, res.finalUrl)
          .filter((l) => looksLikeDocument(l.url));
        push(links.map((l) => ({
          url: l.url, title: l.text || undefined,
          strategy: 'OFFICIAL_HTML' as const, foundVia: res.finalUrl,
        })));
        record('OFFICIAL_HTML', page, links.length ? 'ENTRIES_FOUND' : 'NO_ENTRIES', links.length);
      } catch (err: any) {
        record('OFFICIAL_HTML', page, 'UNAVAILABLE', 0, err?.message);
      }
    }

    logger.info('[Discovery] generic provider finished', {
      examId: exam.examId, cycleId: ctx.cycleId,
      entries: entries.length, strategiesRun: attempts.length,
    });

    return { entries, attempts };
  }
}

export const genericOfficialDiscoveryProvider = new GenericOfficialDiscoveryProvider();
