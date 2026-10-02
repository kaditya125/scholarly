import { BarChart3, CalendarDays, FileText, Layers, ListChecks } from 'lucide-react';
import { AgentArtifactKind } from '../../lib/api/agent';
import { cn } from '../../lib/utils';

/** How each kind of agent artifact is shown: its icon tile, a name, and a one-line size. */

const TILES: Record<AgentArtifactKind, { icon: typeof FileText; tile: string; name: string }> = {
  document: { icon: FileText, tile: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400', name: 'Document' },
  flashcards: { icon: Layers, tile: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400', name: 'Flashcards' },
  quiz: { icon: ListChecks, tile: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400', name: 'Quiz' },
  report: { icon: BarChart3, tile: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', name: 'Analysis' },
  studyplan: { icon: CalendarDays, tile: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400', name: 'Revision plan' },
};

export function ArtifactKindIcon({ kind, className }: { kind?: AgentArtifactKind; className?: string }) {
  const t = TILES[kind ?? 'document'] ?? TILES.document;
  const Icon = t.icon;
  return (
    <span className={cn('w-8 h-10 rounded-md flex items-center justify-center shrink-0', t.tile, className)}>
      <Icon className="w-4 h-4" strokeWidth={1.75} />
    </span>
  );
}

export const artifactKindName = (kind?: AgentArtifactKind) => (TILES[kind ?? 'document'] ?? TILES.document).name;

const count = (n: number | undefined, one: string, many: string) => (n ? ` · ${n} ${n === 1 ? one : many}` : '');

/** "PDF · 4 pages", "Quiz · 20 questions", "Analysis · 2 weak areas", "Revision plan · 7 days", "Study plan · 13 weeks". */
export function describeArtifact(a: {
  kind?: AgentArtifactKind;
  pageCount?: number;
  cardCount?: number;
  questionCount?: number;
  weakAreaCount?: number;
  dayCount?: number;
  weekCount?: number;
}): string {
  switch (a.kind) {
    case 'flashcards':
      return `Flashcards${count(a.cardCount, 'card', 'cards')}`;
    case 'quiz':
      return `Quiz${count(a.questionCount, 'question', 'questions')}`;
    case 'report':
      return a.weakAreaCount === 0 ? 'Analysis · no weak areas' : `Analysis${count(a.weakAreaCount, 'weak area', 'weak areas')}`;
    case 'studyplan':
      // An exam preparation plan runs in weeks; a revision plan in days.
      return a.weekCount ? `Study plan${count(a.weekCount, 'week', 'weeks')}` : `Revision plan${count(a.dayCount, 'day', 'days')}`;
    default:
      return `PDF${count(a.pageCount, 'page', 'pages')}`;
  }
}
