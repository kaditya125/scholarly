import {
  Atom, FlaskConical, Dna, Sigma, Calculator, Globe2, Landmark, Scale,
  TrendingUp, Languages, BookOpen, Sprout, LucideIcon,
} from 'lucide-react';

export interface SubjectMeta {
  icon: LucideIcon;
  gradient: string; // tailwind gradient classes used behind the cover placeholder
  accent: string; // text/badge accent color classes
}

const DEFAULT_META: SubjectMeta = {
  icon: BookOpen,
  gradient: 'from-slate-400 to-slate-600',
  accent: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-500/15',
};

const SUBJECT_META: Record<string, SubjectMeta> = {
  Physics: { icon: Atom, gradient: 'from-blue-400 to-indigo-600', accent: 'text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/15' },
  Chemistry: { icon: FlaskConical, gradient: 'from-emerald-400 to-teal-600', accent: 'text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/15' },
  Biology: { icon: Dna, gradient: 'from-green-400 to-emerald-600', accent: 'text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-500/15' },
  Science: { icon: FlaskConical, gradient: 'from-cyan-400 to-blue-600', accent: 'text-cyan-600 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-500/15' },
  Mathematics: { icon: Sigma, gradient: 'from-purple-400 to-fuchsia-600', accent: 'text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/15' },
  'Social Science': { icon: Globe2, gradient: 'from-amber-400 to-orange-600', accent: 'text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15' },
  History: { icon: Landmark, gradient: 'from-rose-400 to-red-600', accent: 'text-rose-600 dark:text-rose-300 bg-rose-100 dark:bg-rose-500/15' },
  Geography: { icon: Globe2, gradient: 'from-teal-400 to-cyan-600', accent: 'text-teal-600 dark:text-teal-300 bg-teal-100 dark:bg-teal-500/15' },
  'Political Science': { icon: Scale, gradient: 'from-indigo-400 to-violet-600', accent: 'text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-500/15' },
  Economics: { icon: TrendingUp, gradient: 'from-orange-400 to-amber-600', accent: 'text-orange-600 dark:text-orange-300 bg-orange-100 dark:bg-orange-500/15' },
  English: { icon: Languages, gradient: 'from-sky-400 to-blue-600', accent: 'text-sky-600 dark:text-sky-300 bg-sky-100 dark:bg-sky-500/15' },
  Hindi: { icon: Languages, gradient: 'from-fuchsia-400 to-pink-600', accent: 'text-fuchsia-600 dark:text-fuchsia-300 bg-fuchsia-100 dark:bg-fuchsia-500/15' },
  EVS: { icon: Sprout, gradient: 'from-lime-400 to-green-600', accent: 'text-lime-700 dark:text-lime-300 bg-lime-100 dark:bg-lime-500/15' },
};

export function getSubjectMeta(subject?: string): SubjectMeta {
  if (!subject) return DEFAULT_META;
  return SUBJECT_META[subject] || DEFAULT_META;
}
