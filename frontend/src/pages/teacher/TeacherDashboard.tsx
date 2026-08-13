import { Link, useOutletContext } from 'react-router-dom';
import {
  BotMessageSquare, NotebookPen, FileText, Headphones, ArrowRight, Check, Clock,
  ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, Pencil,
} from 'lucide-react';
import { useCapabilities } from '../../hooks/api/useCapabilities';
import type { TeacherProfile } from '../../lib/api/teacher';
import type { CapabilityName } from '../../lib/api/capabilities';
import { cn } from '../../lib/utils';

/**
 * /teach — the teacher dashboard (Phase 3C).
 *
 * ── WHY THERE ARE NO METRIC TILES ─────────────────────────────────────────────────────
 * A dashboard of this kind normally opens with counters: students, classes, upcoming sessions,
 * revenue. Every one of those would currently read zero — not because the teacher has none, but
 * because the features do not exist. A tile reading "0 Students" asserts that student management
 * is present and empty, which is a more convincing lie than saying nothing. So the numbers are
 * absent until the systems behind them are real, and the space is spent telling the teacher what
 * they can actually do today.
 *
 * Everything rendered here comes from the server: the profile from GET /api/teacher/profile and
 * the permissions from GET /api/users/capabilities. Nothing is inferred client-side, so the page
 * cannot drift from what the backend would actually allow.
 */

interface TeacherOutletContext {
  profile: TeacherProfile | null;
  firstName: string;
}

/** Presentation for each verification state. Only `approved` is allowed to read as verified. */
const STATUS_VIEW: Record<
  string,
  { label: string; hint: string; icon: typeof ShieldCheck; tone: 'ok' | 'wait' | 'warn' }
> = {
  draft: {
    label: 'Profile incomplete',
    hint: 'Finish your teaching profile to put your account forward for review.',
    icon: ShieldQuestion,
    tone: 'wait',
  },
  pending: {
    label: 'Awaiting review',
    hint: 'Nothing is on hold for you — verification affects teaching-specific features, which are still being built.',
    icon: Clock,
    tone: 'wait',
  },
  under_review: {
    label: 'Under review',
    hint: 'Someone is looking at your profile now. You keep full access while that happens.',
    icon: ShieldQuestion,
    tone: 'wait',
  },
  approved: {
    label: 'Verified teacher',
    hint: 'Your teaching profile has been reviewed and approved.',
    icon: ShieldCheck,
    tone: 'ok',
  },
  suspended: {
    label: 'Suspended',
    hint: 'Your teaching capabilities are paused, and your profile is read-only. Contact support for details.',
    icon: ShieldAlert,
    tone: 'warn',
  },
  rejected: {
    label: 'Not verified',
    hint: 'Verification was not approved. You keep full access to Scholarly as a learner.',
    icon: ShieldAlert,
    tone: 'warn',
  },
};

const TONE: Record<'ok' | 'wait' | 'warn', string> = {
  ok: 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300',
  wait: 'border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] text-amber-700 dark:text-amber-300',
  warn: 'border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] text-red-700 dark:text-red-300',
};

/** Tools that genuinely work for a teacher account today. */
const TOOLS = [
  { to: '/chat', icon: BotMessageSquare, title: 'AI Assistant', desc: 'Draft explanations, examples and answers, with sources shown.' },
  { to: '/notebooks', icon: NotebookPen, title: 'Notebooks', desc: 'Upload your PDFs and notes, then ask across them.' },
  { to: '/tests', icon: FileText, title: 'Tests', desc: 'Generate practice sets and full-length papers.' },
  { to: '/podcasts', icon: Headphones, title: 'Podcasts', desc: 'Turn a topic into a two-voice audio explainer.' },
];

/**
 * How each capability is presented.
 *
 * `built` distinguishes the two very different reasons a capability can be unavailable: the
 * account has not been approved yet, versus the feature does not exist yet. Collapsing them
 * would tell an approved teacher that they may create classes, when no such thing can be created.
 */
const CAPABILITY_VIEW: { name: CapabilityName; label: string; built: boolean }[] = [
  { name: 'useAI', label: 'Use the AI assistant', built: true },
  { name: 'createPrivateContent', label: 'Create notebooks and private material', built: true },
  { name: 'editTeacherProfile', label: 'Edit your teaching profile', built: true },
  { name: 'connectPeers', label: 'Connect with other people on Scholarly', built: true },
  { name: 'publishPublicly', label: 'Publish material publicly', built: false },
  { name: 'createClass', label: 'Create classes and batches', built: false },
  { name: 'inviteStudents', label: 'Invite students', built: false },
  { name: 'acceptEnrollments', label: 'Accept enrolment requests', built: false },
  { name: 'earn', label: 'Earn from paid classes', built: false },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

export default function TeacherDashboard() {
  const { profile, firstName } = useOutletContext<TeacherOutletContext>();
  const { capabilities, teacherStatus, isLoading, isError } = useCapabilities();

  const status = STATUS_VIEW[teacherStatus ?? 'draft'] ?? STATUS_VIEW.draft;
  const StatusIcon = status.icon;

  const profileRows: [string, string][] = profile
    ? ([
        ['Subjects', profile.subjects?.join(' · ')],
        ['Classes', profile.classesTaught?.join(' · ')],
        ['Boards', profile.boards?.join(' · ')],
        ['Exams', profile.exams?.join(' · ')],
        ['Languages', profile.languages?.join(' · ')],
        ['Teaching style', profile.teachingStyle ?? ''],
        ['Experience', profile.yearsExperience != null ? `${profile.yearsExperience} years` : ''],
        ['Profile visibility', profile.visibility === 'public' ? 'Public' : 'Private'],
      ].filter(([, v]) => !!v) as [string, string][])
    : [];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-slate-500 dark:text-gray-400">
          Your teaching workspace. Preparation tools are live; class management is being built.
        </p>
      </header>

      {/* ── Verification ───────────────────────────────────────────────── */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={cn('inline-flex w-10 h-10 rounded-xl border items-center justify-center shrink-0', TONE[status.tone])}>
            <StatusIcon className="w-[18px] h-[18px]" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[15.5px] font-semibold tracking-[-0.015em]">{status.label}</h2>
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-label="Refreshing" />}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              {status.hint}
            </p>
            {isError && (
              <p className="mt-2 text-[13px] text-amber-700 dark:text-amber-400">
                We couldn&rsquo;t confirm your permissions just now, so some items below may be out of date.
              </p>
            )}
          </div>
          <Link
            to="/teacher/onboarding"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[13px] font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Edit
          </Link>
        </div>
      </Card>

      {/* ── Tools that work ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
          Available now
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {TOOLS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 hover:border-slate-300 dark:hover:border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <span className="inline-flex w-9 h-9 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
                <t.icon className="w-[17px] h-[17px] text-white dark:text-slate-900" strokeWidth={1.9} aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.015em] flex items-center gap-1.5">
                {t.title}
                <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" strokeWidth={2.25} aria-hidden />
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Profile summary ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            Your teaching profile
          </h2>
          <Card>
            {profileRows.length === 0 ? (
              <p className="p-5 text-[13.5px] text-slate-500 dark:text-gray-400">
                Nothing recorded yet.{' '}
                <Link to="/teacher/onboarding" className="font-medium text-slate-900 dark:text-white underline underline-offset-2">
                  Complete your profile
                </Link>
                .
              </p>
            ) : (
              <dl className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {profileRows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-4 px-5 py-3">
                    <dt className="w-[8.5rem] shrink-0 text-[12.5px] text-slate-500 dark:text-gray-400">{k}</dt>
                    <dd className="text-[13px] font-medium text-slate-800 dark:text-gray-100">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </section>

        {/* ── Capabilities, from the server ───────────────────────────── */}
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            What your account can do
          </h2>
          <Card className="p-5">
            <ul className="space-y-2.5">
              {CAPABILITY_VIEW.map((c) => {
                const granted = !!capabilities?.[c.name];
                return (
                  <li key={c.name} className="flex items-start gap-2.5">
                    {granted && c.built ? (
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-[#7d9a1f] dark:text-[#c8e558]" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span
                        className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-slate-300 dark:bg-gray-600"
                        aria-hidden
                      />
                    )}
                    <span className="flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-[13.5px]',
                          granted && c.built
                            ? 'text-slate-800 dark:text-gray-100'
                            : 'text-slate-500 dark:text-gray-400',
                        )}
                      >
                        {c.label}
                      </span>
                      {!c.built && (
                        <span className="ml-2 inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-semibold bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-gray-300 align-middle">
                          Not built yet
                        </span>
                      )}
                      {c.built && !granted && (
                        <span className="ml-2 inline-flex items-center h-[18px] px-1.5 rounded text-[10.5px] font-semibold bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 align-middle">
                          Unavailable
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.07] text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
              Read from the server, not decided in your browser. Items marked{' '}
              <span className="font-medium">Not built yet</span> will also require a completed
              verification once they exist.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
