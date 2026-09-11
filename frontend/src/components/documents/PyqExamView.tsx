import React, { useMemo } from 'react';
import { ArrowLeft, ScrollText, FileCheck2, KeyRound, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { PyqSource, paperVariant, documentTypeLabel } from '../../lib/api/pyq';
import { DocumentTile } from './DocumentTile';

/**
 * Every paper for one exam, grouped by year.
 *
 * A flat list of 173 papers put the exam name first on every tile, which pushed year, session and
 * shift — the only fields that differ — past the truncation point. Forty-two tiles reading
 * "Joint Entrance Examination (Mai…" are forty-two tiles a student cannot tell apart.
 *
 * Year is the heading here because it is how anyone actually looks for a paper ("JEE Main 2024"),
 * and the exam name is already established by the header above, so each tile can start at the
 * part that distinguishes it.
 */
interface Props {
  examName: string;
  papers: PyqSource[];
  onBack: () => void;
  onOpenPaper: (paper: PyqSource) => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/** Answer keys and solution sets are different things to a student; give them different glyphs. */
function glyphFor(t?: string) {
  if (t === 'SOLUTION_SET') return FileCheck2;
  if (t === 'ANSWER_KEY') return KeyRound;
  if (t === 'QUESTION_PAPER') return FileText;
  return ScrollText;
}

export function PyqExamView({ examName, papers, onBack, onOpenPaper }: Props) {
  const byYear = useMemo(() => {
    const map = new Map<number, PyqSource[]>();
    for (const p of papers) {
      const y = p.year || 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(p);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0]) // newest first — that is what people want
      .map(([year, list]) => ({
        year,
        list: list.sort((a, b) => paperVariant(a).localeCompare(paperVariant(b))),
      }));
  }, [papers]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        All question papers
      </button>

      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{examName}</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
          {papers.length} paper{papers.length === 1 ? '' : 's'} across {byYear.length} year
          {byYear.length === 1 ? '' : 's'}
        </p>
      </div>

      {byYear.map(({ year, list }) => (
        <section key={year} className="mb-8">
          <div className="flex items-baseline gap-2.5 mb-3.5">
            <h2 className="text-[13px] font-semibold text-slate-900 dark:text-white tabular-nums">
              {year || 'Undated'}
            </h2>
            <span className="text-[12px] text-slate-400 dark:text-slate-500 tabular-nums">{list.length}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {list.map((p, i) => (
              <DocumentTile
                key={p.sourceId}
                index={i}
                icon={glyphFor(p.documentType)}
                title={paperVariant(p)}
                subtitle={documentTypeLabel(p.documentType)}
                facts={[p.language?.toUpperCase(), p.authority]}
                status={
                  p.availabilityStatus === 'AVAILABLE'
                    ? { label: 'Available', tone: 'ready' }
                    : { label: 'Partial', tone: 'pending' }
                }
                onClick={() => onOpenPaper(p)}
              />
            ))}
          </div>
        </section>
      ))}
    </motion.div>
  );
}
