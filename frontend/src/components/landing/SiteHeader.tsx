import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown, Menu, X, Sun, Moon, ArrowRight, Sparkles } from 'lucide-react';
import { useTheme } from '../../lib/ThemeContext';
import { cn } from '../../lib/utils';
import { PRODUCT_GROUPS, TOP_LINKS } from './navData';
import { PRO_MONTHLY_INR } from '../../lib/siteConfig';

/**
 * The public site header, shared by the landing page, /pricing, /about and the legal pages.
 *
 * The "Product" item opens a mega panel on hover, with the two behaviours that separate a
 * good hover menu from an infuriating one:
 *
 *   · An open delay, so sweeping the cursor across the nav on the way somewhere else
 *     doesn't flash the panel open.
 *   · A close delay, so the diagonal path from "Product" down into the panel's far column
 *     doesn't pass through dead space and dismiss it mid-travel.
 *
 * Hover alone would leave the menu unreachable by keyboard and unusable on touch, so the
 * trigger is a real <button> that toggles on click, reports aria-expanded, closes on
 * Escape, and stays open while focus is anywhere inside the panel.
 */

const OPEN_DELAY = 90;
const CLOSE_DELAY = 180;

function Mark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15" />
      <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SiteHeader() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const reduced = useReducedMotion();

  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileProductOpen, setMobileProductOpen] = useState(false);

  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => setMegaOpen(true), OPEN_DELAY);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setMegaOpen(false), CLOSE_DELAY);
  };

  useEffect(() => clearTimers, []);

  // Navigating away must dismiss both menus, or the panel would still be hanging open
  // over the page the visitor just asked for.
  useEffect(() => {
    setMegaOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  // Escape closes; focus returns to the trigger so keyboard users aren't dropped at the
  // top of the document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (megaOpen) {
        setMegaOpen(false);
        wrapRef.current?.querySelector<HTMLButtonElement>('[data-mega-trigger]')?.focus();
      }
      setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [megaOpen]);

  // The mobile drawer is a full-height overlay; leaving the body scrollable behind it
  // lets the page drift under the visitor's finger.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 dark:border-white/[0.07] bg-white/85 dark:bg-[#0b0b0c]/85 backdrop-blur-xl">
      <div ref={wrapRef} className="relative">
        <nav className="max-w-[1160px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Scholarly home">
            <Mark />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">Scholarly</span>
          </Link>

          {/* ── Desktop nav ─────────────────────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-1 ml-4">
            <div
              className="relative"
              onMouseEnter={scheduleOpen}
              onMouseLeave={scheduleClose}
              onFocus={() => { clearTimers(); setMegaOpen(true); }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setMegaOpen(false);
              }}
            >
              <button
                data-mega-trigger
                type="button"
                aria-expanded={megaOpen}
                aria-haspopup="true"
                onClick={() => { clearTimers(); setMegaOpen((v) => !v); }}
                className={cn(
                  'flex items-center gap-1.5 h-9 px-3 rounded-lg text-[14px] font-medium transition-colors',
                  megaOpen
                    ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-white/[0.06]'
                    : 'text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white',
                )}
              >
                Product
                <ChevronDown
                  className={cn('w-3.5 h-3.5 transition-transform duration-200', megaOpen && 'rotate-180')}
                  strokeWidth={2.25}
                />
              </button>
            </div>

            {TOP_LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="h-9 px-3 flex items-center rounded-lg text-[14px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto">
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              {theme === 'dark'
                ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.9} />
                : <Moon className="w-[18px] h-[18px]" strokeWidth={1.9} />}
            </button>

            <Link
              to="/signin"
              className="hidden sm:inline-flex h-9 items-center px-3 rounded-lg text-[14px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>

            <Link
              to="/signup"
              className="inline-flex items-center h-9 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Get started
            </Link>

            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="lg:hidden w-9 h-9 -mr-1.5 rounded-lg flex items-center justify-center text-slate-500 dark:text-gray-400"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>

        {/* ── Mega panel ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {megaOpen && (
            <motion.div
              className="hidden lg:block absolute left-0 right-0 top-full px-5 sm:px-8 pt-2"
              initial={reduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={clearTimers}
              onMouseLeave={scheduleClose}
            >
              <div className="max-w-[1160px] mx-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] overflow-hidden">
                <div className="px-7 pt-6 pb-2 flex items-center gap-4">
                  <span className="text-[15px] font-semibold tracking-[-0.02em]">Product</span>
                  <Link
                    to="/signup"
                    className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    All features
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                  </Link>
                </div>

                <div className="grid grid-cols-4 gap-x-6 px-7 pb-7 pt-3">
                  {PRODUCT_GROUPS.map((g, gi) => (
                    <div
                      key={g.title}
                      className={cn(
                        'pl-6 first:pl-0',
                        gi > 0 && 'border-l border-slate-100 dark:border-white/[0.07]',
                      )}
                    >
                      <div className="flex items-center gap-2.5 mb-4">
                        <g.icon className="w-[17px] h-[17px] text-slate-900 dark:text-white" strokeWidth={1.9} />
                        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em]">{g.title}</h3>
                      </div>
                      <ul className="space-y-0.5">
                        {g.links.map((l) => (
                          <li key={l.label}>
                            <Link
                              to={l.href}
                              className="block -mx-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
                            >
                              <span className="block text-[13.5px] font-medium text-slate-700 dark:text-gray-200">
                                {l.label}
                              </span>
                              <span className="block mt-0.5 text-[12px] leading-snug text-slate-500 dark:text-gray-400">
                                {l.desc}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Subscription strip — the plan detail lives one click from every page. */}
                <div className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.02] px-7 py-4 flex items-center gap-4">
                  <Sparkles className="w-4 h-4 text-[#c8e558] shrink-0" strokeWidth={2} />
                  <p className="text-[13px] text-slate-600 dark:text-gray-300">
                    Everything above is included in{' '}
                    <span className="font-semibold text-slate-900 dark:text-white">Pro</span>
                    <span className="text-slate-500 dark:text-gray-400"> — ₹{PRO_MONTHLY_INR}/month, cancel anytime.</span>
                  </p>
                  <Link
                    to="/pricing"
                    className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    Compare plans
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="lg:hidden border-t border-slate-100 dark:border-white/[0.07] bg-white dark:bg-[#0b0b0c] max-h-[calc(100vh-4rem)] overflow-y-auto"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="px-5 py-3">
              <button
                type="button"
                onClick={() => setMobileProductOpen((v) => !v)}
                aria-expanded={mobileProductOpen}
                className="w-full flex items-center justify-between py-2.5 text-[15px] font-medium text-slate-800 dark:text-gray-100"
              >
                Product
                <ChevronDown className={cn('w-4 h-4 transition-transform', mobileProductOpen && 'rotate-180')} />
              </button>

              {mobileProductOpen && (
                <div className="pb-2 space-y-5">
                  {PRODUCT_GROUPS.map((g) => (
                    <div key={g.title}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <g.icon className="w-4 h-4 text-slate-500 dark:text-gray-400" strokeWidth={1.9} />
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.09em] text-slate-500 dark:text-gray-400">
                          {g.title}
                        </h3>
                      </div>
                      <ul className="pl-6 space-y-0.5">
                        {g.links.map((l) => (
                          <li key={l.label}>
                            <Link to={l.href} className="block py-1.5 text-[14.5px] text-slate-700 dark:text-gray-200">
                              {l.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-white/[0.07] mt-2 pt-2">
                {TOP_LINKS.map((l) => (
                  <Link key={l.href} to={l.href} className="block py-2.5 text-[15px] font-medium text-slate-800 dark:text-gray-100">
                    {l.label}
                  </Link>
                ))}
                <Link to="/signin" className="block py-2.5 text-[15px] font-medium text-slate-800 dark:text-gray-100 sm:hidden">
                  Sign in
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
