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
   * TODO: replace with the registered company name.
   */
  legalEntity: 'Sadhya Technologies Private Limited',

  /** TODO: replace with the CIN / GSTIN you want shown publicly (or set to ''). */
  cin: '',
  gstin: '',

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
   * Social profiles.
   *
   * TODO: replace every URL with your real handle, and DELETE any row you don't have.
   * The footer renders exactly what's in this array — removing an entry removes the
   * icon, so there is never a dead link pointing at a profile that doesn't exist.
   */
  social: [
    { name: 'X (Twitter)', href: 'https://x.com/sadhyalearn', icon: 'x' },
    { name: 'LinkedIn', href: 'https://www.linkedin.com/company/sadhyalearn', icon: 'linkedin' },
    { name: 'Instagram', href: 'https://www.instagram.com/sadhyalearn', icon: 'instagram' },
    { name: 'YouTube', href: 'https://www.youtube.com/@sadhyalearn', icon: 'youtube' },
    { name: 'GitHub', href: 'https://github.com/sadhyalearn', icon: 'github' },
  ] as const,

  /** Shown as "Last updated" on every legal page. Bump when you revise them. */
  legalLastUpdated: '12 August 2026',
} as const;

export type SocialIcon = (typeof SITE.social)[number]['icon'];

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
 * user is actually charged — see backend-firestore/src/services/payments.service.ts
 * (`PLANS.pro.monthlyINR = 499`, `YEARLY_DISCOUNT = 0.85`). Keep these in sync; the
 * server recomputes the amount on every order, so a mismatch here would only ever
 * mislead the visitor, never overcharge them.
 *
 * `institution` has no server-side plan definition on purpose — it is a sales
 * conversation, not a self-serve checkout, so its CTA opens email rather than /checkout.
 */
export const PRO_MONTHLY_INR = 499;
export const YEARLY_DISCOUNT = 0.85; // 15% off
export const PRO_YEARLY_PER_MONTH_INR = Math.round(PRO_MONTHLY_INR * YEARLY_DISCOUNT); // 424
export const PRO_YEARLY_TOTAL_INR = PRO_YEARLY_PER_MONTH_INR * 12; // 5088
