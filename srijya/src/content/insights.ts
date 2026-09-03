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
