/**
 * Company identity — the single source of truth for anything the backend states
 * about the business in customer-facing output (receipt emails, refund emails,
 * and the knowledge the AI answers company questions from).
 *
 * WHY THIS EXISTS. These values were hardcoded inline in eleven places across
 * zeptoMail.service.ts, again in scripts/list_users.ts, and a third time in
 * services/knowledge/sadhyaKnowledge.ts — each an independent copy, and they had
 * already drifted apart: the email templates said "Noida", the AI knowledge base
 * said "Bengaluru", and the frontend said a third thing. Correcting the company
 * name meant finding every copy, and one was missed for months.
 *
 * The frontend equivalent is frontend/src/lib/siteConfig.ts. These two must agree.
 * If you change a value here, change it there too.
 */

export const COMPANY = {
  /**
   * The registered legal entity that contracts with users and receives payments.
   *
   * TechLoom Innovations is a sole proprietorship (Udyam UDYAM-BR-26-0135079,
   * registered 30 Jun 2024). Sadhya is its product, not a separate company.
   *
   * This MUST match the name registered with Razorpay or settlements are held.
   */
  legalEntity: 'TechLoom Innovations',

  /** Public business registration. No CIN/GSTIN — not incorporated, not GST-registered. */
  udyam: 'UDYAM-BR-26-0135079',

  /**
   * Postal address printed on receipts and refund confirmations.
   *
   * TODO: this is inherited from the previous placeholder and does NOT match the
   * registered address on the Udyam certificate (Bihta, District Patna, Bihar
   * 801103). It appears on customer tax receipts, so decide which address should
   * be public and set it in both this file and siteConfig.ts.
   */
  address: 'Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India',

  support: {
    email: 'support@sadhya.app',
  },
} as const;

/**
 * Email footer attribution.
 *
 * Deliberately makes NO trademark claim. The previous text read "Sadhya is a
 * registered trademark of Sadhya Technologies Pvt. Ltd." — asserting both a
 * company that does not exist and a trademark that was never filed. Asserting an
 * unregistered mark as registered is a misrepresentation, so the claim is gone
 * rather than reworded. If a trademark is granted (ipindia.gov.in, class 41 for
 * education services / class 42 for software), add it back with the number.
 */
export const emailCopyrightLine = (year: number = new Date().getFullYear()): string =>
  `© ${year} ${COMPANY.legalEntity}. All rights reserved.`;
