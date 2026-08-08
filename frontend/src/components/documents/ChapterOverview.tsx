import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, GraduationCap, ClipboardCheck, Sparkles, Clock3, Gauge, Target,
  Lightbulb, ListChecks, KeyRound, Sigma, Check, ScanLine,
} from 'lucide-react';
import { motion } from 'motion/react';
import { BookDetail, BookChapter, chapterLabel } from '../../lib/api/documents';
import { getSubjectMeta } from './subjectMeta';
import { cn } from '../../lib/utils';

interface ChapterOverviewProps {
  book: BookDetail;
  chapter: BookChapter;
  onBack: () => void;
}

const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: 'text-emerald-600 dark:text-emerald-300',
  Medium: 'text-amber-600 dark:text-amber-300',
  Hard: 'text-rose-600 dark:text-rose-300',
};

export function ChapterOverview({ book, chapter, onBack }: ChapterOverviewProps) {
  const navigate = useNavigate();
  const meta = getSubjectMeta(book.subject);
  const bookTitle = book.bookName || book.title;
  const title = chapterLabel(chapter);
  const chapterNo = (chapter.title.match(/Chapter\s+(\d+)/i) || [])[1];

  const learn = (prompt?: string) => {
    // Always scope the learning pane to this specific chapter (it's pre-selected there).
    const params = new URLSearchParams({ notebookId: book.notebookId, notebookTitle: bookTitle, chapter: chapter.sourceId });
    if (prompt) params.set('prompt', prompt);
    navigate(`/chat?${params.toString()}`);
  };

  const test = () => {
    navigate('/test', {
      state: { mode: 'exam', topic: title, notebookId: book.notebookId, notebookTitle: bookTitle },
    });
  };

  const stats = [
    { label: 'Difficulty', value: chapter.difficulty || '—', icon: Gauge, valueClass: chapter.difficulty ? DIFFICULTY_STYLE[chapter.difficulty] : '' },
    { label: 'Study time', value: chapter.estimatedStudyTimeMinutes ? `${chapter.estimatedStudyTimeMinutes} min` : '—', icon: Clock3 },
    { label: 'Key concepts', value: String(chapter.keyConcepts?.length || 0), icon: Target },
  ];

  // Prose-ish intro composed from the chapter's real objectives / facts.
  const intro = chapter.importantFacts?.[0]
    || chapter.learningObjectives?.[0]
    || `An overview of ${title} from ${bookTitle}.`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {bookTitle}
      </button>

      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] shadow-sm overflow-hidden">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4 min-w-0">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-md shrink-0', meta.gradient)}>
                <meta.icon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[24px] md:text-[28px] font-bold text-slate-900 dark:text-white leading-tight">{title}</h1>
                <p className="text-[13.5px] text-slate-500 dark:text-gray-400 mt-0.5">
                  {bookTitle}{book.className ? ` · ${book.className}` : ''}{chapterNo ? ` · Chapter ${chapterNo}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/read?${new URLSearchParams({ notebookId: book.notebookId, sourceId: chapter.sourceId, title, book: bookTitle, subject: book.subject }).toString()}`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40 text-slate-700 dark:text-gray-200 transition-colors"
              >
                <ScanLine className="w-4 h-4" /> Read &amp; Scan
              </button>
              <button
                onClick={() => learn(`Give me a clear, structured overview of "${title}" from ${bookTitle} — the main ideas, then we'll go deeper together.`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" /> Learn with AI
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-7">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-4">
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500 dark:text-gray-400 mb-1.5">
                  <s.icon className="w-3.5 h-3.5" /> {s.label}
                </div>
                <div className={cn('text-[20px] md:text-[22px] font-bold text-slate-900 dark:text-white', s.valueClass)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Intro line */}
          <p className="text-[14.5px] text-slate-600 dark:text-gray-300 leading-relaxed mb-7">{intro}</p>

          {/* What you'll learn */}
          {chapter.learningObjectives?.length > 0 && (
            <Section icon={Target} title="What you'll learn">
              <ul className="space-y-2">
                {chapter.learningObjectives.map((o, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] text-slate-600 dark:text-gray-300 leading-snug">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {o}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Key facts */}
          {chapter.importantFacts?.length > 0 && (
            <Section icon={Lightbulb} title="Key facts">
              <ul className="space-y-2">
                {chapter.importantFacts.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] text-slate-600 dark:text-gray-300 leading-snug">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Topics covered */}
          {(chapter.headings?.length > 0 || chapter.keywords?.length > 0) && (
            <Section icon={ListChecks} title="Topics covered">
              <div className="flex flex-wrap gap-2">
                {(chapter.headings?.length ? chapter.headings : chapter.keywords).slice(0, 14).map((t, i) => (
                  <span key={i} className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-white/10">
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Key terms */}
          {chapter.keyConcepts?.length > 0 && (
            <Section icon={KeyRound} title="Key terms">
              <div className="space-y-2.5">
                {chapter.keyConcepts.map((c, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-[13px] font-bold shrink-0 bg-gradient-to-br', meta.gradient)}>
                      {c.term.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-slate-800 dark:text-gray-100">{c.term}</div>
                      <div className="text-[12.5px] text-slate-500 dark:text-gray-400 leading-snug">{c.definition}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Formulae */}
          {chapter.formulae?.length > 0 && (
            <Section icon={Sigma} title="Formulae">
              <div className="flex flex-col gap-2">
                {chapter.formulae.map((f, i) => (
                  <code key={i} className="text-[13px] font-mono px-3 py-2 rounded-lg bg-slate-900 dark:bg-black/40 text-emerald-300 border border-slate-800 dark:border-white/10 overflow-x-auto">
                    {f}
                  </code>
                ))}
              </div>
            </Section>
          )}

          {/* Additional options */}
          <div className="pt-5 mt-2 border-t border-slate-100 dark:border-white/5">
            <h3 className="text-[13px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">Continue with</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ActionCard
                icon={GraduationCap} label="Learn this chapter" hint="Study step-by-step with the AI tutor"
                onClick={() => learn(`Let's study "${title}" from ${bookTitle} together, step by step. Start with a short overview, then teach me the key ideas.`)}
                primary
              />
              <ActionCard
                icon={ClipboardCheck} label="Take a test" hint="Practice questions from this chapter"
                onClick={test}
              />
              <ActionCard
                icon={Sparkles} label="Make flashcards" hint="Generate quick revision cards"
                onClick={() => learn(`Create 10 flashcards (question and answer) covering the key concepts of "${title}" from ${bookTitle}.`)}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-gray-100 mb-3">
        <Icon className="w-4 h-4 text-slate-400" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ActionCard({ icon: Icon, label, hint, onClick, primary }: { icon: any; label: string; hint: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-1 text-left p-4 rounded-2xl border transition-all hover:-translate-y-0.5',
        primary
          ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
          : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-100 hover:border-indigo-300 dark:hover:border-indigo-500/40'
      )}
    >
      <Icon className={cn('w-5 h-5 mb-1', primary ? 'text-white' : 'text-indigo-500')} />
      <span className="text-[13.5px] font-bold">{label}</span>
      <span className={cn('text-[11.5px] leading-snug', primary ? 'text-white/75' : 'text-slate-500 dark:text-gray-400')}>{hint}</span>
    </button>
  );
}
