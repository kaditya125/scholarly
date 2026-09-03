import { COMPANY } from '@/site.config';

/**
 * How an enquiry actually left the browser.
 *
 * `handoff` is not a lesser kind of success — it means the visitor's own mail
 * client was opened with the message composed. Nothing was transmitted, so the
 * UI has to say something different from `sent`, or it would be claiming a
 * delivery that has not happened yet.
 */
export type EnquiryOutcome = 'sent' | 'handoff' | 'error';

export type Enquiry = {
  /** Subject line, used only by the mail-client fallback. */
  subject: string;
  /** Human-readable body. The fallback sends this; the endpoint receives it too. */
  body: string;
  /** Structured fields, for an endpoint that would rather parse than read. */
  payload: Record<string, unknown>;
};

/**
 * Sends an enquiry by the best route the deployment actually has.
 *
 *   1. A configured endpoint, if one is set.
 *   2. The visitor's own mail client, pre-filled.
 *
 * The second route is why this site needs no backend to be useful, and why it
 * sends nothing anywhere the visitor cannot see. Both forms on the site share
 * this function rather than each carrying a copy — two copies of a submission
 * path drift, and the one that drifts is always the one nobody tests.
 */
export async function submitEnquiry(enquiry: Enquiry): Promise<EnquiryOutcome> {
  if (COMPANY.contactEndpoint) {
    try {
      const response = await fetch(COMPANY.contactEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enquiry.payload,
          subject: enquiry.subject,
          body: enquiry.body,
          source: 'srijya-site',
        }),
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return 'sent';
    } catch {
      return 'error';
    }
  }

  if (COMPANY.email) {
    window.location.href = `mailto:${COMPANY.email}?subject=${encodeURIComponent(
      enquiry.subject
    )}&body=${encodeURIComponent(enquiry.body)}`;
    return 'handoff';
  }

  return 'error';
}
