import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
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

/**
 * Fenced code block: language label + copy button in a header bar, syntax-neutral (no
 * highlighting library) body. `not-prose` opts the whole block out of the Tailwind Typography
 * plugin so its own styling isn't fought by prose-pre/prose-code rules.
 */
function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="not-prose my-4 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-[#1e1e1e]">
      <div className="flex items-center justify-between pl-3.5 pr-2 py-1.5 bg-white/[0.04] border-b border-white/10">
        <span className="text-[11px] font-mono text-slate-400 tracking-wide select-none">
          {language || 'text'}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
          }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" strokeWidth={2} />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" strokeWidth={1.75} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto custom-scrollbar">
        <code className="font-mono text-[13px] leading-[1.6] text-slate-200">{code}</code>
      </pre>
    </div>
  );
}

/** Plain-text content of a hast inline node (text/strong/emphasis/etc), recursively. */
function hastText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(hastText).join('');
  return '';
}

/**
 * A blockquote counts as a labelled callout when its first block is a paragraph
 * containing nothing but a single bold run — the shape the prompt asks the model to use
 * for Common Mistake / Memory Hook / Pro Tip asides (see SCHOLARLY_TEACHING_STANDARDS'
 * "Callout Boxes" section). Anything else (an ordinary quote, bold text inside a longer
 * sentence) falls through to the plain callout below.
 *
 * `node` here is a hast (HTML AST) node, not mdast — react-markdown converts through
 * remark-rehype before handing nodes to `components`, so elements are `{type:'element',
 * tagName}` and — critically — the whitespace between block children (the blank line
 * between the label and body) survives as its own `{type:'text', value:'\n'}` sibling.
 * Verified against the real output of the remark-gfm/remark-rehype pipeline this app uses.
 */
function calloutLabel(node: any): { label: string; labelIndex: number } | null {
  const children = node?.children || [];
  const labelIndex = children.findIndex((c: any) => c.type === 'element');
  const first = children[labelIndex];
  if (!first || first.tagName !== 'p') return null;

  const inlineKids: any[] = first.children || [];
  const inlineElements = inlineKids.filter((c: any) => c.type === 'element');
  const strayText = inlineKids.filter((c: any) => c.type === 'text' && c.value.trim() !== '');
  if (inlineElements.length !== 1 || inlineElements[0].tagName !== 'strong' || strayText.length > 0) {
    return null;
  }

  const label = hastText(inlineElements[0]).trim();
  if (!label || label.length > 40) return null;
  return { label, labelIndex };
}

const CALLOUT_THEMES: Record<string, { box: string; label: string }> = {
  MISTAKE: {
    box: 'bg-amber-50/80 dark:bg-amber-500/[0.07] border border-amber-100 dark:border-amber-500/15',
    label: 'text-amber-700 dark:text-amber-400',
  },
  MEMORY: {
    box: 'bg-violet-50/80 dark:bg-violet-500/[0.07] border border-violet-100 dark:border-violet-500/15',
    label: 'text-violet-700 dark:text-violet-400',
  },
  TIP: {
    box: 'bg-emerald-50/80 dark:bg-emerald-500/[0.07] border border-emerald-100 dark:border-emerald-500/15',
    label: 'text-emerald-700 dark:text-emerald-400',
  },
  DEFAULT: {
    box: 'bg-indigo-50/70 dark:bg-indigo-500/[0.06] border border-indigo-100 dark:border-indigo-500/15',
    label: 'text-indigo-700 dark:text-indigo-400',
  },
};

function calloutTheme(label: string) {
  const key = label.toUpperCase();
  if (key.includes('MISTAKE') || key.includes('ERROR') || key.includes('WATCH OUT')) return CALLOUT_THEMES.MISTAKE;
  if (key.includes('MEMORY') || key.includes('HOOK') || key.includes('MNEMONIC')) return CALLOUT_THEMES.MEMORY;
  if (key.includes('TIP') || key.includes('SHORTCUT') || key.includes('STRATEGY')) return CALLOUT_THEMES.TIP;
  return CALLOUT_THEMES.DEFAULT;
}

const markdownComponents: any = {
  code(props: any) {
    const { children, className } = props;
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

    // A language class only appears on fenced (block) code, never on inline `code`
    // spans — that's the same heuristic the old renderer used.
    if (lang) {
      return <CodeBlock language={lang} code={String(children).replace(/\n$/, '')} />;
    }
    return <code className={className}>{children}</code>;
  },
  // CodeBlock renders its own <pre>; when `code` above returns one, avoid double-wrapping.
  pre(props: any) {
    return <>{props.children}</>;
  },
  table(props: any) {
    return (
      <div className="not-prose my-4 overflow-x-auto custom-scrollbar rounded-lg border border-slate-200 dark:border-white/10">
        <table className="w-full text-[13.5px] border-collapse">{props.children}</table>
      </div>
    );
  },
  thead(props: any) {
    return <thead className="bg-slate-50 dark:bg-white/[0.04]">{props.children}</thead>;
  },
  tr(props: any) {
    return <tr className="even:bg-slate-50/60 dark:even:bg-white/[0.02]">{props.children}</tr>;
  },
  th(props: any) {
    return (
      <th className="text-left font-semibold text-slate-700 dark:text-slate-200 px-3.5 py-2 border-b border-slate-200 dark:border-white/10">
        {props.children}
      </th>
    );
  },
  td(props: any) {
    return (
      <td className="px-3.5 py-2 border-b border-slate-100 dark:border-white/[0.06] text-slate-600 dark:text-slate-300 align-top">
        {props.children}
      </td>
    );
  },
  blockquote(props: any) {
    const found = calloutLabel(props.node);
    if (found) {
      // react-markdown builds `children` by mapping over `node.children` 1:1 (including the
      // whitespace text nodes between block elements), so the label paragraph's hast index
      // is also its index among the rendered React children — slice there, not at a fixed
      // offset, or a leading blank-line text node before the label would throw off a
      // naive slice(1).
      const body = React.Children.toArray(props.children).slice(found.labelIndex + 1);
      const theme = calloutTheme(found.label);
      return (
        <div className={cn('not-prose my-4 rounded-xl px-4 py-3.5', theme.box)}>
          <div className={cn('text-[11px] font-bold tracking-[0.06em] uppercase mb-1.5', theme.label)}>
            {found.label}
          </div>
          <div className="text-[14px] leading-[1.6] text-slate-700 dark:text-slate-300 [&>p]:m-0 [&>p+p]:mt-2">
            {body}
          </div>
        </div>
      );
    }
    return (
      <blockquote className="not-prose my-4 rounded-lg border-l-[3px] border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-500/[0.06] px-4 py-3 text-[14px] leading-[1.6] text-slate-700 dark:text-slate-300 [&>p]:m-0 [&>p+p]:mt-2">
        {props.children}
      </blockquote>
    );
  },
};

/**
 * Shared markdown renderer for chat answers (main chat + notebook chat). Handles GFM,
 * math/chemistry (KaTeX + mhchem), inline mind-map/timeline JSON widgets, and gives code
 * blocks/tables/blockquotes their own styled treatment (see markdownComponents above).
 *
 * Mermaid support was removed: model-generated diagrams failed to parse often enough
 * (unquoted parentheses in node labels, truncated blocks mid-stream) that they reached
 * students as raw source more often than as diagrams. The prompt no longer asks for them.
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
