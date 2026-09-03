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
  /** Who to reply to. Sent as a top-level field: most inbox APIs require it. */
  name: string;
  email: string;
  /** Subject line. Used by the mail-client fallback and sent to the endpoint. */
  subject: string;
  /** Human-readable body — the whole enquiry, readable without parsing. */
  body: string;
  /** Structured extras, for an endpoint that would rather parse than read. */
  payload?: Record<string, unknown>;
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
        /* Field names match the inbox API this site is meant to post to:
           name, email, channel, subject, message. They are written explicitly
           and placed AFTER the spread so a key in `payload` cannot quietly
           shadow one of them — a form that renames `message` to something the
           endpoint ignores fails by delivering nothing, and a 200 response
           makes that look like success.

           `channel` is 'sales' because these are project enquiries rather than
           support requests. An unrecognised value would be silently coerced to
           'support' at the other end, which is the wrong inbox, not an error. */
        body: JSON.stringify({
          ...enquiry.payload,
          name: enquiry.name,
          email: enquiry.email,
          channel: 'sales',
          subject: enquiry.subject,
          message: enquiry.body,
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
