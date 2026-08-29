import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  Award,
  Layers,
  Calendar,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  Globe,
  Sparkles,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  BarChart3,
} from 'lucide-react';
import { EXAM_CATALOG, ExamEntry } from '../../lib/examCatalog';
import { ExamLogo } from '../brand/ExamLogo';
import { cn } from '../../lib/utils';

const ACCENT = '#c8e558';

export default function ExamExplorerSection() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeSlug, setActiveSlug] = useState<string>('neet');
  const [activeTab, setActiveTab] = useState<'eligibility' | 'pattern' | 'syllabus'>('eligibility');

  const categories = useMemo(() => {
    const cats = Array.from(new Set(EXAM_CATALOG.map((e) => e.category)));
    return ['ALL', ...cats];
  }, []);

  const filteredExams = useMemo(() => {
    if (selectedCategory === 'ALL') return EXAM_CATALOG;
    return EXAM_CATALOG.filter((e) => e.category === selectedCategory);
  }, [selectedCategory]);

  const activeExam: ExamEntry = useMemo(() => {
    const found = EXAM_CATALOG.find((e) => e.slug === activeSlug);
    if (found) return found;
    return filteredExams[0] || EXAM_CATALOG[0];
  }, [activeSlug, filteredExams]);

  return (
    <section id="exams" className="scroll-mt-16 border-y border-slate-100 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.015] py-16 sm:py-24">
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400 mb-2">
            Exam Coverage & Live Intelligence
          </p>
          <h2 className="text-[28px] sm:text-[36px] font-bold tracking-[-0.03em] text-slate-950 dark:text-white leading-[1.18]">
            Syllabus, eligibility, and marking schemes for exams you actually sit.
          </h2>
          <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-slate-600 dark:text-gray-300">
            Select any target exam below to inspect official notification criteria, eligibility requirements, marking rules, and high-yield syllabus topics mapped directly to Sadhya AI.
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="mt-8 flex items-center gap-1.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 shrink-0 pr-2">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    const match = cat === 'ALL' ? EXAM_CATALOG[0] : EXAM_CATALOG.find((e) => e.category === cat);
                    if (match) setActiveSlug(match.slug);
                  }}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap',
                    isSelected
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                      : 'bg-white dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20'
                  )}
                >
                  {cat === 'ALL' ? 'All Exams' : cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Exam Chips List */}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          {filteredExams.map((e) => {
            const isActive = activeExam.slug === e.slug;
            return (
              <button
                key={e.slug}
                onClick={() => setActiveSlug(e.slug)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[13px] font-semibold transition-all shadow-2xs cursor-pointer',
                  isActive
                    ? 'border-[#8ba32b] dark:border-[#c8e558] bg-[#f7fbe6] dark:bg-[#c8e558]/10 text-slate-950 dark:text-white shadow-xs ring-1 ring-[#c8e558]'
                    : 'border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-gray-200 hover:border-slate-300 dark:hover:border-white/25 hover:text-slate-950 dark:hover:text-white'
                )}
              >
                <ExamLogo slug={e.slug} className="w-4 h-4 shrink-0 object-contain" size={16} />
                <span>{e.name}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Exam Intelligence Card */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeExam.slug}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111113] p-6 sm:p-8 shadow-xs"
            >
              {/* Top Banner: Logo, Name, Conducting Authority, Official Portal */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-slate-100 dark:border-white/[0.08]">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 flex items-center justify-center p-2.5 shrink-0 shadow-2xs">
                    <ExamLogo slug={activeExam.slug} className="w-full h-full object-contain" size={38} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[20px] sm:text-[24px] font-bold text-slate-950 dark:text-white leading-tight">
                        {activeExam.fullName}
                      </h3>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                        style={{ borderColor: `${ACCENT}60`, color: '#5c7a1a', background: `${ACCENT}18` }}
                      >
                        {activeExam.category}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] font-medium text-slate-500 dark:text-gray-400">
                      Conducted by <span className="font-semibold text-slate-800 dark:text-gray-200">{activeExam.conductedBy}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
                  {activeExam.officialSite && (
                    <a
                      href={activeExam.officialSite}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shadow-2xs"
                    >
                      <Globe className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Official Portal</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  )}
                  <Link
                    to={`/exams/${activeExam.slug}`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <span>Full Hub</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Duration</span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-gray-100 truncate">{activeExam.duration}</p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500">
                    <Award className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Total Marks</span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-gray-100 truncate">{activeExam.totalMarks}</p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500">
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Mode</span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-gray-100 truncate">{activeExam.mode}</p>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">Frequency</span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-bold text-slate-800 dark:text-gray-100 truncate">{activeExam.frequency}</p>
                </div>
              </div>

              {/* Sub-view Navigation Tabs */}
              <div className="mt-6 flex border-b border-slate-100 dark:border-white/[0.08] gap-4 sm:gap-6 overflow-x-auto pb-px">
                <button
                  onClick={() => setActiveTab('eligibility')}
                  className={cn(
                    'flex items-center gap-2 pb-2.5 text-[13.5px] font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
                    activeTab === 'eligibility'
                      ? 'border-slate-900 dark:border-[#c8e558] text-slate-900 dark:text-[#c8e558]'
                      : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Eligibility & Criteria</span>
                </button>
                <button
                  onClick={() => setActiveTab('pattern')}
                  className={cn(
                    'flex items-center gap-2 pb-2.5 text-[13.5px] font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
                    activeTab === 'pattern'
                      ? 'border-slate-900 dark:border-[#c8e558] text-slate-900 dark:text-[#c8e558]'
                      : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Pattern & Marking</span>
                </button>
                <button
                  onClick={() => setActiveTab('syllabus')}
                  className={cn(
                    'flex items-center gap-2 pb-2.5 text-[13.5px] font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
                    activeTab === 'syllabus'
                      ? 'border-slate-900 dark:border-[#c8e558] text-slate-900 dark:text-[#c8e558]'
                      : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                  )}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>High-Yield Syllabus</span>
                </button>
              </div>

              {/* Tab 1: Eligibility & Criteria */}
              {activeTab === 'eligibility' && (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-[14px] mb-1.5">
                      <GraduationCap className="w-4 h-4 text-indigo-500" />
                      <h4>Educational Qualification</h4>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {activeExam.eligibility.qualification}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-[14px] mb-1.5">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <h4>Age Limit & Relaxations</h4>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {activeExam.eligibility.ageLimit}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-[14px] mb-1.5">
                      <Layers className="w-4 h-4 text-emerald-500" />
                      <h4>Permitted Attempts</h4>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {activeExam.eligibility.attemptsLimit || 'No limit on attempts as long as age criteria is fulfilled.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-[14px] mb-1.5">
                      <Globe className="w-4 h-4 text-cyan-500" />
                      <h4>Medium & Languages</h4>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                      {activeExam.eligibility.languageMedium}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Pattern & Marking Scheme */}
              {activeTab === 'pattern' && (
                <div className="mt-5 space-y-4">
                  <div className="p-4 rounded-2xl border border-amber-200/70 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 text-[13.5px] flex items-start gap-3">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-950 dark:text-amber-200">Official Marking Scheme: </span>
                      <span className="text-amber-900 dark:text-amber-300">{activeExam.markingScheme}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeExam.stages.map((stg, sIdx) => (
                      <div key={sIdx} className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/[0.06] mb-3">
                          <h4 className="font-bold text-[14.5px] text-slate-900 dark:text-white">{stg.name}</h4>
                          <span className="text-[12px] font-semibold text-slate-500 dark:text-gray-400">{stg.totalMarks}</span>
                        </div>
                        <ul className="space-y-2">
                          {stg.sections.slice(0, 4).map((sec, secIdx) => (
                            <li key={secIdx} className="flex items-center justify-between text-[13px] text-slate-600 dark:text-gray-300">
                              <span className="truncate max-w-[65%]">{sec.name}</span>
                              <span className="font-medium text-slate-800 dark:text-gray-200 shrink-0">{sec.questions} · {sec.marks}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 3: High-Yield Syllabus */}
              {activeTab === 'syllabus' && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeExam.syllabus.map((subj, subIdx) => (
                      <div key={subIdx} className="p-4 rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.015]">
                        <h4 className="font-bold text-[14.5px] text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                          <span>{subj.subject}</span>
                          <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500">{subj.chapters.length} Units</span>
                        </h4>
                        <div className="mt-2.5">
                          <p className="text-[11px] uppercase font-bold text-slate-400 dark:text-gray-500 mb-1.5">High Weightage Topics:</p>
                          <div className="flex flex-wrap gap-1">
                            {subj.highWeightageTopics.slice(0, 4).map((topic, tIdx) => (
                              <span
                                key={tIdx}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-gray-300"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Action Footer */}
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400">
                  <CheckCircle2 className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                  <span>Sadhya AI question banks & tests are 100% calibrated for {activeExam.name}.</span>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Link
                    to={`/test?topic=${encodeURIComponent(activeExam.name + ' - ' + activeExam.fullName)}&slug=${activeExam.slug}`}
                    state={{ topic: `${activeExam.name}: ${activeExam.fullName}`, slug: activeExam.slug, count: 10, mode: 'exam' }}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13.5px] font-semibold border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-800 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Practice Test</span>
                  </Link>
                  <Link
                    to="/signup"
                    state={{ intent: activeExam.name }}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-[13.5px] font-semibold text-slate-900 shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    style={{ background: ACCENT }}
                  >
                    <span>Start Free AI Prep</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
