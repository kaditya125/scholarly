import React from 'react';
import { Gemini, Cohere, ElevenLabs, Claude, Antigravity } from '@lobehub/icons';

/**
 * Attribution, split into the two claims it actually contains.
 *
 * These are different statements and conflating them would be untrue in both directions:
 *
 *   RUNTIME      the models that serve students. Google Gemini via Vertex AI, Cohere for
 *                reranking, ElevenLabs for speech. Verifiable in the deployment's own config.
 *   DEVELOPMENT  the tools the product was written with. That is a statement about how the
 *                codebase was authored, not about what runs when someone asks a question.
 *
 * A single row of logos would say "Sadhya is built on Claude, Gemini and ElevenLabs", which is not
 * true — two of those are development tools. The separation is the honest version and costs
 * nothing.
 *
 * ── On the marks themselves ─────────────────────────────────────────────────────────────────
 * These are each company's own mark, rendered unmodified from @lobehub/icons (already a
 * dependency) rather than redrawn. A hand-approximated trademark is worse than no logo at all:
 * it misrepresents the mark while still invoking the brand.
 *
 * Used here for factual attribution — naming what the product runs on and what it was written
 * with — which is what these marks are permitted for. Nothing on this page claims endorsement,
 * partnership or affiliation, and the wording under BUILT WITH exists specifically so a reader
 * cannot mistake a development tool for part of the running product. If any of these companies'
 * brand guidelines require a different asset, size or clear space, the fix is to swap the asset,
 * not to redraw it.
 */

interface Credit {
  name: string;
  role: string;
  Logo: React.ComponentType<{ size?: number }>;
}

/**
 * Prefer each brand's full-colour mark, fall back to its monochrome one.
 *
 * The library does not offer the same variants for every brand — ElevenLabs ships no `.Color`,
 * for instance — so asking for one uniformly fails to compile for some and would render nothing
 * for others. Picking per brand keeps every logo an unmodified official asset rather than
 * substituting a redrawn stand-in wherever the colour variant happens to be missing.
 */
const mark = (icon: any): React.ComponentType<{ size?: number }> => icon.Color ?? icon;

const RUNTIME: Credit[] = [
  { name: 'Google Gemini', role: 'Reasoning, embeddings and the live voice model', Logo: mark(Gemini) },
  { name: 'Cohere', role: 'Reranking retrieved passages', Logo: mark(Cohere) },
  { name: 'ElevenLabs', role: 'Speech synthesis', Logo: mark(ElevenLabs) },
];

const BUILT_WITH: Credit[] = [
  { name: 'Claude', role: '', Logo: mark(Claude) },
  { name: 'Antigravity', role: '', Logo: mark(Antigravity) },
];

/**
 * Fixed-width box so names line up whether a mark is square or wide.
 *
 * The explicit text colour is load-bearing, not decoration. A monochrome mark carries no fill of
 * its own and paints in `currentColor`; inherited from this section that resolved to white, which
 * on the near-white panel background rendered ElevenLabs as nothing at all — present in the DOM,
 * correctly sized, and invisible. Anchoring the colour here fixes every mono mark at once, and
 * the full-colour logos are unaffected because their fills are set on the paths.
 */
const Mark: React.FC<{ Logo: Credit['Logo'] }> = ({ Logo }) => (
  <span
    className="inline-flex items-center justify-center w-5 shrink-0 text-slate-900 dark:text-white"
    aria-hidden="true"
  >
    <Logo size={18} />
  </span>
);

export const BuiltWith: React.FC = () => (
  <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-10 sm:gap-16 items-start">
    <div>
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        Runs on
      </p>
      <ul className="mt-4 space-y-3">
        {RUNTIME.map((c) => (
          <li key={c.name} className="flex items-center gap-2.5">
            <Mark Logo={c.Logo} />
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[15px] font-semibold text-slate-800 dark:text-gray-100">{c.name}</span>
              <span className="text-[13px] text-slate-500 dark:text-gray-400">{c.role}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>

    <div className="sm:text-right">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        Built with
      </p>
      <ul className="mt-4 flex flex-wrap sm:justify-end items-center gap-x-5 gap-y-2">
        {BUILT_WITH.map((c) => (
          <li key={c.name} className="flex items-center gap-2">
            <Mark Logo={c.Logo} />
            <span className="text-[15px] font-semibold text-slate-800 dark:text-gray-100">{c.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-slate-500 dark:text-gray-400 max-w-[19rem] sm:ml-auto">
        Development tools used to write this codebase — not part of what answers a student&rsquo;s
        question.
      </p>
    </div>
  </div>
);

export default BuiltWith;
