import {
  Atom, FlaskConical, Dna, Sigma, Globe2, Landmark, Scale,
  TrendingUp, Languages, BookOpen, Sprout, LucideIcon,
} from 'lucide-react';

/**
 * What a subject looks like.
 *
 * The icon stays: an atom for Physics and a globe for Geography are recognised faster than the
 * word, and they differ from each other for a reason.
 *
 * The per-subject colour went. It gave each subject its own ramp — Hindi fuchsia-to-pink,
 * Mathematics purple-to-fuchsia, History rose-to-red — which put a dozen competing hues on a page
 * whose accent is a single lime, and none of them carried information a student could act on. The
 * subject is already named on every surface that shows this icon.
 *
 * `tint` is the one treatment now: the app accent, at low opacity, identical for every subject.
 * Keeping the field rather than deleting it means call sites do not have to change, and a future
 * per-subject treatment has somewhere to live if one is ever earned.
 */
export interface SubjectMeta {
  icon: LucideIcon;
  /** Accent-tinted glyph container. The same for every subject, by design. */
  tint: string;
}

const TINT =
  'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] ' +
  'border border-[#8ba32b]/20 dark:border-[#c8e558]/20';

const DEFAULT_META: SubjectMeta = { icon: BookOpen, tint: TINT };

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Dna,
  Science: FlaskConical,
  Mathematics: Sigma,
  'Social Science': Globe2,
  History: Landmark,
  Geography: Globe2,
  'Political Science': Scale,
  Economics: TrendingUp,
  English: Languages,
  Hindi: Languages,
  EVS: Sprout,
};

export function getSubjectMeta(subject?: string): SubjectMeta {
  if (!subject) return DEFAULT_META;
  const icon = SUBJECT_ICONS[subject];
  return icon ? { icon, tint: TINT } : DEFAULT_META;
}
