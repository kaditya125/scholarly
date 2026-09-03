import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CloseIcon } from '@/components/Icons';
import { HELP_ARTICLES } from '@/content/help';
import type { HelpArticle } from '@/content/help';
import { COMPANY } from '@/site.config';

/**
 * Ask Srijya — the site assistant.
 *
 * GROUNDED, AND HONEST ABOUT ITS LIMITS
 *
 * Every answer it gives is an answer published at /help, verbatim. It does not
 * paraphrase, summarise or extrapolate, because each of those is a way to say
 * something the company has not actually committed to. When nothing matches well
 * enough, it says so and points at a person rather than producing a plausible
 * sentence — a wrong answer about whether a company is registered, or what it
 * can build, is worse than no answer.
 *
 * WHY IT WORKS WITH NO BACKEND
 *
 * Retrieval over the published corpus runs locally, so the assistant is useful
 * the moment the site is deployed — before any AI endpoint exists, and if one is
 * ever unreachable. This mirrors the contact form, which composes mail in the
 * visitor's own client when no endpoint is configured.
 *
 * When `VITE_ASSISTANT_ENDPOINT` is set, a matched article is still shown
 * immediately and the endpoint is asked in parallel for a fuller answer. The
 * grounding does not move client-side: the endpoint keeps its own corpus, the
 * model, and the keys. Nothing here is a substitute for that, and nothing here
 * needs to be.
 */

const ENDPOINT: string = import.meta.env.VITE_ASSISTANT_ENDPOINT ?? '';

const SUGGESTIONS = [
  'What does Srijya build?',
  'Tell me about Sadhya.',
  'How does Srijya approach AI?',
  'How do I start a project?',
] as const;

const NO_ANSWER =
  'I don’t have enough verified information to answer that accurately. A person on the Srijya team can help — the contact page is the fastest route.';

type Turn = {
  id: number;
  question: string;
  answer: string;
  /** Set when the answer came from a published article, so it can be linked. */
  articleId?: string;
  /** Follow-ups drawn from the corpus, never invented. */
  related: HelpArticle[];
};

/**
 * Scores the published articles against a question.
 *
 * A deliberately simple lexical match. Ranking five dozen short articles does
 * not need embeddings, and a simple matcher has the property that matters here:
 * when it fails, it fails visibly and returns nothing, rather than confidently
 * retrieving the wrong passage.
 */
/**
 * Words that carry no signal about *which* answer is wanted.
 *
 * "srijya" is in here for a reason that is easy to miss: visitors name the
 * company in nearly every question they ask it, so treating it as evidence makes
 * the most general article a magnet that swallows specific questions. The
 * interrogatives go for the same reason — every question starts with one.
 */
const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'yours', 'our', 'are', 'was', 'were', 'for', 'with', 'from',
  'that', 'this', 'have', 'has', 'had', 'can', 'could', 'would', 'does', 'did', 'any',
  'what', 'who', 'how', 'why', 'when', 'where', 'which', 'about', 'tell', 'srijya',
]);

function findArticle(query: string): { best: HelpArticle | null; related: HelpArticle[] } {
  const q = query.toLowerCase().trim();
  const terms = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  const scored = HELP_ARTICLES.map((article) => {
    const haystack = `${article.question} ${article.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const term of terms) if (haystack.includes(term)) score += 1;
    // A whole keyword phrase appearing in the question is much stronger evidence
    // than the same words scattered across it.
    for (const keyword of article.keywords) if (q.includes(keyword)) score += 2;
    return { article, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];

  /* Two gates, because score alone is not enough.
     
     A long question that happens to contain one keyword — "how many enterprise
     clients do you have and what was your revenue last year?" contains "how
     many" — clears any score threshold while having almost nothing to do with
     the article it matched. Answering it with a true-but-unrelated passage is
     not a fabrication, but it reads as one: the visitor asked a question and got
     something that looks like an answer to it and is not.
     
     So the match must also explain a reasonable share of what was actually
     asked. Coverage is the fraction of the question's own meaningful terms the
     article accounts for; below a third, the assistant says it does not know. */
  const covered = terms.filter((term) => {
    const haystack = `${top?.article.question ?? ''} ${top?.article.keywords.join(' ') ?? ''}`.toLowerCase();
    return haystack.includes(term);
  }).length;
  const coverage = terms.length > 0 ? covered / terms.length : 0;

  const best = top && top.score >= 2 && coverage >= 0.3 ? top.article : null;
  const related = scored
    .slice(1, 4)
    .filter((s) => s.score >= 2)
    .map((s) => s.article);

  return { best, related };
}

export default function AskSrijya() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    // Focus returns to where it came from, or the visitor is dropped at the top
    // of the document with no idea what just happened.
    launcherRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Keep the newest exchange in view without yanking the whole page around.
  useEffect(() => {
    if (turns.length > 0) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, thinking]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    const { best, related } = findArticle(trimmed);
    const id = nextId.current++;

    setTurns((current) => [
      ...current,
      {
        id,
        question: trimmed,
        answer: best ? best.answer : NO_ANSWER,
        articleId: best?.id,
        related,
      },
    ]);
    setQuery('');

    if (!ENDPOINT) return;

    /* An endpoint is configured, so ask it for a fuller answer. The grounded
       answer above is already on screen — this can only improve it, and if the
       request fails the visitor is left with a correct answer rather than an
       error. */
    setThinking(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, source: 'srijya-site' }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data: unknown = await response.json();
      const answer =
        typeof data === 'object' && data !== null && typeof (data as { answer?: unknown }).answer === 'string'
          ? (data as { answer: string }).answer
          : null;
      if (answer) {
        setTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, answer } : turn))
        );
      }
    } catch {
      // Deliberately silent. The grounded answer stands.
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ask-srijya-panel"
        className="ask-launcher"
      >
        <span aria-hidden="true" className="text-accent">
          ✦
        </span>
        Ask Srijya
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="ask-srijya-panel"
          role="dialog"
          aria-labelledby="ask-srijya-title"
          className="ask-panel"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="ask-srijya-title" className="heading-4 text-ink">
                Srijya AI
              </h2>
              <p className="mt-1 text-[0.8125rem] text-ink-3">
                Answers drawn from our published information.
              </p>
            </div>
            <button type="button" onClick={close} className="ask-close" aria-label="Close">
              <CloseIcon size={18} />
            </button>
          </div>

          <div ref={logRef} className="max-h-[42vh] overflow-y-auto px-5 py-4">
            {turns.length === 0 ? (
              <div>
                <p className="body-text">
                  Ask about the company, our products, the technology we work with, or how we
                  could help turn your idea into something real.
                </p>
                <ul className="mt-5 space-y-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => void ask(suggestion)}
                        className="ask-suggestion"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-6" aria-live="polite">
                {turns.map((turn) => (
                  <div key={turn.id}>
                    <p className="text-[0.875rem] font-medium text-ink">{turn.question}</p>
                    <p className="body-text mt-2 text-[0.9063rem]">{turn.answer}</p>

                    {turn.articleId ? (
                      <Link
                        to={`/help#${turn.articleId}`}
                        onClick={close}
                        className="link-arrow mt-3 text-[0.8125rem]"
                      >
                        Read this in the help centre
                        <ArrowRight size={13} />
                      </Link>
                    ) : (
                      <Link to="/contact" onClick={close} className="link-arrow mt-3 text-[0.8125rem]">
                        Contact the team
                        <ArrowRight size={13} />
                      </Link>
                    )}

                    {turn.related.length > 0 ? (
                      <ul className="mt-4 space-y-2">
                        {turn.related.map((article) => (
                          <li key={article.id}>
                            <button
                              type="button"
                              onClick={() => void ask(article.question)}
                              className="ask-suggestion"
                            >
                              {article.question}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
                {thinking ? (
                  <p className="text-[0.8125rem] text-ink-3">Checking for a fuller answer…</p>
                ) : null}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(query);
            }}
            className="flex items-center gap-3 border-t border-line px-5 py-4"
          >
            <label htmlFor="ask-srijya-input" className="sr-only">
              Ask a question about Srijya
            </label>
            <input
              ref={inputRef}
              id="ask-srijya-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask a question…"
              autoComplete="off"
              className="field-input"
            />
            <button type="submit" className="ask-send" aria-label="Send question">
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="border-t border-line px-5 py-3 text-[0.75rem] text-ink-3">
            Not a substitute for talking to us. Write to{' '}
            <a href={`mailto:${COMPANY.email}`} className="underline underline-offset-2">
              {COMPANY.email}
            </a>
            .
          </p>
        </div>
      ) : null}
    </>
  );
}
