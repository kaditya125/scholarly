import React, { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  BookOpen,
  Calendar,
  Clock,
  Award,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  BarChart3,
  ShieldCheck,
  Globe,
  GraduationCap
} from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import NightSky from '../components/landing/NightSky';
import SiteFooter from '../components/landing/SiteFooter';
import { useSeo } from '../lib/useSeo';
import { SITE } from '../lib/siteConfig';
import { EXAM_CATALOG, getExamBySlug } from '../lib/examCatalog';
import { ExamLogo } from '../components/brand/ExamLogo';

const ACCENT = '#c8e558';
const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">
      {children}
    </p>
  );
}

export default function ExamLanding() {
  const { slug } = useParams<{ slug: string }>();
  const exam = slug ? getExamBySlug(slug) : undefined;
  const [activeTab, setActiveTab] = useState<'pattern' | 'syllabus' | 'eligibility' | 'ai-prep'>('pattern');
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});

  const toggleUnit = (key: string) => {
    setExpandedUnits((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveTab('pattern');
    setExpandedUnits({});
  }, [slug]);

  useEffect(() => {
    if (!exam) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${exam.fullName} (${exam.name}) Comprehensive Preparation — Sadhya`,
      description: exam.about,
      provider: {
        '@type': 'Organization',
        name: SITE.name,
        sameAs: SITE.url,
      },
      about: exam.fullName,
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [exam]);

  useSeo({
    title: exam ? `${exam.name} Exam Pattern, Syllabus & AI Preparation — ${exam.fullName} | ${SITE.name}` : `Exam Preparation | ${SITE.name}`,
    description: exam
      ? `Complete latest pattern, subject-wise syllabus, marking scheme, and AI tutor for ${exam.fullName} (${exam.name}). ${exam.about.slice(0, 110)}…`
      : `${SITE.name} covers preparation for ${EXAM_CATALOG.length}+ competitive exams and boards.`,
    url: exam ? `${SITE.url}/exams/${exam.slug}` : `${SITE.url}/exams`,
  });

  if (!exam) {
    return <Navigate to="/" replace />;
  }

  /*
   * The "Other exams covered" strip at the bottom of the page.
   *
   * This line was deleted by 0c75581e (the landing-animation refactor) while BOTH of its usages
   * were left in place, so every render threw `ReferenceError: others is not defined` before any
   * markup was produced — all 19 /exams/:slug pages served a blank white document in production.
   * A ReferenceError in the component body cannot be caught by anything downstream; there is no
   * partial render to fall back to.
   *
   * Declared AFTER the `!exam` guard on purpose: it reads `exam.slug`, and above the guard
   * `exam` is legitimately undefined for an unknown slug.
   */
  const others = EXAM_CATALOG.filter((e) => e.slug !== exam.slug).slice(0, 8);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />
      <NightSky />

      <main className="relative z-10 max-w-[1160px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-20 sm:pb-28">
        {/* ══ Breadcrumbs ═════════════════════════════════════════════════ */}
        <Reveal>
          <nav className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400 mb-6">
            <Link to="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link to="/#exams" className="hover:text-slate-900 dark:hover:text-white transition-colors">Exams</Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-white font-medium">{exam.name}</span>
          </nav>

          {/* ══ Hero Header ═════════════════════════════════════════════════ */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-10 shadow-xs">
            <div className="max-w-4xl">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] flex items-center justify-center p-2.5 shrink-0 shadow-2xs">
                  <ExamLogo slug={exam.slug} size={44} className="object-contain" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#c8e558]/20 dark:bg-[#c8e558]/10 text-slate-900 dark:text-[#c8e558] text-[12px] font-semibold mb-1">
                    <span>{exam.category.toUpperCase()}</span>
                  </div>
                  <h1 className="text-[28px] sm:text-[38px] lg:text-[42px] leading-[1.12] font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                    {exam.fullName}
                  </h1>
                  <p className="text-[14px] sm:text-[15px] font-medium text-slate-500 dark:text-gray-400">
                    Conducted by <span className="text-slate-800 dark:text-gray-200">{exam.conductedBy}</span>
                  </p>
                </div>
              </div>

              <p className="mt-5 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-600 dark:text-gray-300 max-w-3xl">
                {exam.about}
              </p>

              {/* Action Buttons */}
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Link
                    to="/signup"
                    state={{ intent: exam.name }}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14.5px] font-semibold text-slate-900 shadow-sm hover:shadow-md transition-shadow"
                    style={{ background: ACCENT }}
                  >
                    Start Preparing for {exam.name}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Link
                    to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + exam.fullName)}&slug=${exam.slug}`}
                    state={{ topic: `${exam.name}: ${exam.fullName}`, slug: exam.slug, count: 10, mode: 'exam' }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-5 py-2.5 text-[14.5px] font-semibold text-slate-800 dark:text-gray-200 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Take Practice Quiz
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>

          {/* ══ Quick Facts Bar ═════════════════════════════════════════════ */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Clock, label: "Duration", value: exam.duration },
              { icon: Award, label: "Total Marks", value: exam.totalMarks },
              { icon: Layers, label: "Mode", value: exam.mode },
              { icon: Calendar, label: "Frequency", value: exam.frequency },
            ].map((fact, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] shadow-2xs hover:shadow-xs transition-shadow cursor-default"
              >
                <div className="flex items-center gap-2 text-slate-400 dark:text-gray-500">
                  <fact.icon className="w-4 h-4" />
                  <span className="text-[12px] font-medium uppercase tracking-wider">{fact.label}</span>
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-slate-800 dark:text-gray-100">{fact.value}</p>
              </motion.div>
            ))}
          </div>
        </Reveal>

        {/* ══ Interactive Tabs Section ═════════════════════════════════════ */}
        <div className="mt-12">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-200 dark:border-white/10 gap-2 sm:gap-6 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('pattern')}
              className={`flex items-center gap-2 pb-3 px-1 text-[14.5px] font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'pattern'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Exam Pattern & Marking</span>
            </button>

            <button
              onClick={() => setActiveTab('syllabus')}
              className={`flex items-center gap-2 pb-3 px-1 text-[14.5px] font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'syllabus'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Subject-wise Syllabus</span>
            </button>

            <button
              onClick={() => setActiveTab('eligibility')}
              className={`flex items-center gap-2 pb-3 px-1 text-[14.5px] font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'eligibility'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Eligibility & Criteria</span>
            </button>

            <button
              onClick={() => setActiveTab('ai-prep')}
              className={`flex items-center gap-2 pb-3 px-1 text-[14.5px] font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'ai-prep'
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-lime-500" />
              <span>Sadhya AI Advantage</span>
            </button>
          </div>

          {/* ── TAB 1: Pattern & Marking ───────────────────────────────── */}
          {activeTab === 'pattern' && (
            <Reveal className="mt-8 space-y-8">
              <div>
                <Eyebrow>Marking Scheme</Eyebrow>
                <div className="mt-3 p-4 rounded-xl border border-amber-200/80 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 text-[14px] text-amber-950 dark:text-amber-200 flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Official Marking Rule:</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-amber-900 dark:text-amber-300">{exam.markingScheme}</p>
                  </div>
                </div>
              </div>

              <div>
                <Eyebrow>Stages & Section Breakdown</Eyebrow>
                <div className="mt-4 space-y-6">
                  {exam.stages.map((stage, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] overflow-hidden shadow-2xs">
                      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">{stage.name}</h3>
                          </div>
                          <p className="mt-1 text-[13.5px] text-slate-500 dark:text-gray-400">{stage.type}</p>
                        </div>
                        <div className="flex items-center gap-4 text-[13px] font-medium text-slate-600 dark:text-gray-300">
                          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-1 rounded-lg">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {stage.duration}
                          </span>
                          <span className="inline-flex items-center gap-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-1 rounded-lg">
                            <Award className="w-3.5 h-3.5 text-slate-400" />
                            {stage.totalMarks}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 sm:p-6">
                        <table className="w-full text-left text-[14px]">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-white/[0.07] text-slate-400 dark:text-gray-500 text-[12px] uppercase font-semibold">
                              <th className="pb-3 font-medium">Subject / Section</th>
                              <th className="pb-3 font-medium">Questions</th>
                              <th className="pb-3 font-medium text-right">Max Marks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                            {stage.sections.map((sec, sIdx) => (
                              <tr key={sIdx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                                <td className="py-3.5 pr-4 font-medium text-slate-800 dark:text-gray-200">
                                  {sec.name}
                                  {sec.timing && <span className="block text-[12px] font-normal text-slate-400">Time: {sec.timing}</span>}
                                </td>
                                <td className="py-3.5 pr-4 text-slate-600 dark:text-gray-400">{sec.questions}</td>
                                <td className="py-3.5 text-right font-semibold text-slate-800 dark:text-gray-200">{sec.marks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          )}

          {/* ── TAB 2: Subject-wise Syllabus ──────────────────────────── */}
          {activeTab === 'syllabus' && (
            <Reveal className="mt-8 space-y-8">
              <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-500/20 bg-blue-50/60 dark:bg-blue-500/5 text-[14px] text-blue-950 dark:text-blue-200 flex items-start gap-3">
                <BookOpen className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Official Syllabus & High-Yield Units:</p>
                  <p className="mt-0.5 text-[14px] text-blue-900 dark:text-blue-300">
                    Sadhya’s question generation, chapter notebooks, and diagnostic tests are strictly mapped to these official topics.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {exam.syllabus.map((subj, subIdx) => (
                  <motion.div
                    key={subIdx}
                    whileHover={{ y: -4 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] p-6 shadow-2xs hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.07]">
                      <h3 className="text-[19px] font-semibold text-slate-900 dark:text-white flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: ACCENT }} />
                        {subj.subject}
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] font-medium text-slate-400 dark:text-gray-500 hidden sm:inline">
                          {subj.chapters.length} Core Units
                        </span>
                        <Link
                          to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + subj.subject)}&slug=${exam.slug}`}
                          state={{ topic: `${exam.name}: ${subj.subject}`, slug: exam.slug, count: 5, mode: 'study' }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12.5px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-gray-200 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Practice Subject
                        </Link>
                      </div>
                    </div>

                    {/* High weightage tags */}
                    <div className="mt-4">
                      <p className="text-[12px] uppercase font-bold tracking-wider text-slate-400 dark:text-gray-500 mb-2.5">
                        High Weightage Focus Areas:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {subj.highWeightageTopics.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-medium border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-gray-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Chapter Accordions */}
                    <div className="mt-6 space-y-3">
                      {subj.chapters.map((ch, cIdx) => {
                        const unitKey = `${subIdx}-${cIdx}`;
                        const isExpanded = expandedUnits[unitKey] !== false; // default expanded
                        return (
                          <div key={cIdx} className="rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015] overflow-hidden">
                            <button
                              onClick={() => toggleUnit(unitKey)}
                              className="w-full px-4 py-3 text-left flex items-center justify-between gap-4 font-semibold text-[14.5px] text-slate-800 dark:text-gray-200 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors"
                            >
                              <span>{ch.unit}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                  {ch.topics.map((top, topIdx) => (
                                    <li key={topIdx} className="flex items-start gap-2 text-[13.5px] text-slate-600 dark:text-gray-400">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600 mt-2 shrink-0" />
                                      <span>{top}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </Reveal>
          )}

          {/* ── TAB 3: Eligibility & Requirements ─────────────────────── */}
          {activeTab === 'eligibility' && (
            <Reveal className="mt-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] shadow-2xs">
                  <div className="flex items-center gap-3 text-slate-900 dark:text-white mb-3">
                    <GraduationCap className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-[17px] font-semibold">Educational Qualification</h3>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                    {exam.eligibility.qualification}
                  </p>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] shadow-2xs">
                  <div className="flex items-center gap-3 text-slate-900 dark:text-white mb-3">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <h3 className="text-[17px] font-semibold">Age Limit & Relaxations</h3>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                    {exam.eligibility.ageLimit}
                  </p>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] shadow-2xs">
                  <div className="flex items-center gap-3 text-slate-900 dark:text-white mb-3">
                    <Layers className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-[17px] font-semibold">Number of Attempts</h3>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                    {exam.eligibility.attemptsLimit || 'No restriction as long as candidate fulfills the prescribed age and educational eligibility.'}
                  </p>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] shadow-2xs">
                  <div className="flex items-center gap-3 text-slate-900 dark:text-white mb-3">
                    <Globe className="w-5 h-5 text-cyan-500" />
                    <h3 className="text-[17px] font-semibold">Medium & Languages</h3>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                    {exam.eligibility.languageMedium}
                  </p>
                </div>
              </div>

              {/* Preparation Advice */}
              <div className="mt-8 p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white mb-4">
                  Expert Preparation Strategy for {exam.name}
                </h3>
                <ul className="space-y-3">
                  {exam.preparationTips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 mt-1 shrink-0" style={{ color: ACCENT }} strokeWidth={2.5} />
                      <span className="text-[14.5px] text-slate-700 dark:text-gray-300 leading-relaxed">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}

          {/* ── TAB 4: Sadhya AI Advantage ────────────────────────────── */}
          {activeTab === 'ai-prep' && (
            <Reveal className="mt-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {exam.howSadhyaHelps.map((point, idx) => (
                  <div key={idx} className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111113] shadow-2xs">
                    <div className="w-10 h-10 rounded-xl bg-lime-400/10 text-lime-600 dark:text-lime-400 flex items-center justify-center mb-4">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2">
                      Feature #{idx + 1}
                    </h4>
                    <p className="text-[14.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {point}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-900 text-white dark:bg-white/[0.04] mt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-[20px] font-semibold text-white">Test Your Readiness for {exam.name}</h3>
                  <p className="mt-1 text-[14.5px] text-slate-300 dark:text-gray-400">
                    Generate an instant diagnostic quiz calibrated to {exam.name}’s latest pattern with zero fluff.
                  </p>
                </div>
                <Link
                  to={`/test?topic=${encodeURIComponent(exam.name + ' - ' + exam.fullName)}&slug=${exam.slug}`}
                  state={{ topic: `${exam.name}: ${exam.fullName}`, slug: exam.slug, count: 10, mode: 'exam' }}
                  className="shrink-0 px-6 py-3 rounded-xl font-semibold text-slate-900 transition-transform hover:scale-[1.02] active:scale-98 shadow-xs cursor-pointer"
                  style={{ background: ACCENT }}
                >
                  Generate Practice Test
                </Link>
              </div>
            </Reveal>
          )}
        </div>

        {/* ══ Other Exams Covered ═════════════════════════════════════════ */}
        {others.length > 0 && (
          <Reveal delay={0.2} className="mt-20 pt-10 border-t border-slate-200 dark:border-white/10">
            <Eyebrow>Other competitive exams covered by Sadhya</Eyebrow>
            <div className="mt-4 flex flex-wrap gap-2">
              {others.map((e) => (
                <Link
                  key={e.slug}
                  to={`/exams/${e.slug}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/25 hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs group"
                >
                  <ExamLogo slug={e.slug} className="w-[18px] h-[18px] shrink-0 object-contain transition-transform group-hover:scale-110" size={18} />
                  <span>{e.name}</span>
                </Link>
              ))}
            </div>
          </Reveal>
        )}
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
