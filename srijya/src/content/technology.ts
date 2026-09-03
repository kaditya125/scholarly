/**
 * Technology areas, grouped by what they are for.
 *
 * Not a logo wall. A grid of framework marks tells a reader nothing about
 * whether a company can build their product — it only proves the logos were
 * downloadable. These are areas of work, and each names only technology that
 * is genuinely in use in something already running.
 */
export const TECHNOLOGY_AREAS = [
  {
    index: '01',
    title: 'AI & Agents',
    body: 'Intelligent assistants, knowledge systems and AI workflows — including retrieval grounded in a specific body of source material, so answers can be traced rather than trusted.',
  },
  {
    index: '02',
    title: 'Cloud & Infrastructure',
    body: 'Reliable infrastructure and the operational work around it: deployment, monitoring, cost, and the failure modes that only appear once real traffic arrives.',
  },
  {
    index: '03',
    title: 'Modern Web',
    body: 'High-performance web applications built on current standards, with accessibility and load behaviour treated as requirements rather than as a later pass.',
  },
  {
    index: '04',
    title: 'Data & Intelligence',
    body: 'Data models, pipelines and reporting that make a system’s own behaviour visible — the difference between believing something works and knowing it does.',
  },
  {
    index: '05',
    title: 'Developer Platforms',
    body: 'APIs, tooling and internal systems that make a product cheaper to build and safer to operate for whoever works on it next.',
  },
] as const;
