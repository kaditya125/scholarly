/**
 * TechLoom Innovations — site configuration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  The single source of truth for every factual claim this website makes about
 *  the company. Nothing in a component hard-codes a company detail.
 *
 *  Two rules for this file:
 *
 *  1. VERIFIED ONLY. Every value here must be checkable against a real record —
 *     the Udyam registration, a domain we control, an inbox someone reads. If a
 *     fact is not available, the value is an empty string and the UI omits the
 *     row rather than inventing one. There are no client counts, revenue
 *     figures, headcounts, awards or partnerships in this file because none of
 *     them are verifiable.
 *
 *  2. NOTHING SENSITIVE. This repository is public and so is the site. PAN, bank
 *     details, personal phone numbers, personal email addresses, the proprietor's
 *     residential address and the social-category field from the Udyam
 *     certificate must never appear here. The registration *number* and the
 *     enterprise classification are already public information — they are printed
 *     on the certificate and shown in the Sadhya footer — so those are fine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const COMPANY = {
  name: 'TechLoom Innovations',
  /** Rendered as two stacked words in the wordmark. */
  nameParts: ['TechLoom', 'Innovations'] as const,

  tagline: 'Technology, thoughtfully built.',

  /** One line, used for meta descriptions and any place that needs a summary. */
  descriptor:
    'TechLoom Innovations builds practical digital products, software solutions and technology experiences.',

  /** The longer positioning line, used on the About page and in structured data. */
  positioning:
    'A technology and digital solutions company helping organisations turn complex ideas into practical digital products and technology solutions.',

  /**
   * Public business registration.
   *
   * Udyam is India's MSME register. The certificate classifies the enterprise as
   * a Micro enterprise and records its activity under computer programming,
   * consultancy and related IT services. Both facts, and the registration number,
   * are public — the number already appears in the Sadhya site footer.
   *
   * There is no CIN or GSTIN: the enterprise is not incorporated and is not GST
   * registered. Those fields stay empty so the UI omits them.
   */
  registration: {
    udyam: 'UDYAM-BR-26-0135079',
    registeredOn: '30 June 2024',
    classification: 'Micro enterprise',
    activity: 'Computer programming, consultancy and related IT services',
    constitution: 'Proprietorship',
    cin: '',
    gstin: '',
  },

  /**
   * Where the business operates from, at city level only.
   *
   * Deliberately not a street address: the address on the Udyam certificate is a
   * residential one, and publishing it would expose the proprietor's home.
   */
  location: 'Noida, Uttar Pradesh, India',

  /**
   * Public contact inbox.
   *
   * TODO: replace with a TechLoom-domain address once mail is configured for it.
   * Until then this is the entity's existing monitored inbox — TechLoom
   * Innovations is the legal entity behind sadhya.app, so mail to it reaches the
   * same people. Set to '' to hide the email row site-wide.
   */
  email: 'support@sadhya.app',

  /**
   * Where the contact form posts.
   *
   * Empty by default. With no endpoint the form falls back to composing a
   * pre-filled message in the visitor's mail client, which works with no backend
   * and sends nothing anywhere unexpected. Set VITE_CONTACT_ENDPOINT to a URL
   * that accepts a JSON POST to switch to a direct submission.
   */
  contactEndpoint: import.meta.env.VITE_CONTACT_ENDPOINT ?? '',

  /**
   * Social profiles. Every entry renders a link, so an entry that does not exist
   * is a dead link — add a row only when the profile is real.
   */
  social: [] as ReadonlyArray<{ name: string; href: string }>,

  /** Bump when the site notices below are revised. */
  legalLastUpdated: '2 September 2026',
} as const;

/**
 * The flagship product. Sadhya is built by TechLoom, not a client project, and
 * everything stated here is checkable on the product itself.
 */
export const SADHYA = {
  name: 'Sadhya',
  url: 'https://sadhya.app',
  domain: 'sadhya.app',
  role: 'Flagship product',
  summary:
    'Sadhya is a digital learning platform exploring how AI can make learning more personalised, interactive and accessible.',
} as const;

/**
 * The origin the site is served from, injected at build time from SITE_URL.
 * Empty during development and in any build where it was not supplied — callers
 * must handle that rather than assuming a domain.
 */
export const SITE_URL: string = __SITE_URL__;

/** Absolute URL for a path, or an empty string when the origin is unknown. */
export const absoluteUrl = (path: string): string =>
  SITE_URL ? `${SITE_URL.replace(/\/+$/, '')}${path}` : '';

export const NAV_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Products', href: '/products' },
  { label: 'Approach', href: '/#approach' },
] as const;
