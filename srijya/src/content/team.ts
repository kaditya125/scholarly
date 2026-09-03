/**
 * The people at Srijya.
 *
 * EMPTY ON PURPOSE. While this array has no entries, `/team` is not routed and
 * the footer link does not render — so the site never shows a team page that
 * implies a team it cannot substantiate. Add a real person and both appear on
 * their own. That is the same mechanism `COMPANY.social` uses: no entry, no
 * link, no dead end.
 *
 * THREE RULES FOR THIS FILE, BECAUSE IT IS ABOUT REAL PEOPLE
 *
 *  1. CONSENT FIRST. This repository is public and so is the site. Nobody goes
 *     in here who has not agreed to be listed, and anyone can ask to be removed
 *     — which is a one-line deletion, by design.
 *
 *  2. NOTHING PERSONAL. Work-facing facts only: name, role, what they focus on.
 *     No personal email addresses, phone numbers, home locations or dates of
 *     birth. A public site is a public site, and a name plus a personal contact
 *     detail is a bigger gift to a scraper than either alone.
 *
 *  3. VERIFIED, LIKE EVERYTHING ELSE. No inflated titles, no invented
 *     credentials, no "10+ years" unless it is true. Optional fields left empty
 *     are omitted by the page rather than filled with something plausible.
 */

export type TeamMember = {
  /** Slug, used as the anchor id. */
  id: string;
  name: string;
  /** The role as it would appear on a contract, not an aspirational title. */
  role: string;
  /** Optional. One or two sentences on what they actually work on. */
  focus?: string;
  /**
   * Optional public profiles. Every entry renders a link, so an entry that does
   * not exist is a dead link — add a row only when the profile is real and the
   * person is happy for it to be here.
   */
  links?: ReadonlyArray<{ label: string; href: string }>;
};

export const TEAM: TeamMember[] = [
  {
    id: 'aditya-kumar',
    name: 'Aditya Kumar',
    role: 'Founder',
  },
  // Add people here. Example of the shape, kept commented so nothing is
  // published by accident:
  //
  // {
  //   id: 'firstname-lastname',
  //   name: 'Firstname Lastname',
  //   role: 'Product engineer',
  //   focus: 'Front-end architecture and the design system behind Sadhya.',
  //   links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/…' }],
  // },
];

/** True once there is at least one person to show. Gates the route and the footer link. */
export const hasTeam: boolean = TEAM.length > 0;
