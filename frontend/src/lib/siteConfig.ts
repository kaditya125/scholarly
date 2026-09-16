/**
 * Public-site configuration — the single source of truth for everything the marketing
 * pages, the footer and the legal pages need to say about the company.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  ⚠  BEFORE GOING LIVE, REPLACE EVERY VALUE MARKED `TODO` BELOW.
 *
 *  These are placeholders. They are grouped here (rather than scattered through the
 *  footer and six legal pages) so that filling them in is a single edit. Nothing else
 *  in the app hard-codes a company detail.
 *
 *  Razorpay's merchant-activation review specifically checks that the live site has a
 *  reachable Contact page with a real email + phone + registered address, plus Terms,
 *  Privacy and Refund pages. Placeholder values will fail that review.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

export const SITE = {
  /** Product name, used in copy and legal text. */
  name: 'Sadhya',

  /**
   * Brand line. Sadhya (साध्य) is Sanskrit for "that which is to be attained", so the
   * tagline is the word's own definition — the name explains itself.
   */
  tagline: 'Every goal, attainable.',

  /** One-line functional descriptor, for meta tags and app-store style listings. */
  descriptor: 'AI-powered preparation for competitive exams.',

  /** Public marketing domain, no protocol. TODO: confirm once DNS is pointed. */
  domain: 'sadhya.app',
  url: 'https://sadhya.app',

  /**
   * The registered legal entity that contracts with users and receives payments.
   * This MUST match the name registered with Razorpay or settlements will be held.
   *
   * TechLoom Innovations is a sole proprietorship (Udyam UDYAM-BR-26-0135079,
   * registered 30 Jun 2024). Sadhya is its product, not a separate company — so
   * this is the name that appears in the Terms, the Privacy Policy and the
   * copyright line, and the one Razorpay settles against.
   */
  legalEntity: 'TechLoom Innovations',

  /**
   * The brand the company trades under, and the parent of this product.
   *
   * Deliberately separate from `legalEntity` above. Srijya is what the company
   * calls itself; TechLoom Innovations is what the Udyam register calls it, what
   * Razorpay settles against, and what has to appear in the Terms, the Privacy
   * Policy and the copyright line. Those are different jobs and conflating them
   * is how a settlement gets held.
   *
   * Use this wherever the sentence is about who makes Sadhya. Use legalEntity
   * wherever the sentence has legal or financial weight. When the Udyam record
   * is amended the two become the same string and nothing else has to move.
   */
  parentBrand: 'Srijya',

  /** Public business registration. No CIN/GSTIN — not incorporated, not GST-registered. */
  cin: '',
  gstin: '',
  udyam: 'UDYAM-BR-26-0135079',

  /**
   * Where disputes are heard. Used in the Terms' governing-law clause.
   * Follows the registered office below — moved with it from Bengaluru to Noida.
   */
  jurisdiction: 'Noida, Uttar Pradesh, India',

  /** TODO: replace with real, monitored inboxes. */
  email: {
    support: 'support@sadhya.app',
    privacy: 'privacy@sadhya.app',
    legal: 'legal@sadhya.app',
    sales: 'sales@sadhya.app',
    security: 'security@sadhya.app',
  },

  /** Reachable number, shown on the Contact page (Razorpay requires one). */
  phone: '+91 91022 02267',

  /** Support coverage shown on the Contact page. TODO: confirm your real hours. */
  supportHours: 'Monday–Saturday, 10:00–19:00 IST',

  /** TODO: confirm the PIN code — it is the one part of this not supplied directly. */
  address: {
    line1: 'Tech Zone IV',
    line2: 'Sector 135',
    city: 'Noida',
    state: 'Uttar Pradesh',
    postalCode: '201304',
    country: 'India',
  },

  /**
   * The founder, exactly as /our-team, the structured data and the prerendered HTML publish him.
   *
   * One record so the page, the JSON-LD and the static HTML crawlers read cannot drift apart —
   * scripts/seo-prerender.ts fails the build if index.html's Person markup stops matching this.
   * The profile URLs were supplied by the founder. LinkedIn shows logged-out visitors a sign-in
   * wall, so neither LinkedIn URL can be checked from outside; the GitHub account is public.
   */
  founder: {
    name: 'Aditya Kumar',
    role: 'Founder & Product Engineer',
    email: 'aditya@sadhya.app',
    linkedin: 'https://www.linkedin.com/in/aditya-kumar-122370267/',
    github: 'https://github.com/kaditya125',
  },

  /**
   * Sadhya's LinkedIn company page, by its vanity URL. Verified 16 Sep 2026 from the founder's admin session:
   * name Sadhya, website https://sadhya.app, founded 2026. Use this form, not the numeric id (143600923): signed
   * out, the vanity URL returns the public page (200) while the numeric one only redirects to a login wall — so
   * only this link lets someone outside LinkedIn confirm the page exists.
   */
  linkedinCompany: 'https://www.linkedin.com/company/sadhya/',

  /**
   * Official social profiles — only accounts that actually exist and are run by Sadhya.
   *
   * The footer renders exactly what's in this array, so a row here is a public claim that the
   * account is ours. On 16 Sep 2026 every @sadhyalearn handle this used to list (X, Instagram,
   * Facebook, YouTube, GitHub, linkedin.com/company/sadhyalearn) was checked while logged out and
   * none of them exists. Add a row only after the account is live and links back to sadhya.app.
   */
  social: [
    { name: 'LinkedIn', href: 'https://www.linkedin.com/company/sadhya/', icon: 'linkedin' },
  ] as { name: string; href: string; icon: SocialIcon }[],

  /** Shown as "Last updated" on every legal page. Bump when you revise them. */
  legalLastUpdated: '12 August 2026',
} as const;

/** Every brand glyph the footer knows how to draw — independent of which accounts exist today. */
export type SocialIcon = 'x' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'github';

/** Formats the registered address as a single line (footer) or block (contact page). */
export const formatAddress = (join = ', ') =>
  [
    SITE.address.line1,
    SITE.address.line2,
    `${SITE.address.city} ${SITE.address.postalCode}`,
    `${SITE.address.state}, ${SITE.address.country}`,
  ]
    .filter(Boolean)
    .join(join);

/**
 * Subscription plans shown on the marketing pages.
 *
 * The Pro price is mirrored from the server, which is the only authority on what a
 * user is actually charged — see backend-firestore/src/services/payments.service.ts.
 *
 * Launch Event Promotion:
 * Regular: ₹499/mo (₹5,088/yr)
 * Launch Special: ₹199/mo (₹1,788/yr = ₹149/mo) — 60% Launch Discount!
 */
export const PRO_REGULAR_MONTHLY_INR = 499;
export const PRO_REGULAR_YEARLY_TOTAL_INR = 5088;

export const PRO_MONTHLY_INR = 199;
export const PRO_YEARLY_PER_MONTH_INR = 149;
export const PRO_YEARLY_TOTAL_INR = 1788; // 149 * 12
export const YEARLY_DISCOUNT = 0.75; // 25% extra saving on annual launch plan
