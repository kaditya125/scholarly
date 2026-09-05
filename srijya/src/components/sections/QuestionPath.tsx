import { Fragment, type ReactNode } from 'react';
import SectionMotif from '@/components/SectionMotif';
import { revealProps } from '@/lib/reveal';

/**
 * How Sadhya works, as the path one question takes through it.
 *
 * WHY THIS REPLACED A SCREENSHOT
 *
 * The page used to open with a single picture of Sadhya's landing page. A
 * screenshot of a finished surface is the least informative thing a product can
 * show: it proves the product renders. It says nothing about the six decisions
 * between a student's question and the answer they get, and those decisions are
 * the entire reason this page exists — Srijya's claim is that it can build this,
 * not that it can style it.
 *
 * WHY THE FRAMES ARE DRAWINGS AND NOT SADHYA'S OWN DEMO PANEL
 *
 * Sadhya publishes an interactive demo at /how-it-works, and the obvious move
 * was to lift a frame of it per stage. Its four states contain a named professor
 * who does not exist, a live class with 142 students in it, and an accuracy
 * figure of 88%. That material is fine where it is — clearly a simulation, on
 * Sadhya's own marketing page — but reproduced here it becomes Srijya asserting
 * a teacher, a cohort and a measurement. This page ends by saying it carries no
 * performance claims precisely because a reader cannot check them.
 *
 * So each stage draws its own artefact instead: the filter that is actually
 * passed to the index, the two rerank passes that actually run, the floor that
 * is actually applied. Every number below is in the backend, and someone reading
 * this page is being told how the thing works rather than shown a picture of it
 * working.
 *
 * A stage takes an optional `image`. The moment there is a real screenshot of
 * that step from a signed-in session, it goes in there and the drawing steps
 * aside — one line per stage, no restructuring.
 *
 * FAILURE BEHAVIOUR
 *
 * Same rule as every other animated thing on this site: the resting state is the
 * finished artefact. Motion lives inside `prefers-reduced-motion: no-preference`
 * and runs hidden -> shown with `backwards` fill, keyed on `data-revealed` from
 * the one existing observer. An animation that never fires leaves the frame
 * complete rather than empty.
 */

type Stage = {
  n: string;
  title: string;
  body: ReactNode;
  frame: ReactNode;
  caption: string;
  /** A real screenshot of this step, when one exists. Replaces `frame`. */
  image?: { src: string; alt: string; width: number; height: number };
};

/**
 * Sixty-four of the seven hundred and sixty-eight components, at a fixed set of
 * heights. A real vector is unreadable at this size and would be no more true
 * for being real, so this is a stable sketch rather than live data — which is
 * what the caption says it is.
 */
const VECTOR_BARS = Array.from({ length: 64 }, (_, i) => {
  const t = Math.sin(i * 1.7) * 0.5 + Math.sin(i * 0.43) * 0.34 + Math.sin(i * 3.1) * 0.16;
  return 0.16 + 0.84 * Math.abs(t);
});

/** The two rerank passes, as they narrow. Bar widths are the counts, to scale. */
const FUNNEL = [
  { label: 'vector search', note: 'topK × 4', n: 20 },
  { label: 'deduplicated', note: 'one passage, two chunks', n: 17 },
  { label: 'rerank, pass one', note: 'topK × 2', n: 10 },
  { label: 'rerank, pass two', note: 'topK', n: 5 },
];

/** Widest bar in the funnel, so the rest are drawn as a fraction of it. */
const FUNNEL_MAX = Math.max(...FUNNEL.map((row) => row.n));

/** The floor the backend applies to a public-knowledge hit. */
const FLOOR = 0.1;

/**
 * Candidate scores against that floor, ordered as the reranker returns them.
 * The shape is real; the numbers are here to show where the line falls.
 */
const SCORED = [
  { source: 'NCERT Physics XII · Ch 3', score: 0.71 },
  { source: 'Standard textbook · resistivity', score: 0.44 },
  { source: 'Teacher note · drift velocity', score: 0.19 },
  { source: 'Adjacent chapter · superconductivity', score: 0.06 },
  { source: 'Same subject, different exam', score: 0.03 },
];

/** Where the floor falls in that list, so the rule can be drawn through it
    rather than captioned underneath it. */
const FLOOR_INDEX = SCORED.findIndex((row) => row.score < FLOOR);

/** Where a passage came from, and what that is worth. Straight from the backend. */
const AUTHORITY: ReadonlyArray<readonly [string, string]> = [
  ['NCERT', '1.5'],
  ['Government', '1.4'],
  ['Official syllabus', '1.4'],
  ['Standard textbook', '1.3'],
  ['Teacher notes', '1.2'],
  ['Student upload', '1.0'],
  ['Web search', '0.8'],
];

/** The four things that call the retrieval below. Same code, same fence, same floor. */
const CALLERS = ['The tutor', 'Podcast generation', 'Voice mode', 'The help desk'];

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-3">
      {children}
    </span>
  );
}

const STAGES: Stage[] = [
  {
    n: '01',
    title: 'A question arrives in the words someone actually used',
    body: (
      <>
        Nobody types a search query. They type a follow-up to the last thing they read, with a
        pronoun standing in for the subject. So before anything is searched, the question is
        rewritten against the previous four turns into one that can stand on its own — pronouns
        resolved, a related term or two added.
      </>
    ),
    caption: 'Query rewriting · resolved against the last four turns',
    frame: (
      <div className="space-y-4">
        <div>
          <Key>asked</Key>
          <p className="mt-1.5 font-mono text-[0.8125rem] leading-[1.7] text-ink">
            ok but why does it go up when it heats up
          </p>
        </div>
        <div className="qp-rewrite border-t border-line pt-4">
          <Key>searched for</Key>
          <p className="mt-1.5 font-mono text-[0.8125rem] leading-[1.7] text-ink-2">
            resistance of a metallic conductor increasing with temperature · resistivity ·
            relaxation time
          </p>
        </div>
      </div>
    ),
  },
  {
    n: '02',
    title: 'The question becomes 768 numbers',
    body: (
      <>
        Meaning is compared as geometry, so the question is turned into a vector by the same model
        that indexed the material. It is 768 dimensions because the index it has to match is: a
        later, larger embedding model was asked to return 768 outputs rather than re-embedding an
        entire corpus around it. Identical text is never embedded twice — the result is cached
        against a digest of the input, because a repeat is a paid round trip for an answer already
        known.
      </>
    ),
    caption: 'gemini-embedding-001 · 768 dimensions · 64 of them drawn',
    frame: (
      <div>
        <div className="flex h-24 items-end gap-[3px]" aria-hidden="true">
          {VECTOR_BARS.map((h, i) => (
            <span
              key={i}
              className="qp-bar flex-1 rounded-[1px] bg-accent/70"
              style={{ height: `${(h * 100).toFixed(1)}%`, ['--i' as string]: i }}
            />
          ))}
        </div>
        <p className="mt-4 border-t border-line pt-4 font-mono text-[0.75rem] text-ink-3">
          cache key <span className="text-ink-2">emb:gemini-embedding-001:768:&lt;digest&gt;</span>
        </p>
      </div>
    ),
  },
  {
    n: '03',
    title: 'The search is fenced before it runs, not after',
    body: (
      <>
        A NEET question must not be answered out of an SSC paper. The scope is a metadata filter
        handed to the index itself, so off-scope material is never a candidate in the first place —
        it is not retrieved and then discarded. That ordering is the whole point: nothing
        downstream can leak what was never fetched, so the guarantee does not rest on every later
        stage being correct.
      </>
    ),
    caption: 'Metadata filter · applied at the index, never in the ranker',
    frame: (
      <pre className="overflow-x-auto font-mono text-[0.8125rem] leading-[1.9] text-ink-2">
        <code>{`// curriculum
filter = { owner: 'ncert-curriculum' }

// a student's own notebook
filter = { notebookId }

// public knowledge
filter = { public: true }`}</code>
      </pre>
    ),
  },
  {
    n: '04',
    title: 'A wide net, then judged twice',
    body: (
      <>
        Vector similarity is fast and blunt, so it shortlists rather than decides: four times as
        many candidates as will be kept, deduplicated, then read against the question by a
        reranker — once down to a working set, once down to the final few. That the reranker is
        the multilingual model is a requirement, not a preference. Under the English-only one,
        scores for Devanagari and Hinglish questions collapse into the noise, and no threshold
        chosen afterwards can pull them back apart.
      </>
    ),
    caption: 'Cohere rerank-multilingual-v3.0 · two passes',
    frame: (
      <ol className="space-y-3.5">
        {FUNNEL.map((row, i) => (
          <li key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
            <div className="col-span-2 flex items-baseline justify-between gap-4">
              <Key>{row.label}</Key>
              <span className="font-mono text-[0.75rem] text-ink-3">{row.note}</span>
            </div>
            <span
              className="qp-funnel h-[6px] rounded-[2px] bg-accent/70"
              style={{ width: `${(row.n / FUNNEL_MAX) * 100}%`, ['--i' as string]: i }}
              aria-hidden="true"
            />
            <span className="font-mono text-[0.8125rem] tabular-nums text-ink">{row.n}</span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    n: '05',
    title: 'Weak matches are dropped rather than dressed up',
    body: (
      <>
        The failure mode of a retrieval system is not a wrong answer. It is a confident answer
        assembled out of the closest thing it happened to find. Anything the reranker scores below
        a measured floor is discarded, and if that empties the list, an empty list is what the
        model is given. A tutor that says it does not have this is behaving correctly; one that
        improvises around a weak match is not.
      </>
    ),
    caption: 'Relevance floor 0.10 · a measured number, not a guess',
    frame: (
      <ol className="space-y-2.5">
        {SCORED.map((row, i) => {
          const kept = row.score >= FLOOR;
          return (
            <Fragment key={row.source}>
              {/* The rule goes where the cut actually happens, between the last
                  match that survives and the first that does not. A floor
                  captioned under the whole list is a label; this is the line. */}
              {i === FLOOR_INDEX ? (
                <li className="!mt-4 border-t border-dashed border-line-2 pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
                  floor {FLOOR.toFixed(2)} — below this, nothing is returned
                </li>
              ) : null}

              <li className="grid grid-cols-[1fr_auto] items-center gap-x-4">
                <span
                  className={
                    kept
                      ? 'truncate font-mono text-[0.75rem] text-ink-2'
                      : 'qp-drop truncate font-mono text-[0.75rem] text-ink-3 line-through decoration-line-2'
                  }
                >
                  {row.source}
                </span>
                <span
                  className={
                    kept
                      ? 'font-mono text-[0.75rem] tabular-nums text-ink'
                      : 'font-mono text-[0.75rem] tabular-nums text-ink-3'
                  }
                >
                  {row.score.toFixed(2)}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    ),
  },
  {
    n: '06',
    title: 'The answer is assembled with its sources attached',
    body: (
      <>
        What survives is weighted by where it came from, and every retrieved passage is sanitised
        first — a retrieved document is untrusted text, and a PDF a student uploaded can carry a
        line addressed to the model rather than to them. The answer is then generated with its
        citations, and each claim in it is checked back against the passages that were actually
        retrieved.
      </>
    ),
    caption: 'Authority weighting · injection sanitising · claim verification',
    frame: (
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5">
        {AUTHORITY.map(([source, weight]) => (
          <div key={source} className="col-span-2 grid grid-cols-subgrid items-baseline">
            <dt className="font-mono text-[0.75rem] text-ink-2">{source}</dt>
            <dd className="font-mono text-[0.75rem] tabular-nums text-ink">×{weight}</dd>
          </div>
        ))}
      </dl>
    ),
  },
];

export default function QuestionPath() {
  return (
    <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
      <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-3">
          <p className="label flex items-center gap-2.5">
            <SectionMotif name="process" size={20} className="shrink-0 text-accent" />
            04 / How it works
          </p>
        </div>

        <div className="min-w-0 md:col-span-9">
          <h2 className="display-3 max-w-[22ch]">The path one question takes</h2>
          <p className="body-text mt-6 max-w-[62ch]">
            A screenshot of a finished screen proves that a product renders. What is worth showing
            is the distance between a student typing a half-formed follow-up and the answer that
            comes back with its sources on it — six stages, each of which exists because the
            obvious version of it was wrong.
          </p>

          <ol className="mt-12 space-y-14 md:mt-14 md:space-y-16">
            {STAGES.map((stage, i) => (
              <li
                key={stage.n}
                className="grid gap-6 lg:grid-cols-12 lg:gap-10"
                {...revealProps(i === 0 ? 0 : 60)}
              >
                <div className="lg:col-span-5">
                  <p className="index-num">{stage.n}</p>
                  <h3 className="heading-4 mt-3 text-ink">{stage.title}</h3>
                  <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">{stage.body}</p>
                </div>

                <figure className="min-w-0 lg:col-span-7">
                  <div className="overflow-hidden rounded-[5px] border border-line bg-paper-2 p-5 md:p-6">
                    {stage.image ? (
                      <img
                        src={stage.image.src}
                        alt={stage.image.alt}
                        width={stage.image.width}
                        height={stage.image.height}
                        loading="lazy"
                        decoding="async"
                        className="block w-full rounded-[3px]"
                      />
                    ) : (
                      stage.frame
                    )}
                  </div>
                  <figcaption className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
                    {stage.caption}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ol>

          {/* The part a per-feature tour cannot show: the stages are one seam, and
              everything that looks like a separate AI feature is a caller of it. */}
          <div className="mt-14 rounded-[5px] border border-line bg-paper-2 p-6 md:mt-16 md:p-8">
            <p className="label flex items-center gap-2.5">
              <SectionMotif name="converge" size={20} className="shrink-0 text-accent" />
              And how they work together
            </p>
            <p className="body-text mt-5 max-w-[58ch]">
              Those six stages are one piece of code, not six. The tutor, the two-voice audio
              explainers, the voice mode and the help desk are not four AI features that happen to
              share a product — they are four callers of the same retrieval, which is why the same
              fence and the same floor apply whether a student is reading, listening or asking out
              loud.
            </p>
            <p className="body-text mt-4 max-w-[58ch]">
              It is also why a fix lands once. Raising the floor, or correcting what a kind of
              source is worth, changes every surface in the product at the same moment — and that
              is a property of the architecture rather than of anyone remembering to.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CALLERS.map((caller) => (
                <li
                  key={caller}
                  className="rounded-[4px] border border-line bg-surface px-4 py-3 font-mono text-[0.75rem] text-ink-2"
                >
                  {caller}
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
              one retrieval layer · one filter vocabulary · one floor
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
