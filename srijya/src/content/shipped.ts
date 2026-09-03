/**
 * What Srijya has shipped, most recent first.
 *
 * WHY THIS PAGE EXISTS
 *
 * "Is this company actually doing anything?" is a fair question, and the usual
 * answers to it are dishonest — a wall of client logos, a headcount, a funding
 * round. This answers it with the only evidence that costs something to fake:
 * dated work, described plainly, most of which a reader can go and use.
 *
 * RULES
 *
 *  - Month granularity, not exact dates. A changelog claiming a specific day is
 *    asserting a precision nobody can check and nobody needs.
 *  - Shipped means available to someone outside the company. Work that is merged
 *    but not released does not go here.
 *  - No metrics, no superlatives, no "excited to announce". What it is, and what
 *    it does.
 *  - Every entry must be verifiable — either by using the thing, or from this
 *    repository's own history.
 *
 * Like the team page, `/shipped` is only routed and only linked once this array
 * has entries.
 */

export type ShipmentProduct = 'Sadhya' | 'Srijya';

export type Shipment = {
  id: string;
  /** Month and year, e.g. "August 2026". Deliberately not a specific day. */
  period: string;
  product: ShipmentProduct;
  title: string;
  body: string;
};

/**
 * Dates below were taken from this repository's commit history, at the month the
 * work landed. They describe product-level releases rather than individual
 * changes — the log is for someone deciding whether to work with us, not for
 * someone reviewing our commits.
 */
export const SHIPPED: Shipment[] = [
  {
    id: 'srijya-site',
    period: 'September 2026',
    product: 'Srijya',
    title: 'This site, and the assistant on it',
    body: 'The Srijya corporate site, including a guided project brief and Ask Srijya — an assistant that answers only from the published help centre and says so plainly when a question is outside it. Both halves are on the page you are reading; the refusal behaviour is the part worth testing.',
  },
  {
    id: 'sadhya-payments',
    period: 'August 2026',
    product: 'Sadhya',
    title: 'Payments, receipts and a money-back guarantee',
    body: 'Subscription checkout with verified payment confirmation, automated tax receipts issued on verification, and a self-service seven-day money-back guarantee. The unglamorous half of running a product, and the half that decides whether people trust it.',
  },
  {
    id: 'sadhya-helpdesk',
    period: 'August 2026',
    product: 'Sadhya',
    title: 'Ask Sadhya — a grounded help assistant',
    body: 'A public assistant on the Sadhya site that answers from a maintained knowledge base rather than from the open internet, with a route through to a person when it cannot help.',
  },
  {
    id: 'sadhya-syllabus',
    period: 'August 2026',
    product: 'Sadhya',
    title: 'Syllabus ingestion with provenance',
    body: 'A pipeline that ingests official curriculum documents and records where every piece of content came from, so material that cannot be traced to an official source is quarantined rather than served. Answers in an exam product are only worth as much as the source behind them.',
  },
  {
    id: 'sadhya-teacher',
    period: 'August 2026',
    product: 'Sadhya',
    title: 'Teacher workspace and live classes',
    body: 'A full teacher-side workspace — classes, enrolments, assignments and live video sessions — alongside the student experience, on shared foundations rather than as a separate product.',
  },
];

/** True once there is something to show. Gates the route and the footer link. */
export const hasShipped: boolean = SHIPPED.length > 0;
