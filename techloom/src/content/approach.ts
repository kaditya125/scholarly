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

/** The three commitments the work is judged against. */
export const PRINCIPLES = [
  {
    index: '01',
    title: 'Clarity',
    body: 'We simplify complex technology decisions and focus on what matters. A recommendation you cannot explain to your own team is not finished.',
  },
  {
    index: '02',
    title: 'Practicality',
    body: 'We build solutions around real needs rather than technology for its own sake. The interesting choice and the right choice are often not the same one.',
  },
  {
    index: '03',
    title: 'Continuity',
    body: 'We think beyond launch — designing systems and products that can be handed over, extended and changed without being rebuilt.',
  },
] as const;
