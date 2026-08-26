import React from 'react';

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
 * A single row of logos would say "Sadhya is built on Claude, Gemini and ChatGPT", which is not
 * true — two of those are development tools and one is not used at all. The separation is the
 * honest version and costs nothing.
 *
 * NO THIRD-PARTY LOGO FILES are embedded. Each of these companies publishes brand guidelines
 * governing how its marks may be shown, and placing them on a commercial page can imply an
 * endorsement or partnership that does not exist. Named credit in text carries the same
 * information and makes no claim about a relationship. If official assets are wanted here, they
 * should come from each brand's own press kit under its stated terms.
 */

interface Credit {
  name: string;
  by: string;
  role: string;
}

const RUNTIME: Credit[] = [
  { name: 'Google Gemini', by: 'Google', role: 'Reasoning, embeddings and the live voice model' },
  { name: 'Cohere', by: 'Cohere', role: 'Reranking retrieved passages' },
  { name: 'ElevenLabs', by: 'ElevenLabs', role: 'Speech synthesis' },
];

const BUILT_WITH: Credit[] = [
  { name: 'Claude', by: 'Anthropic', role: '' },
  { name: 'Antigravity', by: 'Google', role: '' },
];

export const BuiltWith: React.FC = () => (
  <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-10 sm:gap-16 items-start">
    <div>
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        Runs on
      </p>
      <ul className="mt-4 space-y-3">
        {RUNTIME.map((c) => (
          <li key={c.name} className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[15px] font-semibold text-slate-800 dark:text-gray-100">{c.name}</span>
            <span className="text-[13px] text-slate-500 dark:text-gray-400">{c.role}</span>
          </li>
        ))}
      </ul>
    </div>

    <div className="sm:text-right">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        Built with
      </p>
      <p className="mt-4 text-[15px] font-semibold text-slate-800 dark:text-gray-100">
        {BUILT_WITH.map((c) => c.name).join(' · ')}
      </p>
      <p className="mt-1.5 text-[13px] text-slate-500 dark:text-gray-400 max-w-[19rem] sm:ml-auto">
        Development tools used to write this codebase — not part of what answers a student&rsquo;s
        question.
      </p>
    </div>
  </div>
);

export default BuiltWith;
