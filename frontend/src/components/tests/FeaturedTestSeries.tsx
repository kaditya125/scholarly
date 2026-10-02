import { useNavigate } from 'react-router-dom';
import { Users, Clock, Award, Zap, Flame, Gift, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

interface FeaturedTestSeriesProps {
  selectedExam: string;
}

const ANSWER_KEY_NOTE = "Answer keys verified against official key.";

const SSC_FREE_MOCKS = [
  {
    id: 'ssc_cgl_2024_tier1_shift1',
    title: 'SSC CGL 2024 Tier 1 — Official Shift 1 Paper',
    description: `100 authentic questions from the official September 2024 CGL Tier 1 Shift 1 exam. ${ANSWER_KEY_NOTE}`,
    questions: 100,
    marks: 200,
    duration: 60,
    difficulty: 'Medium',
    badge: 'OFFICIAL PYQ',
    badgeColor: 'amber',
    examId: 'SSC_CGL',
  },
  {
    id: 'ssc_cgl_2024_tier1_shift2',
    title: 'SSC CGL 2024 Tier 1 — Official Shift 2 Paper',
    description: `100 authentic questions from the official September 2024 CGL Tier 1 Shift 2 exam. ${ANSWER_KEY_NOTE}`,
    questions: 100,
    marks: 200,
    duration: 60,
    difficulty: 'Medium',
    badge: 'OFFICIAL PYQ',
    badgeColor: 'amber',
    examId: 'SSC_CGL',
  },
  {
    id: 'ssc_cgl_tier1_all_india_mock_1',
    title: 'SSC CGL Tier 1 — Mixed Mock 1',
    description: `Previous-year questions from 2021–2025 sittings in the Tier 1 section pattern. ${ANSWER_KEY_NOTE}`,
    questions: 100,
    marks: 200,
    duration: 60,
    difficulty: 'Medium',
    badge: 'MIXED MOCK',
    badgeColor: 'green',
    examId: 'SSC_CGL',
  },
];

const UPSC_FREE_MOCKS = [
  {
    id: 'upsc_prelims_polity_master_mock_1',
    title: 'UPSC CSE Prelims 2026: Indian Polity Master Mock',
    description: '50 high-yield multi-statement questions based on M. Laxmikanth (7th Ed.) & Constitution Bare Act. Covers Basic Structure, Writs, Union Executive & Federalism.',
    questions: 50,
    marks: 100,
    duration: 60,
    difficulty: 'Hard',
    badge: 'MULTI-STATEMENT',
    badgeColor: 'amber',
    examId: 'UPSC_CSE',
  },
];

const BPSC_FREE_MOCKS = [
  {
    id: 'bpsc_71st_cce_polity_state_mock_1',
    title: 'BPSC 71st CCE: Indian Polity & Bihar Governance Mock',
    description: '50 curated questions covering the Constitution of India, Bihar Panchayati Raj 50% reservation provisions, Patna High Court jurisdiction, and Central-State relations.',
    questions: 50,
    marks: 50,
    duration: 45,
    difficulty: 'Medium',
    badge: 'BIHAR SPECIAL',
    badgeColor: 'green',
    examId: 'BPSC',
  },
];

const SSC_IMD_FREE_MOCKS = [
  {
    id: 'ssc_imd_2022_cs_it_official',
    title: 'SSC IMD 2022 Official CBT Paper: Part-D (CS & IT)',
    description: `Authentic TCS/IMD CBT questions from Syllabus 14.3.4 Part-D (Algorithms, OS, CN, DBMS, TOC, Compilers, COA, Digital Logic, Discrete Math). ${ANSWER_KEY_NOTE}`,
    questions: 20,
    marks: 20,
    duration: 30,
    difficulty: 'Medium',
    badge: 'OFFICIAL PYQ',
    badgeColor: 'amber',
    examId: 'SSC_IMD_CS',
  },
  {
    id: 'ssc_imd_paper1_official_mock_1',
    title: 'SSC Scientific Assistant Paper-I: Non-Tech CBT Paper',
    description: `Authentic TCS/IMD questions covering 14.2.1 General Intelligence & Reasoning and 14.2.2 General Awareness & Science. ${ANSWER_KEY_NOTE}`,
    questions: 20,
    marks: 20,
    duration: 25,
    difficulty: 'Medium',
    badge: 'PAPER-I CBT',
    badgeColor: 'green',
    examId: 'SSC_IMD_PAPER1',
  },
  {
    id: 'gate_cs_1mark_conceptual_drill_1',
    title: 'GATE CS 1-Mark High-Frequency Conceptual Paper',
    description: `50 verified 1-mark conceptual MCQs (2000–2024), the exact core source repository tapped by TCS for government technical exams. ${ANSWER_KEY_NOTE}`,
    questions: 50,
    marks: 50,
    duration: 60,
    difficulty: 'Medium',
    badge: 'GATE 1-MARK PYQ',
    badgeColor: 'green',
    examId: 'GATE_CS',
  },
  {
    id: 'isro_nielit_drdo_cs_technical_mock_1',
    title: 'ISRO ICRB, NIELIT & DRDO CS Technical Mock',
    description: `42 authentic CS questions from ISRO Scientist-SC, NIELIT Scientist-B, and DRDO CEPTAM matching the exact numerical and formula depth of IMD Part-D. ${ANSWER_KEY_NOTE}`,
    questions: 42,
    marks: 42,
    duration: 50,
    difficulty: 'Medium-Hard',
    badge: 'ISRO / NIELIT PYQ',
    badgeColor: 'amber',
    examId: 'ISRO_CS',
  },
];

export function FeaturedTestSeries({ selectedExam }: FeaturedTestSeriesProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  const launch = useLaunchTest();

  const examName = selectedExam || 'General Aptitude';
  const isUpsc = selectedExam === 'UPSC' || selectedExam?.toLowerCase().includes('upsc');
  const isBpsc = selectedExam === 'BPSC' || selectedExam?.toLowerCase().includes('bpsc');
  const isSscImd = selectedExam === 'SSC IMD' || selectedExam?.toLowerCase().includes('imd') || selectedExam?.toLowerCase().includes('scientific assistant');
  const isSscCgl = (!selectedExam || selectedExam === 'SSC CGL' || selectedExam === 'SSC' || selectedExam.toLowerCase().includes('cgl')) && !isUpsc && !isBpsc && !isSscImd;

  const activeMocks = isUpsc ? UPSC_FREE_MOCKS : isBpsc ? BPSC_FREE_MOCKS : isSscImd ? SSC_IMD_FREE_MOCKS : isSscCgl ? SSC_FREE_MOCKS : null;

  const genericSeries = [
    {
      id: 'ts-1',
      title: `${examName} Full-Length AI Mock Series`,
      description: `Complete syllabus practice paper adhering to the latest 2026 exam pattern and marking scheme.`,
      totalTests: 15,
      enrollment: '124k',
      tags: ['Latest Pattern', 'AI Recommended'],
    },
    {
      id: 'ts-2',
      title: `${examName} High-Yield Concept Booster`,
      description: `Targeted sectional tests focusing on high-frequency questions, critical theorems, and time-saving shortcuts.`,
      totalTests: 20,
      enrollment: '89k',
      tags: ['Speed Booster'],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          {activeMocks ? `${selectedExam || 'Competitive Exam'} Free Mock Tests` : 'Featured Test Series'}
          {selectedExam && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200/80 dark:border-white/10">
              {selectedExam}
            </span>
          )}
        </h2>
      </div>

      {/* ── Promotional Banner ────────────────────────────────── */}
      {activeMocks && (
        <div className={cn(
          'rounded-xl p-3 border flex items-start gap-2.5',
          isDarkMode
            ? 'bg-orange-500/10 border-orange-500/25 text-orange-200'
            : 'bg-orange-50 border-orange-200 text-orange-900'
        )}>
          <Flame className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold leading-snug">
              {isUpsc 
                ? '🔥 UPSC Prelims 2026: Indian Polity Master Mock Unlocked 100% FREE!' 
                : isBpsc 
                ? '🔥 BPSC 71st CCE: Indian Polity & Bihar Governance Mock Unlocked 100% FREE!' 
                : isSscImd
                ? '🔥 SSC Scientific Assistant (IMD) CS & IT 2026 Mocks Unlocked 100% FREE!'
                : '🔥 SSC CGL Free Mocks Unlocked 100% FREE!'}
            </p>
            <p className={cn(
              'text-[12px] mt-0.5 leading-relaxed',
              isDarkMode ? 'text-orange-300' : 'text-orange-700'
            )}>
              {isUpsc 
                ? '50 Multi-Statement Questions · 60 Min · M. Laxmikanth (7th Ed.) Grounded · Official UPSC Pattern' 
                : isBpsc 
                ? '50 Questions · 45 Min · Bihar Panchayati Raj 50% Women Reservation & Patna High Court Special' 
                : isSscImd
                ? 'Part-D CS & IT (Syllabus 14.3.4) + Paper-I Non-Tech (14.2.1/14.2.2) · Grounded in Official 2022/2017 IMD, ISRO, NIELIT & GATE CS PYQs'
                : '100 Questions · 60 Minutes · 200 Marks · +2 / −0.5 · Official Pattern'}
            </p>
          </div>
        </div>
      )}

      {/* ── Active Curated Free Mock Cards (SSC / UPSC / BPSC) ─────── */}
      {activeMocks && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {activeMocks.map((mock) => (
            <div
              key={mock.id}
              className={cn(
                'p-4 rounded-xl border flex flex-col justify-between transition-colors relative overflow-hidden',
                isDarkMode
                  ? 'bg-white/[0.04] border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.06]'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              )}
            >
              {/* FREE badge ribbon */}
              <div className="absolute top-0 right-0">
                <div className="bg-emerald-500 text-white text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-bl-xl flex items-center gap-1">
                  <Gift className="w-2.5 h-2.5" />
                  FREE
                </div>
              </div>

              <div>
                {/* Sub-badge */}
                <span className={cn(
                  'inline-block text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mb-3',
                  mock.badgeColor === 'amber'
                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                    : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                )}>
                  {mock.badge}
                </span>

                <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-white mb-1 leading-snug pr-8">
                  {mock.title}
                </h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                  {mock.description}
                </p>
              </div>

              <div>
                {/* Stats row */}
                <div className={cn(
                  'flex items-center gap-3 text-[11px] font-medium pt-2.5 mb-3 border-t',
                  isDarkMode ? 'border-white/5 text-slate-400' : 'border-slate-100 text-slate-500'
                )}>
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-500" />
                    {mock.questions} Qs
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {mock.duration} Min
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-slate-400" />
                    {mock.marks} Marks
                  </span>
                </div>

                <button
                  onClick={() =>
                    navigate('/test', {
                      state: {
                        mockTestId: mock.id,
                        topic: mock.title,
                        count: mock.questions,
                        mode: 'exam',
                        examId: mock.examId || (isUpsc ? 'UPSC_CSE' : isBpsc ? 'BPSC' : isSscImd ? 'SSC_IMD_CS' : 'SSC_CGL'),
                      },
                    })
                  }
                  className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" /> Start Free Mock
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Generic Series Cards (non-active mock exams) ─────────────── */}
      {!activeMocks && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {genericSeries.map((series) => (
            <div
              key={series.id}
              className={cn(
                'p-4 rounded-xl border transition-colors flex flex-col justify-between group',
                isDarkMode
                  ? 'bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-white/[0.14] hover:bg-white/[0.06]'
                  : 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
              )}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {series.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          'text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md',
                          tag === 'AI Recommended'
                            ? 'bg-[#c8e558]/15 text-slate-900 dark:text-[#c8e558] border border-[#c8e558]/30'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10'
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white mb-1 leading-snug">
                  {series.title}
                </h3>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  {series.description}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-4 text-[11.5px] font-medium text-slate-500 dark:text-slate-400 mb-3 pt-2.5 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    {series.totalTests} Mock Papers
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {series.enrollment} Students
                  </div>
                </div>

                <button
                  onClick={() => launch({ topic: series.title, count: 15, mode: 'exam' })}
                  className="w-full h-8 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" /> Start AI Mock Paper
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
