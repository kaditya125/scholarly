/** How work moves, from the first conversation to the version that stays in use. */
export const APPROACH = [
  {
    index: '01',
    title: 'Understand',
    body: 'Understand the problem, the people it affects, the constraints around it and what a good outcome would actually look like.',
  },
  {
    index: '02',
    title: 'Shape',
    body: 'Translate that into a clear product, technology or solution direction — including what is deliberately left out of the first version.',
  },
  {
    index: '03',
    title: 'Build',
    body: 'Design, engineer and refine the solution, with something working early enough to be judged rather than imagined.',
  },
  {
    index: '04',
    title: 'Evolve',
    body: 'Improve it against real usage, feedback and changing needs. Most of a system’s life happens after the first release.',
  },
] as const;

/**
 * How Srijya thinks — the commitments the work is judged against.
 *
 * Four, not three: responsibility was added when AI became a real part of what
 * gets built. A principle that only appears once it is convenient is not one.
 */
export const PRINCIPLES = [
  {
    index: '01',
    title: 'Clarity',
    body: 'Understand the problem before choosing the technology. A recommendation you cannot explain to your own team is not finished, and a decision made before the problem is understood is a guess wearing a roadmap.',
  },
  {
    index: '02',
    title: 'Practicality',
    body: 'Build what creates real value, not technology for its own sake. The interesting choice and the right choice are often not the same one, and only one of them is still working in two years.',
  },
  {
    index: '03',
    title: 'Continuity',
    body: 'Products should keep evolving after launch. Most of a system’s life happens after the first release, so it is designed to be handed over, extended and changed without being rebuilt.',
  },
  {
    index: '04',
    title: 'Responsibility',
    body: 'Technology, and AI in particular, should be built thoughtfully. That means knowing where a system can be wrong, saying so, and designing the step that catches it — not asserting confidence the software has not earned.',
  },
] as const;
