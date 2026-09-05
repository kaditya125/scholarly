/**
 * The help centre, and the assistant's knowledge base. One source, two surfaces.
 *
 * Every answer here is either a fact drawn from site.config.ts and the content
 * modules, or a statement about how the company works that a person could hold
 * us to. Nothing describes a client, a metric, a partnership, a certification or
 * a capability the company cannot substantiate — the same rule the rest of the
 * site runs on, applied to the thing an assistant will quote from.
 *
 * WHY THE KNOWLEDGE LIVES HERE RATHER THAN IN THE ASSISTANT
 *
 * An assistant grounded in a corpus nobody can read is impossible to audit: when
 * it says something wrong, there is no page to check it against. These articles
 * are rendered at /help, so every claim the assistant can make is a claim a
 * visitor can already read for themselves. If an answer would embarrass us on
 * the page, it should not be in the model's context either.
 *
 * This is deliberately NOT the whole company knowledge base. When a server-side
 * corpus and retrieval exist, this stays the published, human-checkable subset
 * and the assistant grounds against the larger one.
 */

export type HelpArticle = {
  id: string;
  question: string;
  /** The answer, in full sentences. Rendered as-is and quoted as-is. */
  answer: string;
  /** Lowercase terms the local matcher scores against, beyond the question text. */
  keywords: string[];
};

export type HelpCategory = {
  id: string;
  title: string;
  blurb: string;
  articles: HelpArticle[];
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'company',
    title: 'Company',
    blurb: 'What Srijya is, and how it is registered.',
    articles: [
      {
        id: 'what-is-srijya',
        question: 'What is Srijya?',
        answer:
          'Srijya is a technology and product engineering company. We help organisations move from an idea to a real, working product — through the clarity, design and engineering in between. The work spans consulting, product engineering, and products we build and run ourselves.',
        keywords: ['about', 'company', 'what do you do', 'introduction'],
      },
      {
        id: 'what-we-build',
        question: 'What does Srijya build?',
        answer:
          'Six areas of work: digital product engineering, software development, AI and intelligent experiences, product design, technology consulting, and digital platforms. Most engagements draw on more than one. In practice that ranges from advising on a decision, to a prototype against real data, to designing and building the product itself and keeping it running afterwards.',
        keywords: [
          'build', 'builds', 'building', 'capabilities', 'services', 'offerings',
          'develop', 'development', 'what do you build', 'expertise', 'specialise',
        ],
      },
      {
        id: 'name-meaning',
        question: 'What does the name mean?',
        answer:
          'Srijya comes from सृज् (sṛj), the Sanskrit root meaning to create or bring forth. It is the same grammatical construction as Sadhya (साध्य, "that which is to be attained"), so the company and its flagship product read as one house: the company creates, the product is attained.',
        keywords: ['name', 'meaning', 'sanskrit', 'srijya', 'etymology'],
      },
      {
        id: 'registration',
        question: 'Is Srijya a registered business?',
        answer:
          'Yes. The enterprise is registered under India’s Udyam MSME register as a Micro enterprise, registered on 30 June 2024, under computer programming, consultancy and related IT services. It is a proprietorship: it is not incorporated as a company and is not GST registered, so it has no CIN or GSTIN. The registration number and full details are published on the Company information page.',
        keywords: ['registered', 'registration', 'udyam', 'msme', 'legal', 'gstin', 'cin', 'company information'],
      },
      {
        id: 'where-based',
        question: 'Where is Srijya based?',
        answer:
          'Noida, Uttar Pradesh, India. We publish the city rather than a street address, because the address on the registration is a residential one.',
        keywords: ['where', 'based', 'location', 'address', 'noida', 'india', 'office'],
      },
      {
        id: 'clients-and-case-studies',
        question: 'Can I see your client work or case studies?',
        answer:
          'Not yet. Client work stays private until it enters the public domain, and we do not publish client names, logos or testimonials without that. Sadhya is the product we can point at in full, because we built and run it ourselves. We are happy to talk through relevant work directly — ask, and we will tell you what we can.',
        keywords: [
          'clients', 'client', 'case study', 'case studies', 'references', 'portfolio',
          'worked with', 'customers', 'logos', 'testimonials', 'examples', 'past work',
        ],
      },
      {
        id: 'metrics-and-numbers',
        question: 'Can you share revenue, metrics, awards or certifications?',
        answer:
          'We do not publish revenue, user counts or growth figures, and we do not list awards, certifications or partnerships. Every factual claim on this site is one that can be checked against a real record — unaudited numbers a company reports about itself are not, and neither is a badge nobody awarded us. If you need verified details for a contract or for onboarding, ask us directly and we will send them to you.',
        keywords: [
          'revenue', 'metrics', 'numbers', 'users', 'growth', 'statistics', 'stats',
          'financials', 'how many users', 'how many clients', 'turnover', 'funding',
          'awards', 'award', 'recognition', 'certification', 'certifications',
          'accreditation', 'partnerships', 'partners', 'iso', 'won',
        ],
      },
      {
        id: 'company-size',
        question: 'How big is the team?',
        answer:
          'Srijya is an emerging company rather than a large one, and the site says so rather than implying otherwise. What that means for a client is direct access to the people doing the work. We do not publish a headcount, because a number without context is not useful to anyone deciding whether to work with us.',
        keywords: ['team', 'size', 'headcount', 'employees', 'how many', 'people'],
      },
    ],
  },
  {
    id: 'products',
    title: 'Products',
    blurb: 'What we build and run ourselves.',
    articles: [
      {
        id: 'what-is-sadhya',
        question: 'What is Sadhya?',
        answer:
          'Sadhya is a digital learning platform exploring how AI can make learning more personalised, interactive and accessible. It is built and operated by Srijya — our own product rather than a client project — and it is live at sadhya.app. It is where our work on retrieval-grounded AI, content pipelines and learning interfaces is applied end to end.',
        keywords: ['sadhya', 'product', 'learning', 'platform', 'flagship', 'edtech'],
      },
      {
        id: 'sadhya-technology-stack',
        question: 'What technology stack and architecture does Sadhya use?',
        answer:
          'Sadhya is engineered with a modern full-stack TypeScript architecture: React 19 on the front end, Node.js and Express services, Google Vertex AI (Gemini 2.0 Flash and 768-dimensional embeddings), Pinecone vector database for curriculum-grounded retrieval, Firebase Firestore for realtime state, and Razorpay for recurring billing and automated refunds.',
        keywords: ['tech stack', 'architecture', 'technology', 'technologies', 'gemini', 'vertex ai', 'pinecone', 'database', 'stack', 'how does sadhya work'],
      },
      {
        id: 'sadhya-ai-approach',
        question: 'How does Sadhya use AI and prevent hallucinations?',
        answer:
          'Sadhya uses retrieval-augmented generation (RAG) strictly grounded in official competitive examination syllabi and authentic previous years’ questions. Answers must cite verified curriculum sources, with 100% boundary isolation across exam domains (UPSC, SSC, JEE, NEET). Unverified material is quarantined rather than served, making reasoning checkable step-by-step.',
        keywords: ['hallucination', 'hallucinations', 'grounding', 'rag', 'retrieval', 'accuracy', 'ai', 'ai tutor', 'syllabus', 'provenance'],
      },
      {
        id: 'why-own-products',
        question: 'Why does Srijya build its own products?',
        answer:
          'Building our own products keeps the consulting honest. Running something end to end — design, engineering, infrastructure, support, and the cost of a decision made a year ago — is a different discipline from advising on it, and it is the part that is hardest to learn from the outside.',
        keywords: ['own products', 'studio', 'why', 'product studio', 'build'],
      },
      {
        id: 'other-products',
        question: 'Are there other products?',
        answer:
          'Other product work is under way, but nothing else is public yet. We keep unreleased work off the site rather than listing placeholders, because a page of products that do not exist tells you nothing useful about the company.',
        keywords: ['other products', 'more', 'roadmap', 'coming', 'pipeline'],
      },
    ],
  },
  {
    id: 'working-together',
    title: 'Working together',
    blurb: 'How engagements start and what to expect.',
    articles: [
      {
        id: 'how-to-work-with-us',
        question: 'How do I start a project with Srijya?',
        answer:
          'Two ways. Use "Start with your idea" for a guided brief — five short questions about what you are building and where you are — or write to us directly if you would rather just send a few sentences. Either reaches the same people. The first reply will be about the problem rather than a proposal.',
        keywords: ['start', 'work with', 'hire', 'engage', 'project', 'brief', 'enquiry', 'contact'],
      },
      {
        id: 'what-happens-next',
        question: 'What happens after I get in touch?',
        answer:
          'A person reads it. If it is something we can genuinely help with, you will hear back with questions about the problem — what is being solved, for whom, and what is deliberately out of scope for a first version. We would rather understand the problem before proposing an approach to it.',
        keywords: ['what happens', 'next', 'reply', 'response', 'after', 'process'],
      },
      {
        id: 'engagement-shape',
        question: 'How are engagements usually shaped?',
        answer:
          'Engagements are scoped small at the start. A short, well-defined piece of work tells both sides more about whether a longer one is a good idea than any amount of proposal-writing. Depending on the area, that might be a scoped review ending in a written recommendation, a prototype against real data, or a first working version in weeks rather than months.',
        keywords: ['engagement', 'scope', 'contract', 'how long', 'retainer', 'pricing', 'cost', 'timeline'],
      },
      {
        id: 'not-sure-yet',
        question: 'What if I am not sure what I need yet?',
        answer:
          'That is a normal place to start, and the project form treats it as one — every question in it can be answered "not sure yet". Deciding what to build, and what to leave out, is part of the work rather than a prerequisite for it.',
        keywords: ['not sure', 'unsure', 'early', 'idea only', 'just an idea', 'dont know'],
      },
    ],
  },
  {
    id: 'technology',
    title: 'Technology',
    blurb: 'What we work with, and how we choose.',
    articles: [
      {
        id: 'what-technologies',
        question: 'What technologies does Srijya work with?',
        answer:
          'We group technology by purpose rather than listing logos: AI and agents, cloud and infrastructure, modern web, data and intelligence, and developer platforms. Each area is in use in something already running. The choice of technology follows from the problem — understanding it first is the point, not the preamble.',
        keywords: ['technology', 'stack', 'tools', 'languages', 'frameworks', 'tech'],
      },
      {
        id: 'ai-approach',
        question: 'How does Srijya approach AI?',
        answer:
          'As a capability applied where it improves a specific outcome, with the result checked — not as a layer added because it is available. In practice that means retrieval grounded in a specific body of source material so answers can be traced, assistive interfaces, and automation of judgement-light steps. The first question is always whether a model genuinely improves the outcome, and how a wrong answer is caught when it does not.',
        keywords: ['ai', 'artificial intelligence', 'llm', 'agents', 'rag', 'machine learning', 'assistant'],
      },
      {
        id: 'good-technology',
        question: 'What does Srijya consider good technology?',
        answer:
          'Four properties, each checkable against a system after it ships: it should be useful — solving a real problem for someone specific; understandable — legible to whoever did not build it; adaptable — able to absorb changing requirements without a rewrite; and responsible — built with care for the people who use it and inherit it, including how it fails and what it does with their data.',
        keywords: ['good technology', 'principles', 'quality', 'standards', 'engineering'],
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    blurb: 'How to reach a person.',
    articles: [
      {
        id: 'how-to-contact',
        question: 'How do I contact Srijya?',
        answer:
          'Through the contact page, or the guided project form if you would rather answer a few questions than compose a message. Both reach the same inbox, which is monitored by a person.',
        keywords: ['contact', 'email', 'reach', 'get in touch', 'talk', 'phone'],
      },
      {
        id: 'careers',
        question: 'Is Srijya hiring?',
        answer:
          'There are no open positions listed at the moment. When there are, they will appear on the site — we would rather say nothing than advertise roles that do not exist.',
        keywords: ['careers', 'jobs', 'hiring', 'work at', 'vacancy', 'role', 'apply', 'internship'],
      },
      {
        id: 'partnerships',
        question: 'Can I partner with Srijya?',
        answer:
          'Get in touch and describe what you have in mind. We do not publish a partner programme, because we do not have one to publish yet — but a real conversation about a specific collaboration is always worth having.',
        keywords: ['partner', 'partnership', 'collaborate', 'reseller', 'agency', 'integrate'],
      },
    ],
  },
];

/** Flat list, for the assistant's matcher and for the sitemap of questions. */
export const HELP_ARTICLES: HelpArticle[] = HELP_CATEGORIES.flatMap((c) => c.articles);
