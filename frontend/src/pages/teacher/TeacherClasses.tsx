import { Link } from 'react-router-dom';
import { Plus, GraduationCap, Users, IndianRupee, Lock, Loader2, ArrowRight } from 'lucide-react';
import { useMyClasses } from '../../hooks/api/useClasses';
import { useCapabilities } from '../../hooks/api/useCapabilities';
import type { ClassRecord, ClassStatus } from '../../lib/api/classes';
import { cn } from '../../lib/utils';

/**
 * /teach/classes — the teacher's own classes.
 *
 * The "New class" action is gated on the server-derived `createClass` capability rather than on
 * anything computed here. When it is absent the button is replaced by an explanation, because a
 * button that exists only to return 403 is worse than no button.
 *
 * Enrolment counts render as "—" rather than "0": enrolment does not exist until 3E, and a zero
 * would assert an empty roster rather than an absent feature.
 */

const STATUS_STYLE: Record<ClassStatus, string> = {
  draft: 'border-slate-300/70 bg-slate-100 text-slate-600 dark:border-white/12 dark:bg-white/[0.06] dark:text-gray-300',
  published: 'border-[#c8e558] bg-[#c8e558]/15 text-[#5f7516] dark:text-[#c8e558]',
  active: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  completed: 'border-slate-300/70 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400',
  archived: 'border-slate-200 bg-transparent text-slate-400 dark:border-white/10 dark:text-gray-500',
};

const STATUS_LABEL: Record<ClassStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

function ClassCard({ record }: { record: ClassRecord }) {
  const meta = [record.subject, record.grade, record.board].filter(Boolean).join(' · ');

  return (
    <Link
      to={`/teach/classes/${record.id}`}
      className="group block rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 hover:border-slate-300 dark:hover:border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15.5px] font-semibold tracking-[-0.015em] line-clamp-2">
          {record.title || <span className="text-slate-400 dark:text-gray-500">Untitled class</span>}
        </h3>
        <span className={cn('shrink-0 inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-semibold', STATUS_STYLE[record.status])}>
          {STATUS_LABEL[record.status]}
        </span>
      </div>

      {meta && <p className="mt-1.5 text-[13px] text-slate-500 dark:text-gray-400">{meta}</p>}

      <div className="mt-4 flex items-center gap-4 text-[12.5px] text-slate-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record.pricing.type === 'free' ? 'Free' : `₹${record.pricing.amountINR.toLocaleString('en-IN')}`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {/* Not 0 — enrolment does not exist yet. */}
          <span title="Enrolment arrives in a later release">—</span>
        </span>
        <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" aria-hidden />
      </div>
    </Link>
  );
}

export default function TeacherClasses() {
  const { data: classes, isLoading, isError, error } = useMyClasses();
  const { capabilities, teacherStatus } = useCapabilities();
  const canCreate = !!capabilities?.createClass;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Classes</h1>
          <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
            Create a class, build its syllabus, and publish it when it&rsquo;s ready.
          </p>
        </div>

        {canCreate ? (
          <Link
            to="/teach/classes/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8aa62f]"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            New class
          </Link>
        ) : (
          <div className="inline-flex items-start gap-2.5 max-w-xs rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] px-3.5 py-2.5">
            <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2} aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              Creating classes unlocks once your teaching account is approved
              {teacherStatus ? ` (currently ${teacherStatus.replace('_', ' ')})` : ''}.
            </p>
          </div>
        )}
      </header>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-10">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading your classes…
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-5">
          <p className="text-[14px] font-semibold text-red-800 dark:text-red-300">
            We couldn&rsquo;t load your classes
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-red-700 dark:text-red-400">
            {(error as any)?.response?.data?.error ?? 'Please try again in a moment.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && classes?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-10 text-center">
          <span className="inline-flex w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 items-center justify-center">
            <GraduationCap className="w-5 h-5 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em]">No classes yet</h2>
          <p className="mt-1.5 mx-auto max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            A class holds your syllabus, resources and tests. Start one as a draft — nothing is
            visible to anyone until you publish it.
          </p>
          {canCreate && (
            <Link
              to="/teach/classes/new"
              className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />
              Create your first class
            </Link>
          )}
        </div>
      )}

      {!!classes?.length && (
        <div className="grid sm:grid-cols-2 gap-3">
          {classes.map((c) => <ClassCard key={c.id} record={c} />)}
        </div>
      )}
    </div>
  );
}
