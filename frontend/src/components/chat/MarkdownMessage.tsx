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
};

/**
 * Shared markdown renderer for chat answers (main chat + notebook chat). Handles GFM,
 * math/chemistry (KaTeX + mhchem) and inline mind-map/timeline JSON widgets.
 *
 * Mermaid support was removed: model-generated diagrams failed to parse often enough
 * (unquoted parentheses in node labels, truncated blocks mid-stream) that they reached
 * students as raw source more often than as diagrams. The prompt no longer asks for them.
 */
function MarkdownMessageInner({ content }: { content: string }) {
  // normalizeMath walks the whole string; memoise so it isn't redone on parent re-renders
  // that didn't change the text.
  const normalized = useMemo(() => normalizeMath(content), [content]);
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={markdownComponents}>
      {normalized}
    </ReactMarkdown>
  );
}

/**
 * Memoised on `content`.
 *
 * This is rendered inside a typewriter reveal that ticks many times a second. Without
 * memoisation every tick re-ran the full remark/rehype pipeline (GFM + math + KaTeX +
 * mermaid) over the entire document — 60 complete markdown parses per second on a growing
 * answer. That starved the main thread, so the reveal stuttered and jumped instead of
 * writing smoothly. Re-rendering only when the string actually changes is what makes a
 * character-level animation affordable at all.
 */
export default React.memo(MarkdownMessageInner);
