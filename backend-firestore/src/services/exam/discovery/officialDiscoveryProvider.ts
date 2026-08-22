/**
 * J.11 — the discovery PROVIDER contract.
 *
 * J.6 built the judgement half of discovery: given candidate entries it verifies the domain, proves
 * the payload is a document, assesses relevance and refuses to guess between ties. What it never
 * had was the ACQUISITION half — nothing in the codebase produced `RawDiscoveryEntry[]`, and the
 * service had zero production callers. This is that half.
 *
 * THE ARCHITECTURAL RULE: no `if (examId === 'SSC_CGL')` anywhere in the engine. Authorities differ
 * enormously — some publish a static index, some a sitemap, some a JSON API behind an Angular
 * shell — and encoding that as branches would make every new exam an edit to shared code. A
 * provider declares which authorities it handles and returns candidate ENTRIES; it never decides
 * authority, validity or identity.
 *
 * What a provider may NOT do, enforced by having no access to the services that would allow it:
 *   · decide a domain is official (officialSourceVerificationService owns that)
 *   · decide a payload is a document (examDocumentStorageService's J.4 checks own that)
 *   · hash, store, or publish anything (J.5 owns that)
 *   · mint canonical identity (syllabusCanonicalGraph owns that)
 *
 * A provider's entire job is: "here are URLs I found on this authority's own infrastructure, and
 * here is how I found each one." Every URL must come from something the authority itself published
 * — a registered source, its sitemap, its robots.txt, its API, or a link on its own page. There is
 * deliberately no strategy that constructs a URL from a guessed filename.
 */
import type { ExamMaster } from '../../../types/exam.types';
import type { RawDiscoveryEntry, DiscoveryMethod } from '../syllabusSourceDiscovery.service';

/**
 * How an entry was found. Ordered by how much the authority itself vouches for it: a URL it
 * published in its own sitemap is stronger evidence than one scraped from page markup.
 */
export type DiscoveryStrategy =
  /** Already registered in the exam's official source registry by an operator. */
  | 'REGISTERED_SOURCE'
  /** Listed in the authority's own sitemap.xml. */
  | 'OFFICIAL_SITEMAP'
  /** Referenced from the authority's robots.txt (Sitemap: directives). */
  | 'ROBOTS_REFERENCE'
  /** Returned by the authority's own public JSON API. */
  | 'OFFICIAL_API'
  /** Linked from an official HTML page the authority serves. */
  | 'OFFICIAL_HTML'
  /** An attachment/document endpoint the authority's own client references. */
  | 'OFFICIAL_ATTACHMENT'
  /** Required JavaScript execution to become visible. */
  | 'BROWSER_RENDERED';

/** Maps a strategy onto J.6's existing DiscoveryMethod vocabulary — no second taxonomy. */
export const STRATEGY_TO_METHOD: Record<DiscoveryStrategy, DiscoveryMethod> = {
  REGISTERED_SOURCE: 'OPERATOR_SUPPLIED',
  OFFICIAL_SITEMAP: 'OFFICIAL_SITEMAP',
  ROBOTS_REFERENCE: 'OFFICIAL_SITEMAP',
  OFFICIAL_API: 'OFFICIAL_API',
  OFFICIAL_HTML: 'OFFICIAL_PAGE',
  OFFICIAL_ATTACHMENT: 'OFFICIAL_LISTING',
  BROWSER_RENDERED: 'OFFICIAL_PAGE',
};

export interface DiscoveryContext {
  exam: ExamMaster;
  cycleId: string;
  /** Bounded so a sweep cannot walk an entire government site. */
  maxEntries: number;
  /** Injected so tests and the persisted harness exercise the real logic without real network. */
  fetchText: (url: string) => Promise<{ body: string; contentType: string; finalUrl: string }>;
}

/** An entry plus the provenance of how it was located. */
export interface StrategyEntry extends RawDiscoveryEntry {
  strategy: DiscoveryStrategy;
  /** The official URL this entry was found ON — the page, sitemap or API that listed it. */
  foundVia: string;
}

export interface ProviderOutcome {
  entries: StrategyEntry[];
  /** Strategies that ran and what each yielded. Auditable without re-running discovery. */
  attempts: Array<{
    strategy: DiscoveryStrategy;
    url: string;
    outcome: 'ENTRIES_FOUND' | 'NO_ENTRIES' | 'UNAVAILABLE' | 'SKIPPED';
    entryCount: number;
    detail?: string;
    /**
     * Whether this attempt actually contacted the authority over the network.
     *
     * REGISTERED_SOURCE reads the exam registry and makes no request, so it says nothing about
     * whether the authority is reachable. Without this distinction its "NO_ENTRIES" masked a total
     * network outage: every real strategy could fail with UNAVAILABLE and the engine would still
     * conclude "no official document exists" — collapsing "the site was down" into "this exam
     * publishes no syllabus", which are different operational facts.
     */
    networkAttempted: boolean;
  }>;
}

export interface OfficialDiscoveryProvider {
  /** Stable identifier, used in audit records. */
  readonly id: string;
  /** Whether this provider claims the exam's authority. Registry picks the first that does. */
  canHandle(exam: ExamMaster): boolean;
  discover(ctx: DiscoveryContext): Promise<ProviderOutcome>;
}

/**
 * Provider registry.
 *
 * Deterministic: providers are consulted in registration order and the FIRST that claims the exam
 * wins, with the generic provider registered last as the fallback. An authority-specific provider
 * therefore overrides the generic one without the generic one knowing it exists.
 */
export class DiscoveryProviderRegistry {
  private providers: OfficialDiscoveryProvider[] = [];

  register(provider: OfficialDiscoveryProvider): this {
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`[DiscoveryRegistry] duplicate provider id: ${provider.id}`);
    }
    this.providers.push(provider);
    return this;
  }

  /** The provider that will handle this exam, or null when none claims it. */
  resolve(exam: ExamMaster): OfficialDiscoveryProvider | null {
    return this.providers.find((p) => p.canHandle(exam)) ?? null;
  }

  list(): ReadonlyArray<OfficialDiscoveryProvider> {
    return [...this.providers];
  }
}
