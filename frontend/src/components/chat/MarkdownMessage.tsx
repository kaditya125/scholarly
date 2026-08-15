import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// Enables the mhchem extension so chemical equations written as \ce{...} render correctly
// (e.g. \ce{6CO2 + 6H2O -> C6H12O6 + 6O2}). Must be imported after katex is available.
import 'katex/dist/contrib/mhchem.mjs';
import DiagramWidget from './DiagramWidget';

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

  blockquote({ children }: any) {
    return (
      <div className="my-3.5 rounded-2xl border border-amber-500/35 dark:border-amber-500/25 bg-amber-500/[0.04] dark:bg-amber-950/20 p-4 text-[14px] text-slate-800 dark:text-gray-200 shadow-2xs leading-relaxed not-italic">
        {children}
      </div>
    );
  },
};

/**
 * Shared markdown renderer for chat answers (main chat + notebook chat). Handles GFM,
 * math/chemistry (KaTeX + mhchem) and inline mind-map/timeline JSON widgets.
 */
function MarkdownMessageInner({ content }: { content: string }) {
  const normalized = useMemo(() => normalizeMath(content), [content]);
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={markdownComponents}>
      {normalized}
    </ReactMarkdown>
  );
}

export default React.memo(MarkdownMessageInner);
