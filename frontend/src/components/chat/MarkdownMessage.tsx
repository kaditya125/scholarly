import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// Enables the mhchem extension so chemical equations written as \ce{...} render correctly
// (e.g. \ce{6CO2 + 6H2O -> C6H12O6 + 6O2}). Must be imported after katex is available.
import 'katex/dist/contrib/mhchem.mjs';
import mermaid from 'mermaid';
import DiagramWidget from './DiagramWidget';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  suppressErrorRendering: true,
});

/**
 * Renders a mermaid diagram. Model-generated mermaid is frequently malformed or arrives
 * incomplete while streaming, so instead of a scary red "Failed to render diagram" error we:
 *  - validate with mermaid.parse first,
 *  - show a neutral "Rendering diagram…" placeholder until it's valid,
 *  - fall back to the raw diagram source in a <pre> block if it never parses.
 */
export const Mermaid = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const code = (chart || '').trim();
    if (!code) {
      setFailed(true);
      setSvg('');
      return;
    }
    setFailed(false);
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid
      .parse(code)
      .then(() => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(svg);
          setFailed(false);
        }
      })
      .catch((err) => {
        console.error('Mermaid render error', err);
        if (!cancelled) {
          setFailed(true);
          setSvg('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (svg) {
    return (
      <div
        className="flex justify-center my-6 overflow-x-auto w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  if (failed) {
    return (
      <pre className="my-4 p-3 rounded-xl bg-slate-100 dark:bg-[#1e1e1e] text-xs text-slate-600 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap border border-slate-200 dark:border-white/10">
        {chart}
      </pre>
    );
  }
  return <div className="my-4 text-xs text-slate-400 dark:text-gray-500">Rendering diagram…</div>;
};

/**
 * Converts the escaped LaTeX delimiters \[ \] \( \) into $$ / $ so remark-math parses them.
 * We deliberately DO NOT convert bare square brackets ("[ ... ]"): a previous version turned
 * every "[ " / " ]" in ordinary prose into math delimiters, which made KaTeX render plain text
 * (and chemical equations) as garbled math.
 */
export function normalizeMath(src: string): string {
  return (src || '')
    .replace(/\\\[/g, '$$$$')
    .replace(/\\\]/g, '$$$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
// throwOnError/strict:false so an unsupported or malformed macro degrades gracefully
// (rendered in KaTeX error style) instead of corrupting the whole message.
const REHYPE_PLUGINS: any = [[rehypeKatex, { throwOnError: false, strict: false }]];

const markdownComponents: any = {
  code(props: any) {
    const { children, className, node, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const lang = match?.[1];
    if (lang === 'mermaid') {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />;
    }
    if (lang === 'json') {
      try {
        const parsed = JSON.parse(String(children));
        if (parsed && parsed.mindMap) return <DiagramWidget type="mindMap" data={parsed.mindMap} />;
        if (parsed && parsed.timeline) return <DiagramWidget type="timeline" data={parsed.timeline} />;
      } catch {
        /* not a diagram payload — fall through to a normal code block */
      }
    }
    return (
      <code {...rest} className={className}>
        {children}
      </code>
    );
  },
};

/**
 * Shared markdown renderer for chat answers (main chat + notebook chat). Handles GFM,
 * math/chemistry (KaTeX + mhchem), mermaid diagrams and inline mind-map/timeline JSON widgets.
 */
export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={markdownComponents}>
      {normalizeMath(content)}
    </ReactMarkdown>
  );
}
