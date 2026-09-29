import type { QuestionFigure as Figure } from '../../lib/api/quiz';

/**
 * Figures for code-generated non-verbal questions (mirror images, series, paper cutting, dice…).
 *
 * The SVG comes from the server's figure generators, and is shown through <img src="data:…">:
 * an SVG loaded as an image cannot run scripts or load anything, whatever it contains. The white
 * backing keeps black line drawings legible in dark mode.
 */
const toSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function QuestionFigures({ figure, size = 108 }: { figure?: Figure; size?: number }) {
  if (!figure?.questionSvgs?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5" aria-label="Question figures">
      {figure.questionSvgs.map((svg, i) => (
        <img
          key={i}
          src={toSrc(svg)}
          alt={`Question figure ${i + 1}`}
          width={size}
          height={size}
          className="rounded-lg bg-white border border-slate-200 dark:border-white/10 p-1"
          draggable={false}
        />
      ))}
    </div>
  );
}

/** An option's figure, or null when the option is plain text (e.g. dice and counting answers). */
export function OptionFigure({ figure, index, size = 84 }: { figure?: Figure; index: number; size?: number }) {
  const svg = figure?.optionSvgs?.[index];
  if (!svg) return null;
  return (
    <img
      src={toSrc(svg)}
      alt={`Option ${String.fromCharCode(65 + index)} figure`}
      width={size}
      height={size}
      className="rounded-md bg-white border border-slate-200 dark:border-white/10 p-0.5"
      draggable={false}
    />
  );
}
