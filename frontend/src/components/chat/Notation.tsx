import { Fragment, ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Draws the agent's formula markup as notation: `F_x` → F<sub>x</sub>, `v^2` → v<sup>2</sup>,
 * `p_{AB}` / `s^{-2}` for multi-character scripts. The same markup the PDF renderer reads, so a
 * formula looks the same on a flashcard as it does on the chart it came from. LaTeX between `$`
 * signs (real past-year questions are written that way) is typeset by KaTeX.
 *
 * With `formula`, letters follow the PDF renderer's rules too (documentPdf.renderer.ts, Shaper):
 * short variables italic; numbers, operators, function names (sin, max) and words upright; and a
 * unit relation ("1 N = 1 kg m s^-2") upright throughout, since SI units are never italic.
 */

/** Upright in a formula — kept in step with UPRIGHT_WORDS in the backend's PDF renderer. */
const UPRIGHT_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'net', 'const',
  'in', 'of', 'the', 'is', 'per', 'and', 'to', 'by', 'on', 'at', 'as', 'for', 'or',
]);

export function renderNotation(text: string, { formula = false }: { formula?: boolean } = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const src = String(text ?? '');
  const unitsOnly = formula && /^\s*\d/.test(src);
  let plain = '';
  let key = 0;
  const flush = () => {
    if (plain) out.push(<Fragment key={key++}>{plain}</Fragment>);
    plain = '';
  };
  // Letters of a sub/superscript are italic when the script is a variable-sized label (F_x, p_{AB}),
  // upright when it is a word (v_{max}); digits and signs always upright.
  const script = (body: string): ReactNode =>
    formula && body.length <= 2
      ? body.split(/([A-Za-z]+)/).map((part, n) => (/^[A-Za-z]+$/.test(part) ? <i key={n}>{part}</i> : part))
      : body;

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if ((ch === '_' || ch === '^') && i + 1 < src.length) {
      let body = '';
      let end = i + 1;
      if (src[end] === '{') {
        const close = src.indexOf('}', end);
        if (close > end) {
          body = src.slice(end + 1, close);
          end = close + 1;
        }
      } else {
        if ('-–−+'.includes(src[end])) end++;
        while (end < src.length && /[A-Za-z0-9]/.test(src[end])) end++;
        body = src.slice(i + 1, end);
      }
      if (body) {
        flush();
        out.push(ch === '_' ? <sub key={key++}>{script(body)}</sub> : <sup key={key++}>{script(body)}</sup>);
        i = end;
        continue;
      }
    }
    if (formula && /[A-Za-z]/.test(ch)) {
      let end = i;
      while (end < src.length && /[A-Za-z]/.test(src[end])) end++;
      const word = src.slice(i, end);
      if (unitsOnly || UPRIGHT_WORDS.has(word.toLowerCase()) || word.length >= 4) plain += word;
      else {
        flush();
        out.push(<i key={key++}>{word}</i>);
      }
      i = end;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

/**
 * LaTeX, as imported past-year questions carry it: `$$…$$` anywhere, and `$…$` only when it opens on
 * a non-space and closes on a non-space not followed by a digit (pandoc's rule), so "$5 and $10"
 * in a student's document stays text.
 */
const MATH = /\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]*?[^\s$\\])\$(?!\d)/g;

function mathHtml(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, { throwOnError: false, strict: false, output: 'html', displayMode: display, fleqn: true });
  } catch {
    return null;
  }
}

export default function Notation({ text, className, formula }: { text: string; className?: string; formula?: boolean }) {
  const src = String(text ?? '');
  if (!src.includes('$')) return <span className={className}>{renderNotation(src, { formula })}</span>;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of src.matchAll(MATH)) {
    // Imported solutions often break lines twice (\\ \\); one break per step reads better.
    const tex = (m[1] ?? m[2] ?? '').trim().replace(/(?:\\\\\s*){2,}/g, '\\\\ ');
    // A worked solution's multi-line block (aligned, \\ breaks) stands on its own lines, left-aligned;
    // `$$…$$` inside a sentence stays inline, as imported questions use it both ways.
    const display = m[1] !== undefined && /\\begin\{|\\\\/.test(tex);
    const html = tex ? mathHtml(tex, display) : null;
    if (!html || m.index === undefined) continue;
    if (m.index > last) parts.push(<Fragment key={key++}>{renderNotation(src.slice(last, m.index), { formula })}</Fragment>);
    // KaTeX escapes its input and, untrusted by default, renders no links or raw HTML.
    parts.push(<span key={key++} className={display ? 'block overflow-x-auto [&_.katex-display]:my-1' : undefined} dangerouslySetInnerHTML={{ __html: html }} />);
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push(<Fragment key={key++}>{renderNotation(src.slice(last), { formula })}</Fragment>);
  return <span className={className}>{parts}</span>;
}
