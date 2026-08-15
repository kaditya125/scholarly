import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Calendar,
  Clock,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  Layers,
  ChevronRight,
  Flame,
  Search,
  Sparkles,
  BotMessageSquare,
  FileCheck2,
  Building2,
  Filter,
  ArrowRight,
  Briefcase,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useProfile } from '../hooks/api/useProfile';
import {
  useExamsList,
  useExamDetail,
  useExamTimeline,
  useExamSyllabus,
  useExamNotification,
  useEvaluateEligibility,
} from '../hooks/api/useExams';
import { cn } from '../lib/utils';

export default function ExamCommandCenter() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useProfile();

  // Selected or Active Exam ID
  const defaultExamId = useMemo(() => {
    const raw = (profile?.targetExam || 'SSC CGL').toUpperCase();
    if (raw.includes('UPSC')) return 'UPSC_CSE';
    if (raw.includes('NEET')) return 'NEET_UG';
    if (raw.includes('JEE')) return 'JEE_MAIN';
    if (raw.includes('IBPS')) return 'IBPS_PO';
    if (raw.includes('BPSC')) return 'BPSC_CCE';
    return 'SSC_CGL';
  }, [profile?.targetExam]);

  const [activeExamId, setActiveExamId] = useState<string>(defaultExamId);
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);
  const [searchTopicQuery, setSearchTopicQuery] = useState<string>('');
  const [showExamSwitcher, setShowExamSwitcher] = useState(false);
  const [switcherCategory, setSwitcherCategory] = useState('ALL');
  const [switcherSearch, setSwitcherSearch] = useState('');

  // Eligibility Evaluation State
  const [dobInput, setDobInput] = useState('2001-05-15');
  const [categoryInput, setCategoryInput] = useState('UR');
  const [genderInput, setGenderInput] = useState('MALE');
  const [degreeCompleted, setDegreeCompleted] = useState(true);

  // Queries
  const { data: examsData } = useExamsList(switcherCategory);
  const { data: detailData, isLoading: isExamLoading } = useExamDetail(activeExamId);
  const { data: timelineData } = useExamTimeline(activeExamId);
  const { data: syllabusData } = useExamSyllabus(activeExamId);
  const { data: notifData } = useExamNotification(activeExamId);
  const evaluateMutation = useEvaluateEligibility();

  const activeExam = detailData?.exam;
  const timeline = timelineData?.timeline || [];
  const syllabus = syllabusData?.syllabus;
  const notification = notifData?.notification;
  const allExams = examsData?.exams || [];

  // Filtered Stages & Topics
  const activeStage = syllabus?.stages?.[selectedStageIndex] || syllabus?.stages?.[0];

  const filteredTopics = useMemo(() => {
    if (!activeStage) return [];
    const q = searchTopicQuery.trim().toLowerCase();
    const list: {
      paperName: string;
      subjectName: string;
      topic: any;
    }[] = [];

    for (const paper of activeStage.papers || []) {
      for (const subject of paper.subjects || []) {
        for (const topic of subject.topics || []) {
          if (
            !q ||
            topic.name.toLowerCase().includes(q) ||
            subject.name.toLowerCase().includes(q) ||
            (topic.subtopics && topic.subtopics.some((st: any) => st.name.toLowerCase().includes(q)))
          ) {
            list.push({ paperName: paper.name, subjectName: subject.name, topic });
          }
        }
      }
    }
    return list;
  }, [activeStage, searchTopicQuery]);

  // Urgency badge helper
  const getUrgencyBadge = (urgency: string, daysRemaining?: number) => {
    if (daysRemaining === undefined) {
      return <span className="text-xs text-slate-400 font-medium">Passed</span>;
    }
    switch (urgency) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
            <Flame className="w-3 h-3 text-rose-500" /> {daysRemaining} days left!
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 text-amber-500" /> {daysRemaining} days left
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Calendar className="w-3 h-3 text-indigo-500" /> {daysRemaining} days
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
            <Calendar className="w-3 h-3 text-slate-400" /> {daysRemaining} days
          </span>
        );
    }
  };

  const handleRunEligibilityCheck = () => {
    if (!activeExamId) return;
    evaluateMutation.mutate({
      examId: activeExamId,
      dob: dobInput,
      category: categoryInput,
      gender: genderInput,
      highestQualification: "Bachelor's Degree",
      hasDegreeCompleted: degreeCompleted,
    });
  };

  const handleSelectExamFromSwitcher = (exam: any) => {
    setActiveExamId(exam.examId);
    setShowExamSwitcher(false);
    updateProfile({ targetExam: exam.shortName });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0d12] text-slate-900 dark:text-gray-100 pb-16">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-900/20 via-indigo-900/5 to-transparent border-b border-slate-200 dark:border-white/5 pt-8 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Award className="w-3.5 h-3.5" /> Exam Command Center
                </span>
                <span className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                  Cycle: {activeExam?.currentCycle || '2026'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                {activeExam?.name || activeExamId}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-500" />
                Conducting Authority: <strong className="text-slate-700 dark:text-gray-200">{activeExam?.conductingAuthority || 'National Commission'}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowExamSwitcher(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 shadow-sm hover:bg-slate-50 dark:hover:bg-white/15 transition-all"
              >
                <Filter className="w-3.5 h-3.5 text-indigo-500" /> Switch Target Exam
              </button>
              <button
                onClick={() => navigate(`/chat?exam=${encodeURIComponent(activeExamId)}`)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:opacity-95 transition-all"
              >
                <BotMessageSquare className="w-3.5 h-3.5" /> Open Exam Copilot
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* Timeline & Important Milestone Countdowns */}
        <div className="bg-white dark:bg-[#13141c] rounded-2xl p-5 border border-slate-200/80 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" /> Official Milestones & Timeline Countdown
            </h3>
            <span className="text-xs text-slate-400">Grounded in Official Notifications</span>
          </div>

          {timeline.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">
              No active notification schedule registered yet for this cycle.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {timeline.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-4 rounded-xl border transition-all',
                    item.urgencyLevel === 'CRITICAL'
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                      : item.urgencyLevel === 'HIGH'
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                      : 'bg-slate-50/70 dark:bg-white/[0.03] border-slate-200/60 dark:border-white/5'
                  )}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 line-clamp-1">
                      {item.label}
                    </span>
                    {getUrgencyBadge(item.urgencyLevel, item.daysRemaining)}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> {item.targetDate}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2-Column Section: Verified Official Portals + Candidate Eligibility Evaluator */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Verified Official Portals */}
          <div className="bg-white dark:bg-[#13141c] rounded-2xl p-5 border border-slate-200/80 dark:border-white/5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Verified Official Portals
              </h3>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Whitelisted
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Every link is verified against the government portal registry for {activeExam?.shortName}.
            </p>

            <div className="space-y-2 text-xs">
              {activeExam?.verifiedOfficialUrls?.authorityHome && (
                <a
                  href={activeExam.verifiedOfficialUrls.authorityHome}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-200/60 dark:border-white/5 flex items-center justify-between group transition-all"
                >
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-gray-200 block">Authority Home Portal</span>
                    <span className="text-[11px] font-mono text-slate-400 truncate block max-w-[200px]">
                      {activeExam.verifiedOfficialUrls.authorityHome}
                    </span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </a>
              )}

              {activeExam?.verifiedOfficialUrls?.applicationPortal && (
                <a
                  href={activeExam.verifiedOfficialUrls.applicationPortal}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-200/60 dark:border-white/5 flex items-center justify-between group transition-all"
                >
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-gray-200 block">Online Application Link</span>
                    <span className="text-[11px] font-mono text-slate-400 truncate block max-w-[200px]">
                      {activeExam.verifiedOfficialUrls.applicationPortal}
                    </span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </a>
              )}

              {notification?.sourceUrl && (
                <a
                  href={notification.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 border border-slate-200/60 dark:border-white/5 flex items-center justify-between group transition-all"
                >
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-gray-200 block">Official Notice PDF</span>
                    <span className="text-[11px] font-mono text-slate-400 truncate block max-w-[200px]">
                      {notification.sourceUrl}
                    </span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </a>
              )}
            </div>

            {/* Vacancy Metric */}
            {notification?.vacancies && (
              <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500" /> Total Vacancies Advertised:
                  </span>
                  <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                    {notification.vacancies.total.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Column 2 & 3: Candidate Eligibility Evaluator */}
          <div className="lg:col-span-2 bg-white dark:bg-[#13141c] rounded-2xl p-5 border border-slate-200/80 dark:border-white/5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-indigo-500" /> Candidate Eligibility & Post Qualification Evaluator
              </h3>
              <span className="text-[11px] text-slate-400">Real-time Rule Engine</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1 text-slate-700 dark:text-gray-300">Date of Birth</label>
                <input
                  type="date"
                  value={dobInput}
                  onChange={(e) => setDobInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-slate-700 dark:text-gray-300">Category</label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs"
                >
                  {['UR', 'OBC', 'SC', 'ST', 'EWS', 'PwD', 'ESM'].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1 text-slate-700 dark:text-gray-300">Gender</label>
                <select
                  value={genderInput}
                  onChange={(e) => setGenderInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female (Fee Exempted)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleRunEligibilityCheck}
                  disabled={evaluateMutation.isPending}
                  className="w-full px-3 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-all"
                >
                  {evaluateMutation.isPending ? 'Evaluating...' : 'Check Eligibility'}
                </button>
              </div>
            </div>

            {/* Evaluation Results Banner */}
            {evaluateMutation.data?.evaluation && (
              <div
                className={cn(
                  'p-4 rounded-xl border text-xs space-y-2',
                  evaluateMutation.data.evaluation.isEligible
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                )}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    {evaluateMutation.data.evaluation.isEligible ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Candidate is Eligible!
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-500" /> Not Eligible
                      </>
                    )}
                  </span>
                  <span className="font-mono text-xs">
                    Age on Cutoff ({evaluateMutation.data.evaluation.cutoffDate}): <strong>{evaluateMutation.data.evaluation.calculatedAge} yrs</strong> (Max allowed: {evaluateMutation.data.evaluation.applicableMaxAge} yrs)
                  </span>
                </div>

                <div className="space-y-1 text-[11.5px]">
                  {evaluateMutation.data.evaluation.reasons.map((r: string, idx: number) => (
                    <p key={idx}>• {r}</p>
                  ))}
                  <p className="font-semibold pt-1">
                    Application Fee Payable: ₹{evaluateMutation.data.evaluation.feeAmount}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canonical Syllabus Progress & Topic Explorer */}
        <div className="bg-white dark:bg-[#13141c] rounded-2xl p-6 border border-slate-200/80 dark:border-white/5 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" /> Canonical Syllabus & Interactive Topic Tracker
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Version: {syllabus?.version || 'Active'} • Grounded in Official Notice SHA-256: {syllabus?.sourceDocumentHash?.slice(0, 10) || 'Verified'}...
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search syllabus topic..."
                value={searchTopicQuery}
                onChange={(e) => setSearchTopicQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
              />
            </div>
          </div>

          {/* Stage Tabs */}
          {syllabus?.stages && syllabus.stages.length > 0 && (
            <div className="flex gap-2 border-b border-slate-100 dark:border-white/5 pb-2 overflow-x-auto">
              {syllabus.stages.map((st, idx) => (
                <button
                  key={st.stageId}
                  onClick={() => setSelectedStageIndex(idx)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                    selectedStageIndex === idx
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                  )}
                >
                  {st.name}
                </button>
              ))}
            </div>
          )}

          {/* Topics Grid */}
          <div className="space-y-3">
            {filteredTopics.length === 0 ? (
              <div className="text-xs text-slate-400 py-8 text-center">
                No syllabus topics matching "{searchTopicQuery}".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredTopics.map(({ subjectName, topic }, idx) => (
                  <div
                    key={topic.topicId || idx}
                    className="p-4 rounded-xl border border-slate-200/80 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] hover:border-indigo-500/40 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                          {subjectName}
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Official Topic
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {topic.name}
                      </h4>

                      {topic.subtopics && topic.subtopics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {topic.subtopics.map((st: any) => (
                            <span
                              key={st.subtopicId}
                              className="text-[10.5px] px-2 py-0.5 bg-white dark:bg-white/5 rounded border border-slate-200/60 dark:border-white/5 text-slate-600 dark:text-gray-300"
                            >
                              {st.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-200/50 dark:border-white/5">
                      <button
                        onClick={() =>
                          navigate(
                            `/tests?exam=${encodeURIComponent(activeExamId)}&topic=${encodeURIComponent(
                              topic.name
                            )}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-gray-200 transition-colors flex items-center gap-1"
                      >
                        <BookOpen className="w-3 h-3" /> Practice Quiz
                      </button>
                      <button
                        onClick={() =>
                          navigate(
                            `/chat?exam=${encodeURIComponent(activeExamId)}&topic=${encodeURIComponent(
                              topic.name
                            )}`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1 shadow-sm"
                      >
                        <Sparkles className="w-3 h-3" /> Ask Copilot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Target Exam Switcher Modal */}
      <AnimatePresence>
        {showExamSwitcher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#161722] rounded-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 dark:border-white/10 shadow-2xl max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-500" /> Select Target Examination
                </h3>
                <button
                  onClick={() => setShowExamSwitcher(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Category Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
                {['ALL', 'SSC', 'UPSC', 'BANKING', 'MEDICAL', 'ENGINEERING', 'STATE_PSC', 'TEACHING'].map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setSwitcherCategory(cat)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg font-bold transition-all',
                        switcherCategory === cat
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                      )}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search examination name or authority..."
                  value={switcherSearch}
                  onChange={(e) => setSwitcherSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs"
                />
              </div>

              {/* Exams List */}
              <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                {allExams
                  .filter((e) =>
                    !switcherSearch ||
                    e.name.toLowerCase().includes(switcherSearch.toLowerCase()) ||
                    e.examId.toLowerCase().includes(switcherSearch.toLowerCase()) ||
                    e.conductingAuthority.toLowerCase().includes(switcherSearch.toLowerCase())
                  )
                  .map((e) => (
                    <div
                      key={e.examId}
                      onClick={() => handleSelectExamFromSwitcher(e)}
                      className={cn(
                        'p-3.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all',
                        activeExamId === e.examId
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                          : 'border-slate-200/80 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/5'
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                            {e.examId}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-gray-200">
                            {e.shortName}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{e.name}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
