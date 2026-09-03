/**
 * What Srijya builds.
 *
 * One canonical list, used by both the home page (title + summary) and the
 * capabilities page (everything). Keeping it in one place is what stops the two
 * surfaces from drifting into describing slightly different companies.
 *
 * These are written as areas of capability, not as claims. Nothing here asserts a
 * certification, a vendor partnership, a team size or a delivery record, because
 * none of those are things this site can substantiate.
 */

export type Capability = {
  id: string;
  index: string;
  title: string;
  /** One line. The home page shows only this. */
  summary: string;
  /** Two or three sentences for the capabilities page. */
  detail: string;
  /** How work in this area is usually shaped. */
  engagement: string;
  helpWith: string[];
};

export const CAPABILITIES: Capability[] = [
  {
    id: 'digital-product-engineering',
    index: '01',
    title: 'Digital Product Engineering',
    summary: 'Building complete digital products, from concept through to production.',
    detail:
      'End-to-end product work: interface design, front-end and back-end engineering, and the integration work that sits between them. The emphasis is on products that hold up after launch — clear structure, sensible dependencies, and code someone else can read six months later.',
    engagement:
      'A defined scope with an agreed set of outcomes, or continuous product development alongside an in-house team.',
    helpWith: [
      'Products taken from concept to a first release',
      'Interface design and design systems',
      'Front-end architecture and performance',
      'APIs, data models and service integration',
    ],
  },
  {
    id: 'software-development',
    index: '02',
    title: 'Software Development',
    summary:
      'Web applications, platforms, backend systems, APIs and software built for a specific operation.',
    detail:
      'Software written for a particular operation rather than a general market: the workflow that a spreadsheet has outgrown, the process that three systems half-cover, the reporting nobody can produce without a manual step.',
    engagement:
      'Usually a first working version in weeks rather than months, then refinement against real use.',
    helpWith: [
      'Operational and back-office systems',
      'Automation of manual, repeated work',
      'Data pipelines and reporting',
      'Integration between existing systems',
    ],
  },
  {
    id: 'ai-and-intelligent-experiences',
    index: '03',
    title: 'AI & Intelligent Experiences',
    summary:
      'AI assistants, knowledge systems, intelligent workflows and practical applications of AI.',
    detail:
      'Applied AI work — retrieval over a body of source material, assistive interfaces, and automation of judgement-light steps in a process. The starting question is whether a model improves a specific outcome, and how the result is checked when it does not.',
    engagement:
      'Typically a narrow prototype against real data first, so the value is visible before anything is committed to.',
    helpWith: [
      'Retrieval-grounded assistants over your own content',
      'AI features inside existing products',
      'Evaluating where AI genuinely helps — and where it does not',
      'Guardrails, review steps and failure handling',
    ],
  },
  {
    id: 'product-design',
    index: '04',
    title: 'Product Design',
    summary: 'Turning complex requirements into clear, intuitive product experiences.',
    detail:
      'The work before and around the build: framing the problem, mapping who it affects, and putting something in front of people early enough that being wrong is still cheap. Complexity in a business rarely justifies complexity in the interface — most of this is deciding what the person using it never has to see.',
    engagement:
      'A fixed, short engagement ending in a prototype and a written direction, whoever builds it afterwards.',
    helpWith: [
      'Problem framing and scoping',
      'Concept and interaction prototypes',
      'Interface and information design',
      'Roadmap and phasing for a first release',
    ],
  },
  {
    id: 'technology-consulting',
    index: '05',
    title: 'Technology Consulting',
    summary: 'Architecture, technology decisions, modernisation and technical strategy.',
    detail:
      'Advisory work for teams deciding what to build, what to buy, and what to leave alone. Useful when a technology decision is expensive to reverse and the options are hard to compare from the inside.',
    engagement:
      'A short, scoped review ending in a written recommendation, or an ongoing advisory arrangement.',
    helpWith: [
      'Architecture and platform review',
      'Build, buy or integrate decisions',
      'Modernising systems already in production',
      'Implementation planning and sequencing',
    ],
  },
  {
    id: 'digital-platforms',
    index: '06',
    title: 'Digital Platforms',
    summary:
      'Scalable web and application platforms designed around real users and real business needs.',
    detail:
      'Platforms rather than single applications: shared accounts, permissions, content and billing that several surfaces depend on. The hard part is rarely the first feature — it is keeping the second and third from making the first unmaintainable.',
    engagement:
      'Built in stages against a defined first release, so the platform is carrying real usage before it is extended.',
    helpWith: [
      'Multi-surface products on shared foundations',
      'Accounts, roles and permission models',
      'Scaling systems already carrying real load',
      'Making a platform others can build on',
    ],
  },
];
