import { Link } from 'react-router-dom';
import { Users, ArrowRight, Loader2, GraduationCap } from 'lucide-react';
import { useMyClasses } from '../../hooks/api/useClasses';

/**
 * /teach/students — a way into each class's roster.
 *
 * Deliberately a router rather than an aggregator. There is no "all my students" endpoint, and
 * building one client-side would mean fetching every roster on page load (an N+1 across classes)
 * to produce a list whose only real use is picking a class anyway. When a cross-class view is
 * genuinely needed it should be one server query, not many.
 *
 * Enrolment counts come from the class's own `counts.enrolled`, which the server maintains
 * transactionally as edges become active — so it is a real number, not a guess.
 */
export default function TeacherStudents() {
  const { data: classes, isLoading } = useMyClasses();
  const withStudents = (classes ?? []).filter((c) => c.status !== 'draft');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Students</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Students belong to a class, not to your account. Open a class to invite people and manage
          who is in it.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      )}

      {!isLoading && withStudents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-10 text-center">
          <span className="inline-flex w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 items-center justify-center">
            <GraduationCap className="w-5 h-5 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em]">No published classes yet</h2>
          <p className="mt-1.5 mx-auto max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            You can only invite students to a class once it&rsquo;s published. Drafts stay private
            to you.
          </p>
          <Link
            to="/teach/classes"
            className="mt-5 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold"
          >
            Go to Classes
          </Link>
        </div>
      )}

      {withStudents.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {withStudents.map((c) => (
            <Link
              key={c.id}
              to={`/teach/classes/${c.id}/students`}
              className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 hover:border-slate-300 dark:hover:border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <h2 className="text-[15.5px] font-semibold tracking-[-0.015em] line-clamp-2">
                {c.title || 'Untitled class'}
              </h2>
              <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400">
                <Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                {c.counts?.enrolled ?? 0} enrolled
                <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
