import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Sparkles, Target, LineChart } from 'lucide-react';

/**
 * Shared split-screen shell for /signin and /signup.
 *
 * Layout follows the reference: form column on the left, visual panel on the right,
 * brand mark pinned top-left of the form column. Both auth pages render through this so
 * they can never drift apart — previously each page carried its own full-page markup and
 * they had already diverged in heading sizes, button colours and spacing.
 *
 * Typography deliberately uses the app's own scale (Inter, the same weights the sidebar
 * and headers use) rather than the reference's face, so auth feels continuous with the
 * product rather than like a separate marketing page.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#0e0e0f]">
      {/* ── Form column ─────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[52%] flex flex-col px-6 sm:px-12 lg:px-16 xl:px-24 py-8">
        {/* The app's actual mark — same layered-stack SVG and amber the sidebar uses.
            An auth page inventing its own logo is how brands drift. */}
        <Link to="/" className="inline-flex items-center gap-2.5 w-fit group">
          <svg className="shrink-0 group-hover:scale-105 transition-transform" width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15" />
            <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
            Scholarly
          </span>
        </Link>

        <div className="flex-1 flex items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-[400px] mx-auto lg:mx-0 py-10"
          >
            <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-gray-400">{subtitle}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-7 text-center text-[13.5px] text-slate-500 dark:text-gray-400">
              {footer}
            </div>
          </motion.div>
        </div>

        <p className="text-[12px] text-slate-400 dark:text-gray-600">
          © {new Date().getFullYear()} Scholarly. All rights reserved.
        </p>
      </div>

      {/* ── Visual panel ────────────────────────────────────────────────────── */}
      {/* No photographic asset ships with the repo, so this is built from the brand
          gradient plus the product's actual value props rather than stock imagery. */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-gradient-to-br from-[#1c1c1f] via-[#141416] to-[#0c0c0d]">
        <div className="absolute -top-24 -right-16 w-[420px] h-[420px] rounded-full bg-[#c8e558]/[0.07] blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-20 w-[420px] h-[420px] rounded-full bg-white/[0.04] blur-3xl" aria-hidden />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-20 w-full">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="text-[34px] leading-[1.2] font-semibold tracking-[-0.025em] text-white max-w-[420px]">
              Your entire preparation, in one place.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/70 max-w-[400px]">
              An AI tutor that knows your syllabus, your exam and where you actually are.
            </p>

            <div className="mt-12 space-y-6 max-w-[400px]">
              {[
                { icon: Target, title: 'Built around your exam', body: 'NEET, JEE, UPSC, SSC, BPSC and more — syllabus-aligned from day one.' },
                { icon: Sparkles, title: 'Grounded, not guessed', body: 'Answers cite the curriculum they came from, so you can check the source.' },
                { icon: LineChart, title: 'Adapts as you go', body: 'Baseline assessment, weak-area tracking and a plan that adjusts.' },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                  className="flex gap-4"
                >
                  <span className="w-9 h-9 rounded-xl bg-[#c8e558]/10 ring-1 ring-[#c8e558]/20 flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4 text-[#c8e558]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium text-white">{f.title}</span>
                    <span className="block text-[13.5px] leading-relaxed text-white/60 mt-0.5">{f.body}</span>
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Labelled text input matching the reference's field treatment. */
export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-medium text-slate-700 dark:text-gray-300">{label}</span>
        {hint}
      </span>
      <input
        {...props}
        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-600 outline-none transition-colors focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60"
      />
    </label>
  );
}

/** Full-width primary action. */
export function SubmitButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      // Lime primary, matched to the reference template. Dark label rather than white
      // because the lime is light enough that white text fails contrast against it.
      className="w-full h-11 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] disabled:bg-[#c8e558]/50 disabled:cursor-not-allowed text-slate-900 text-[14px] font-semibold transition-colors flex items-center justify-center gap-2"
    >
      {loading && (
        <span className="w-4 h-4 rounded-full border-2 border-slate-900/25 border-t-slate-900 animate-spin" aria-hidden />
      )}
      {children}
    </button>
  );
}

export const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

/** Secondary OAuth button. */
export function ProviderButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full h-11 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.07] text-[14px] font-medium text-slate-700 dark:text-gray-200 transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Inline error, styled to sit inside the form rather than shout above it. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-[13px] text-red-700 dark:text-red-400"
    >
      {message}
    </div>
  );
}

/**
 * Switch link with the reference's hand-drawn arc beneath it. A straight
 * `text-decoration` underline was standing in for this and read as a plain link — the
 * curve is what gives the footer its personality, so it's drawn as a real SVG stroke.
 */
export function FlourishLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="relative inline-block font-semibold text-slate-900 dark:text-white hover:opacity-80 transition-opacity"
    >
      {children}
      <svg
        className="absolute -bottom-[7px] left-0 w-full overflow-visible pointer-events-none"
        height="9"
        viewBox="0 0 100 9"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M1.5 4.2C18 7.6 44 8.2 98.5 2.4"
          stroke="#c8e558"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </Link>
  );
}
