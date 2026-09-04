/**
 * Writing from the Srijya lab.
 *
 * WHY THE BODY IS STRUCTURED DATA AND NOT MARKDOWN
 *
 * This site has three runtime dependencies. Adding a markdown parser and a
 * sanitiser to render prose the company wrote itself would roughly double that
 * for no benefit — nobody untrusted is authoring here. Blocks are typed, so an
 * article that is malformed fails to compile rather than rendering wrong, and
 * the renderer stays about forty lines.
 *
 * RULES
 *
 *  - Write about work that was actually done. Every claim in a post should be
 *    checkable, ideally by using the thing being described.
 *  - Publish the failure, not the triumph. A post that says "we built X and it
 *    worked" teaches nobody anything and reads as marketing.
 *  - No posts that exist to hit a publishing cadence.
 *  - NEWEST FIRST. The home page surfaces INSIGHTS[0] and the index renders in
 *    array order. Nothing sorts by date, because "September 2026" is a month,
 *    not a date, and parsing it would be inventing precision to throw away.
 *
 * Gated like /team and /shipped: no articles, no route, no footer link.
 */

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  /** A verbatim exchange or a line worth setting apart. */
  | { kind: 'quote'; text: string; attribution?: string }
  | { kind: 'code'; code: string };

export type Insight = {
  slug: string;
  title: string;
  /** One or two sentences. Shown on the index and as the page lede. */
  standfirst: string;
  /** Month and year. Same reasoning as the shipping log: no false precision. */
  published: string;
  blocks: Block[];
};

export const INSIGHTS: Insight[] = [
  {
    slug: 'we-gave-the-model-a-workflow-engine-not-a-keyboard',
    title: 'We gave the model a workflow engine, not a keyboard',
    standfirst:
      'Everyone grades agentic AI by how much reasoning it does. The question that decides whether you can sleep is a different one: what can it actually reach?',
    published: 'September 2026',
    blocks: [
      {
        kind: 'p',
        text: 'There is a ladder that appears in almost every discussion of agentic AI. Level one assists. Level two acts on a single step. Level three chains steps together. Level four plans. Level five runs unsupervised. It is a tidy framing and we think it measures the wrong thing.',
      },
      {
        kind: 'p',
        text: 'It grades a system on how much reasoning happens before an action. What determines whether that system is safe to run is the action itself — specifically, the set of things it is physically able to do. A model that plans elaborately and can only send one kind of notification is far less dangerous than a shallow one holding a database credential.',
      },
      { kind: 'h', text: 'The axis we actually care about' },
      {
        kind: 'p',
        text: 'So the question we ask of anything agentic is not how many levels of planning it does. It is: what is the worst thing this can do without a human involved?',
      },
      {
        kind: 'p',
        text: 'That reframing has a practical consequence. It moves the design effort away from prompt engineering and toward the boundary — what the system can reach, and how that set is defined.',
      },
      { kind: 'h', text: 'What we built' },
      {
        kind: 'p',
        text: 'Inside Sadhya there is an automation engine. Domain events flow into it — a quiz gets completed, a mastery threshold gets crossed — and workflows run in response. Some of those workflows call a language model. It is agentic by any reasonable definition: it observes, decides and acts without a person in the loop.',
      },
      {
        kind: 'p',
        text: 'The part that matters is that it composes from a registry. Every action it can take is a typed node that somebody wrote, reviewed and registered: nodes for assessment, for data, for messaging, for mastery, for control flow. The engine can arrange those nodes. It cannot invent one.',
      },
      {
        kind: 'p',
        text: 'This is a deliberate limitation and it is the whole design. A registered node has a signature, a test, and a known blast radius. When something misbehaves, the question is which node ran with what input — not what the model decided to try.',
      },
      { kind: 'h', text: 'The alternative, and why we did not take it' },
      {
        kind: 'p',
        text: 'The fashionable approach is to hand a model a set of tools and let it work out the sequence — often tools that are thin wrappers over an API or a shell. It is genuinely more flexible, and demos beautifully.',
      },
      {
        kind: 'p',
        text: 'The cost is that your action space becomes "whatever that API permits", which is almost never what you meant. You will not enumerate it, you cannot test it, and the first time you fully understand it is while reading logs after something happened. Flexibility at the tool layer is flexibility in the failure modes too, and those you inherit whether you wanted them or not.',
      },
      {
        kind: 'quote',
        text: 'An action space you cannot enumerate is one you cannot review. If nobody can list what the system is able to do, nobody can say what it should not.',
      },
      { kind: 'h', text: 'Where the determinism goes' },
      {
        kind: 'p',
        text: 'A useful pattern has emerged from building this: put the model where judgement is genuinely required, and keep everything downstream of that judgement deterministic.',
      },
      {
        kind: 'p',
        text: 'Deciding that a student has misunderstood a concept is a judgement call, and a model is good at it. Deciding what happens next — which content is surfaced, what is recorded, whether a message is sent — is a rule. Rules can be read, tested and changed by someone who was not there when they were written. Pushing that decision into the model buys nothing and costs you the ability to explain the outcome.',
      },
      {
        kind: 'p',
        text: 'The same shape appears on this website. The assistant retrieves and phrases; whether it is allowed to answer at all is a deterministic gate that runs first. The interesting reasoning sits inside a boundary that does not reason.',
      },
      { kind: 'h', text: 'The honest trade' },
      {
        kind: 'p',
        text: 'This approach is less capable in the short term. There are things a free-form agent would handle that ours cannot, because nobody has written the node yet. When a new capability is needed, someone writes and reviews it — which is slower than a model improvising, and that is the point rather than a limitation we plan to remove.',
      },
      {
        kind: 'p',
        text: 'For a product where a wrong action reaches a student preparing for an exam that decides their next several years, we will take that trade every time. For a prototype nobody depends on, we might not. Worth being explicit that this is a judgement about consequences, not a universal law.',
      },
      { kind: 'h', text: 'What to ask' },
      {
        kind: 'p',
        text: 'If you are evaluating an agentic system — yours or someone else’s — the levels ladder will not tell you much. Three questions will.',
      },
      {
        kind: 'list',
        items: [
          'Can someone list everything this system is able to do, without reading a model prompt?',
          'What is the worst of those things, and what stands between it and a user?',
          'When it does something unexpected, will the logs say which action ran, or only what the model said?',
        ],
      },
      {
        kind: 'p',
        text: 'If the answers are uncomfortable, the fix is rarely a better prompt. It is a smaller, more explicit set of things the system can reach.',
      },
    ],
  },
  {
    slug: 'what-to-do-when-the-model-provider-says-no',
    title: 'What to do when the model provider says no',
    standfirst:
      'An AI feature has a dependency profile ordinary code does not. Rate limits are not an exceptional case to handle later — they are Tuesday.',
    published: 'September 2026',
    blocks: [
      {
        kind: 'p',
        text: 'Most of the writing about building with language models is about choosing one. Almost none of it is about what your product does during the ninety seconds when that model is returning 429s and a person is sitting in front of a loading spinner.',
      },
      {
        kind: 'p',
        text: 'That gap matters, because an AI feature has a dependency profile ordinary code does not. A database you run will fail in ways you caused and can fix. A hosted model will fail because of demand you did not create, on a schedule you do not control, at a rate that changes without notice. Treating that as an exceptional case to handle later is how you ship a feature that works in development and is unreliable in front of users.',
      },
      { kind: 'h', text: 'Four layers, cheapest first' },
      {
        kind: 'p',
        text: 'What we run in production is not clever. It is four layers, and each exists because the one above it is insufficient alone.',
      },
      {
        kind: 'p',
        text: 'The first is a timeout. Without one, a provider that accepts your connection and then stalls will hold the request open until something else in the stack gives up — and the thing that gives up is usually the user. A bounded wait turns an unbounded hang into a failure you can handle.',
      },
      {
        kind: 'p',
        text: 'The second is a retry with backoff, and only for transient conditions: 429s, 5xx responses, network errors. Retrying a 400 just sends the same malformed request twice. The backoff matters more than the retry — retrying immediately against a rate limit is how a brief throttle becomes a sustained one.',
      },
      {
        kind: 'p',
        text: 'The third is a different provider. Retries help with a busy minute and do nothing for a provider-wide outage, because every retry lands in the same place. Our assistants try one model and fall back to another from a different vendor. The two are not identical and phrasing differs slightly — but a slightly differently worded correct answer is worth far more than an error page.',
      },
      {
        kind: 'code',
        code: `try {
  return await this.primary.generateResponse(msg, prompt);
} catch (e) {
  // Not a silent catch. This line is the only thing
  // that tells you a whole provider went away.
  console.warn('Primary failed, falling back...', e);
  return await this.fallback.generateResponse(msg, prompt);
}`,
      },
      {
        kind: 'p',
        text: 'The fourth layer is the one people skip: what the product does when every provider has failed. Not a stack trace, and not a cheerful message implying the request succeeded. On this site the assistant returns exactly the sentence it uses when a question is outside its knowledge — it says it does not have enough verified information, and points at a person. The visitor gets a next step rather than an apology for infrastructure they do not care about.',
      },
      { kind: 'h', text: 'The parts that are easy to get wrong' },
      {
        kind: 'p',
        text: 'If two surfaces in your product use models, they should degrade the same way. It is tempting to let each handle failure however suits it. Do not. At three in the morning you want one mental model of what the system does under failure, not two that diverge in ways nobody remembers.',
      },
      {
        kind: 'p',
        text: 'The other trap is silent fallback. Falling back is correct behaviour; hiding it is not. If a provider switch never appears in your logs, you will learn the primary has been failing for a week from your invoice rather than from your monitoring.',
      },
      { kind: 'h', text: 'The question worth asking' },
      {
        kind: 'p',
        text: 'When someone asks which model they should use, the more useful question is usually a different one: what does this feature do when the model is not there? If the honest answer is that it breaks, the feature is not finished — whichever model is behind it.',
      },
    ],
  },
  {
    slug: 'your-retrieval-is-not-broken-it-is-returning-nothing',
    title: 'Your retrieval is not broken. It is returning nothing.',
    standfirst:
      'Three ways a grounded AI system quietly stops being grounded — and why the model keeps answering, fluently, either way.',
    published: 'September 2026',
    blocks: [
      {
        kind: 'p',
        text: 'Retrieval-augmented generation has a failure mode that does not look like a failure. The pipeline runs. Nothing throws. The endpoint returns 200. The model produces a confident, well-written answer. And not one word of it came from your documents.',
      },
      {
        kind: 'p',
        text: 'This happens because an empty retrieval result is indistinguishable, from the model’s point of view, from a question that needed no context. It answers from its own weights instead, and it does so fluently. In a product whose entire value is that answers are grounded in a specific syllabus, that is worse than an outright error — an error you would have noticed.',
      },
      { kind: 'h', text: 'Three causes, one symptom' },
      {
        kind: 'p',
        text: 'We have hit three separate versions of this. They present identically.',
      },
      {
        kind: 'p',
        text: 'The first is a dimension mismatch. An embedding model produces vectors of a particular size and the vector index expects that size. Change the model, or change its output dimensionality, and you have vectors the index will not take. Nothing downstream announces it. Retrieval simply comes back empty.',
      },
      {
        kind: 'p',
        text: 'The second is a namespace mismatch. Writes go to one namespace, queries read from another. Both operations succeed. Both report success. The data is there, correctly embedded, and permanently invisible to the thing that needs it.',
      },
      {
        kind: 'p',
        text: 'The third is ingestion that never finished. A document is uploaded, processing starts, something fails partway, and the source sits in a non-ready state indefinitely. The user sees their file listed and reasonably assumes the system has read it.',
      },
      {
        kind: 'p',
        text: 'Three unrelated bugs in three different parts of the system, producing exactly the same observable behaviour: an answer with no citations that nobody looks at twice.',
      },
      { kind: 'h', text: 'What actually helps' },
      {
        kind: 'p',
        text: 'The fix is not better retrieval. It is refusing to let "no context" pass as a normal condition.',
      },
      {
        kind: 'p',
        text: 'Assert the contract at boot rather than discovering it at query time. An embedding dimension and an index dimension are a contract between two systems, and a process that starts happily with them mismatched will lie to users for as long as it runs.',
      },
      {
        kind: 'code',
        code: `// Fail at startup, loudly, rather than at query time,
// silently. A number that must equal another number is
// a contract, and contracts get checked.
if (index.dimension !== EMBEDDING_DIMENSIONS) {
  throw new Error(
    'Index dimension does not match embedding dimension'
  );
}`,
      },
      {
        kind: 'p',
        text: 'Then make retrieval count a first-class signal. How many chunks came back is the most diagnostic number in the whole pipeline and it costs nothing to log. A sudden run of zero-result retrievals is the earliest possible warning that something upstream has quietly detached.',
      },
      {
        kind: 'p',
        text: 'And expose ingestion state to the person who uploaded the document. "Processing failed" is a worse experience than "ready" and a far better one than a document that appears present and is not.',
      },
      { kind: 'h', text: 'The general shape of it' },
      {
        kind: 'quote',
        text: 'In a grounded system, absence of evidence looks exactly like evidence — unless you build something that can tell the difference.',
      },
      {
        kind: 'p',
        text: 'This is the same lesson as the assistant on this site answering a question nobody asked. The dangerous failures in AI systems are rarely the ones that throw. They are the ones that produce a plausible output through a path you did not intend, and keep producing it until somebody checks by hand.',
      },
      {
        kind: 'p',
        text: 'Which is the argument for building the check — not more evaluation harnesses than the product warrants, just the one number that tells you whether the thing you claim is happening is actually happening.',
      },
    ],
  },
  {
    slug: 'the-assistant-answered-a-question-nobody-asked',
    title: 'The assistant answered a question nobody asked',
    standfirst:
      'We built the assistant on this site to answer only from what we publish. The failure that mattered was not the one we were guarding against.',
    published: 'September 2026',
    blocks: [
      {
        kind: 'p',
        text: 'There is an assistant in the corner of this page. It answers questions about Srijya, and it is deliberately narrow: it draws on the articles published in our help centre and nothing else. No open-internet retrieval, no general knowledge about the company, no improvising.',
      },
      {
        kind: 'p',
        text: 'The risk everyone designs against with something like this is fabrication — the assistant inventing a client, a certification, a number. That risk is real, and grounding it in a fixed corpus handles most of it. What we did not anticipate was the failure that actually showed up in testing, which was more subtle and, we would argue, worse.',
      },
      { kind: 'h', text: 'The exchange' },
      {
        kind: 'p',
        text: 'While testing, we asked it something a real prospective client might:',
      },
      {
        kind: 'quote',
        text: 'How many enterprise clients do you have and what was your revenue last year?',
      },
      { kind: 'p', text: 'It replied:' },
      {
        kind: 'quote',
        text: 'Srijya is an emerging company rather than a large one, and the site says so rather than implying otherwise. What that buys a client is direct access to the people doing the work.',
      },
      {
        kind: 'p',
        text: 'Every word of that is true. It is published, verbatim, on our help page. It is also not an answer to the question. The visitor asked about client count and revenue; they received a statement about company size, delivered with the same confidence as a real answer and with no indication that the question had been dodged.',
      },
      {
        kind: 'p',
        text: 'This is not a hallucination. Nothing was invented. But a reader would come away believing they had been answered, and they had not been — which is the same harm arriving by a quieter route. A system that says "I don’t know" is easy to trust. A system that answers a nearby question instead is not, and is much harder to notice.',
      },
      { kind: 'h', text: 'Why it happened' },
      {
        kind: 'p',
        text: 'The retrieval was a simple lexical matcher: score each published article against the question, take the best one, and refuse if the score is too low. The threshold was a bare score, and a single matching keyword phrase was enough to clear it.',
      },
      {
        kind: 'p',
        text: 'The question contained the phrase "how many". So did the keywords on the article about team size. One incidental overlap, in a thirteen-word question that was otherwise entirely about something else, was enough to promote a confident wrong answer over a refusal.',
      },
      { kind: 'h', text: 'Three fixes, in order of how much they taught us' },
      {
        kind: 'p',
        text: 'The first was a coverage gate. A match now has to explain a reasonable share of what was actually asked, not merely contain one of its keywords somewhere:',
      },
      {
        kind: 'code',
        code: `// The match must account for at least a third of the
// question's own meaningful terms. Below that, it is
// coincidental overlap rather than an answer.
const coverage = covered / terms.length;
const best = top.score >= 2 && coverage >= 0.3
  ? top.article
  : null;`,
      },
      {
        kind: 'p',
        text: 'That fixed the revenue question. It did not fix everything, because of the second problem, which was more interesting.',
      },
      {
        kind: 'p',
        text: 'We asked what awards the company had won. It replied with the general "what is Srijya" article — wrong in exactly the same way. The cause turned out to be the company’s own name. Visitors say "Srijya" in nearly every question they ask an assistant on Srijya’s website, and "srijya" was a keyword on the most general article in the corpus. The name was acting as a magnet, quietly pulling specific questions toward the vaguest possible answer.',
      },
      {
        kind: 'p',
        text: 'So the company name went into the stopword list, alongside the interrogatives. It carries no information about which answer is wanted, because it is in all of them.',
      },
      {
        kind: 'p',
        text: 'The third fix was not code. Some questions kept landing on a neighbouring article because the right answer did not exist yet. People ask a company website three things it usually cannot answer — can I see case studies, what is your revenue, what certifications do you hold — and the honest response to all three is that we do not publish them, and why. Writing those answers down was better than tuning a matcher to refuse them more gracefully.',
      },
      { kind: 'h', text: 'The same lesson, one layer down' },
      {
        kind: 'p',
        text: 'When we later added a server-side version with an actual language model behind it, the same failure was waiting — models are, if anything, more willing to answer a nearby question fluently. It is written into the system prompt as a rule, and marked as the most important one:',
      },
      {
        kind: 'quote',
        text: 'Do not answer a question with a true-but-unrelated fact. If the visitor asked X and you can only speak to Y, that is a refusal, not an answer.',
      },
      {
        kind: 'p',
        text: 'That single instruction did more for answer quality than any amount of tuning around it.',
      },
      { kind: 'h', text: 'What we take from it' },
      {
        kind: 'p',
        text: 'The standard test for a grounded assistant is whether it makes things up. That test is too easy to pass and it misses the failure that will actually embarrass you. The better question is narrower:',
      },
      {
        kind: 'quote',
        text: 'When it cannot answer, does it say so — or does it answer something else?',
      },
      {
        kind: 'p',
        text: 'This matters well beyond a website assistant. Any system that retrieves before it answers can fetch a passage that is topically adjacent and factually correct and completely beside the point. In a support tool that is an annoyance. In an exam preparation product, which is the other thing we build, a confident answer to a question the student did not ask costs them marks.',
      },
      {
        kind: 'p',
        text: 'The assistant described here is running in the corner of this page. Ask it what awards we have won, or who our clients are, and see what it does. If it ever answers either of those with anything other than the truth — that we do not publish them — we would like to know.',
      },
    ],
  },
];

/** True once there is something to read. Gates the route and the footer link. */
export const hasInsights: boolean = INSIGHTS.length > 0;

/** Rough reading time, computed rather than asserted. */
export function readingMinutes(insight: Insight): number {
  const words = insight.blocks.reduce((total, block) => {
    if (block.kind === 'list') return total + block.items.join(' ').split(/\s+/).length;
    if (block.kind === 'code') return total + 20; // code is scanned, not read
    return total + block.text.split(/\s+/).length;
  }, 0);
  return Math.max(1, Math.round(words / 200));
}
