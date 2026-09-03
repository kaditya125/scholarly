/**
 * What good technology should be.
 *
 * Deliberately phrased as properties of the result rather than as things this
 * company claims to possess. Each one is checkable against a system after it
 * ships, which is the only place any of them can actually be judged.
 */
export const ENGINEERING_QUALITIES = [
  {
    index: '01',
    title: 'Useful',
    body: 'It solves a real problem for someone specific. Software that is impressive and unused is a cost, not an asset.',
  },
  {
    index: '02',
    title: 'Understandable',
    body: 'Complex systems should stay legible. Someone who did not build it should be able to read it, change it and predict what happens next.',
  },
  {
    index: '03',
    title: 'Adaptable',
    body: 'Requirements move. A product should absorb that without a rewrite, because the second version is where most of the value is.',
  },
  {
    index: '04',
    title: 'Responsible',
    body: 'Built with care for the people who use it and the people who inherit it — including how it fails, and what it does with their data.',
  },
] as const;
