import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  Search,
  Plus,
  Globe,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers,
  BookOpen,
  ChevronRight,
  Building2,
  RefreshCw,
} from 'lucide-react';
import {
  useExams,
  useExamDetail,
  useExamCycles,
  useExamSyllabus,
  useExamSources,
  useCreateExam,
  useAddOfficialSource,
  useExtractSyllabus,
  useDiffSyllabus,
  useCreateAndPublishSyllabus,
} from '../../lib/api/hooks';
import { PageHeader, MetricCard, Panel, Button, Badge, cardItem, staggerContainer } from '../ui';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { cn } from '../../lib/utils';
import { GitCompare, Sparkles, UploadCloud } from 'lucide-react';

export function ExamRegistry() {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'OVERVIEW' | 'CYCLES' | 'SOURCES' | 'SYLLABUS'>('OVERVIEW');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);

  // New Exam Form State
  const [newExamId, setNewExamId] = useState('');
  const [newName, setNewName] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [newAuthority, setNewAuthority] = useState('');
  const [newCategory, setNewCategory] = useState('SSC');
  const [newDomains, setNewDomains] = useState('');
  const [newHomeUrl, setNewHomeUrl] = useState('');

  // New Source Form State
  const [newSourceType, setNewSourceType] = useState('APPLICATION');
  const [newSourceUrl, setNewSourceUrl] = useState('');

  const { data: examsData, isLoading, error, refetch, isFetching } = useExams(
    selectedCategory === 'ALL' ? undefined : selectedCategory
  );
  const exams = examsData?.exams || [];

  const { data: detailData } = useExamDetail(activeExamId);
  const { data: cyclesData } = useExamCycles(activeExamId);
  const { data: syllabusData } = useExamSyllabus(activeExamId);
  const { data: sourcesData, refetch: refetchSources } = useExamSources(activeExamId);

  const activeExam = detailData?.exam;
  const cycles = cyclesData?.cycles || [];
  const syllabus = syllabusData?.syllabus;
  const sources = sourcesData?.sources || [];

  const createExamMutation = useCreateExam();
  const addSourceMutation = useAddOfficialSource();

  // Syllabus Ingestion & Diff Form State (Phase 2)
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [rawSyllabusText, setRawSyllabusText] = useState('');
  const [syllabusVersionInput, setSyllabusVersionInput] = useState('2026-v2');
  const [syllabusCycleInput, setSyllabusCycleInput] = useState('2026');
  const [syllabusSourceUrlInput, setSyllabusSourceUrlInput] = useState('');
  const [extractedStages, setExtractedStages] = useState<any[] | null>(null);
  const [extractedHash, setExtractedHash] = useState<string>('');
  const [diffReport, setDiffReport] = useState<any | null>(null);

  const extractSyllabusMutation = useExtractSyllabus();
  const diffSyllabusMutation = useDiffSyllabus();
  const publishSyllabusMutation = useCreateAndPublishSyllabus();

  const handleExtractSyllabus = async () => {
    if (!activeExamId || !rawSyllabusText.trim()) return;
    const res = await extractSyllabusMutation.mutateAsync({
      examId: activeExamId,
      rawText: rawSyllabusText,
    });
    setExtractedStages(res.stages);
    setExtractedHash(res.contentHash);

    // If current syllabus exists, automatically compute diff
    if (syllabus?.syllabusId) {
      try {
        const diffRes = await diffSyllabusMutation.mutateAsync({
          examId: activeExamId,
          baseSyllabusId: syllabus.syllabusId,
          targetSyllabus: {
            examId: activeExamId,
            version: syllabusVersionInput,
            stages: res.stages,
          },
        });
        setDiffReport(diffRes.diff);
      } catch (e) {
        console.warn('Could not compute diff', e);
      }
    }
  };

  const handlePublishExtractedSyllabus = async () => {
    if (!activeExamId || !extractedStages || !syllabusVersionInput) return;
    await publishSyllabusMutation.mutateAsync({
      examId: activeExamId,
      cycleId: syllabusCycleInput,
      payload: {
        version: syllabusVersionInput,
        sourceDocumentUrl:
          syllabusSourceUrlInput ||
          activeExam?.verifiedOfficialUrls?.authorityHome ||
          'https://official-source',
        sourceDocumentHash: extractedHash,
        stages: extractedStages,
      },
    });
    setShowSyllabusModal(false);
    setRawSyllabusText('');
    setExtractedStages(null);
    setDiffReport(null);
  };

  const filteredExams = useMemo(() => {
    return exams.filter((e: any) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.examId.toLowerCase().includes(q) ||
        e.shortName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.conductingAuthority.toLowerCase().includes(q) ||
        (e.aliases && e.aliases.some((a: string) => a.toLowerCase().includes(q)))
      );
    });
  }, [exams, searchQuery]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamId || !newName || !newShortName || !newAuthority) return;

    await createExamMutation.mutateAsync({
      examId: newExamId,
      name: newName,
      shortName: newShortName,
      conductingAuthority: newAuthority,
      category: newCategory,
      officialDomains: newDomains.split(',').map((d) => d.trim()).filter(Boolean),
      verifiedOfficialUrls: {
        authorityHome: newHomeUrl,
      },
    });

    setShowCreateModal(false);
    setNewExamId('');
    setNewName('');
    setNewShortName('');
    setNewAuthority('');
    setNewDomains('');
    setNewHomeUrl('');
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExamId || !newSourceUrl) return;

    await addSourceMutation.mutateAsync({
      examId: activeExamId,
      payload: {
        sourceType: newSourceType,
        url: newSourceUrl,
      },
    });

    setShowAddSourceModal(false);
    setNewSourceUrl('');
    refetchSources();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Exam Master Registry"
        subtitle="Canonical registry of Indian competitive examinations, verified official domains, cycles, and versioned syllabi."
        icon={Award}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Register Exam
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard label="Registered Exams" value={exams.length} icon={Award} accent="indigo" />
        <MetricCard
          label="Categories"
          value={new Set(exams.map((e: any) => e.category)).size}
          icon={Layers}
          accent="sky"
        />
        <MetricCard
          label="Active Syllabi"
          value={exams.filter((e: any) => e.activeSyllabusVersionId).length}
          icon={BookOpen}
          accent="emerald"
        />
        <MetricCard
          label="Verified Authorities"
          value={new Set(exams.map((e: any) => e.conductingAuthority)).size}
          icon={Building2}
          accent="violet"
        />
      </motion.div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-[#1a1a1a] p-4 rounded-2xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {['ALL', 'SSC', 'UPSC', 'BANKING', 'MEDICAL', 'ENGINEERING', 'STATE_PSC', 'TEACHING'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exam name, ID, authority..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Main Content: Exam Cards Grid & Detail Panel */}
      {isLoading ? (
        <LoadingState label="Loading exam registry..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : filteredExams.length === 0 ? (
        <Panel>
          <EmptyState message="No examinations found matching your filter criteria." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Exam Cards Column */}
          <div className="lg:col-span-1 space-y-3">
            {filteredExams.map((exam: any) => {
              const isSelected = activeExamId === exam.examId;
              return (
                <motion.div
                  key={exam.examId}
                  variants={cardItem}
                  onClick={() => setActiveExamId(exam.examId)}
                  className={cn(
                    'p-4 rounded-2xl border transition-all cursor-pointer text-left',
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-500/10 shadow-sm ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] hover:border-slate-300 dark:hover:border-white/10'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-md">
                          {exam.examId}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500">
                          {exam.category}
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-1">
                        {exam.shortName}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{exam.conductingAuthority}</p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'w-4 h-4 text-slate-400 shrink-0 transition-transform mt-1',
                        isSelected && 'text-indigo-600 translate-x-1'
                      )}
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Cycle: {exam.currentCycle || '2026'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" /> {exam.officialDomains?.length || 0} Domains
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Exam Detail Column */}
          <div className="lg:col-span-2">
            {!activeExam ? (
              <Panel>
                <div className="p-12 text-center text-slate-400">
                  <Award className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="font-medium text-sm">Select an examination from the left rail to inspect details</p>
                  <p className="text-xs mt-1 text-slate-500">
                    View verified official links, active cycles, official source whitelist, and canonical syllabus hierarchy.
                  </p>
                </div>
              </Panel>
            ) : (
              <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-6">
                {/* Header Profile */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-5 border-b border-slate-100 dark:border-white/5">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-0.5 rounded-lg">
                        {activeExam.examId}
                      </span>
                      <Badge tone="neutral">{activeExam.category}</Badge>
                      <Badge tone={activeExam.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {activeExam.status}
                      </Badge>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{activeExam.name}</h2>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" /> {activeExam.conductingAuthority}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeExam.verifiedOfficialUrls?.authorityHome && (
                      <a
                        href={activeExam.verifiedOfficialUrls.authorityHome}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-xl hover:bg-indigo-100 transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5" /> Official Website <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                  {(['OVERVIEW', 'CYCLES', 'SOURCES', 'SYLLABUS'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                        detailTab === tab
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-gray-200'
                      )}
                    >
                      {tab === 'OVERVIEW' && 'Overview'}
                      {tab === 'CYCLES' && `Cycles (${cycles.length})`}
                      {tab === 'SOURCES' && `Official Sources (${sources.length})`}
                      {tab === 'SYLLABUS' && 'Canonical Syllabus'}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Overview */}
                {detailTab === 'OVERVIEW' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Description & Scope</h4>
                      <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
                        {activeExam.description || 'No description provided.'}
                      </p>
                    </div>

                    {activeExam.eligibilitySummary && (
                      <div className="p-3.5 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/5 text-xs text-slate-700 dark:text-gray-300">
                        <span className="font-semibold block mb-1">Eligibility Criteria:</span>
                        {activeExam.eligibilitySummary}
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Whitelisted Official Domains
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {activeExam.officialDomains?.map((domain: string) => (
                          <span
                            key={domain}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-medium rounded-lg border border-emerald-200/60 dark:border-emerald-800/40"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> {domain}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Supported Aliases</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {activeExam.aliases?.map((alias: string) => (
                          <span
                            key={alias}
                            className="px-2.5 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 text-xs rounded-md"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Cycles */}
                {detailTab === 'CYCLES' && (
                  <div className="space-y-3">
                    {cycles.length === 0 ? (
                      <EmptyState message="No examination cycles recorded yet." />
                    ) : (
                      cycles.map((c: any) => (
                        <div
                          key={c.cycleId}
                          className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">{c.label}</span>
                              <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>{c.status}</Badge>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                              <span>Year: {c.year}</span>
                              {c.activeSyllabusVersionId && (
                                <span>• Syllabus: {c.activeSyllabusVersionId}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: Official Sources */}
                {detailTab === 'SOURCES' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Registered & Verified Official URLs
                      </h4>
                      <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddSourceModal(true)}>
                        Register Source
                      </Button>
                    </div>

                    {sources.length === 0 ? (
                      <EmptyState message="No official sources registered yet." />
                    ) : (
                      <div className="space-y-2.5">
                        {sources.map((s: any) => (
                          <div
                            key={s.sourceId}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                                  {s.sourceType}
                                </span>
                                {s.verified ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified Domain
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                                    <XCircle className="w-3.5 h-3.5" /> Unverified
                                  </span>
                                )}
                              </div>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono text-slate-700 dark:text-gray-300 hover:text-indigo-500 truncate block"
                              >
                                {s.url}
                              </a>
                              {s.notes && <p className="text-[11px] text-slate-400 mt-1">{s.notes}</p>}
                            </div>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-slate-400 hover:text-indigo-500"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Canonical Syllabus Tree */}
                {detailTab === 'SYLLABUS' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Canonical Syllabus Hierarchy
                      </h4>
                      <Button
                        size="sm"
                        icon={<UploadCloud className="w-3.5 h-3.5" />}
                        onClick={() => setShowSyllabusModal(true)}
                      >
                        Ingest / Update Syllabus
                      </Button>
                    </div>

                    {!syllabus ? (
                      <EmptyState message="No canonical syllabus version published for current cycle." />
                    ) : (
                      <div>
                        <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200/50 dark:border-indigo-800/30 mb-4 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-indigo-900 dark:text-indigo-300">
                              Active Version: {syllabus.version} ({syllabus.status})
                            </span>
                            <span className="text-indigo-700/80 dark:text-indigo-400 block mt-0.5">
                              Extracted from: {syllabus.sourceDocumentUrl}
                            </span>
                          </div>
                          <Badge tone="success">CURRENT</Badge>
                        </div>

                        {/* Hierarchical Stage -> Paper -> Subject -> Topic Tree */}
                        <div className="space-y-4">
                          {syllabus.stages?.map((stage: any) => (
                            <div key={stage.stageId} className="border border-slate-200 dark:border-white/10 rounded-xl p-4 space-y-3">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-500" /> {stage.name}
                              </h4>

                              {stage.papers?.map((paper: any) => (
                                <div key={paper.paperId} className="pl-4 space-y-2 border-l-2 border-slate-100 dark:border-white/5">
                                  <h5 className="font-semibold text-xs text-slate-700 dark:text-gray-300">
                                    {paper.name}
                                  </h5>

                                  {paper.subjects?.map((sub: any) => (
                                    <div key={sub.subjectId} className="pl-3 space-y-1.5">
                                      <div className="text-xs font-medium text-slate-800 dark:text-gray-200 flex items-center gap-2">
                                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                                        {sub.name}
                                        {sub.marks && <span className="text-[10px] text-slate-400">({sub.marks} Marks)</span>}
                                      </div>

                                      <div className="pl-5 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                        {sub.topics?.map((top: any) => (
                                          <div
                                            key={top.topicId}
                                            className="text-[11.5px] p-2 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-100 dark:border-white/5"
                                          >
                                            <span className="font-semibold text-slate-800 dark:text-gray-200 block">
                                              {top.name}
                                            </span>
                                            {top.subtopics?.length > 0 && (
                                              <span className="text-[10.5px] text-slate-500 block mt-0.5">
                                                {top.subtopics.map((st: any) => st.name).join(', ')}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Register Exam */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-white/10 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Register Canonical Examination</h3>
              <form onSubmit={handleCreateExam} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Exam ID (e.g. UPSC_CSE, SSC_CGL)</label>
                  <input
                    type="text"
                    required
                    value={newExamId}
                    onChange={(e) => setNewExamId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Full Examination Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Short Name (e.g. SSC CGL)</label>
                    <input
                      type="text"
                      required
                      value={newShortName}
                      onChange={(e) => setNewShortName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                    >
                      {['SSC', 'UPSC', 'BANKING', 'MEDICAL', 'ENGINEERING', 'STATE_PSC', 'TEACHING', 'RAILWAY', 'DEFENCE'].map(
                        (c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Conducting Authority</label>
                  <input
                    type="text"
                    required
                    value={newAuthority}
                    onChange={(e) => setNewAuthority(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Whitelisted Official Domains (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. ssc.gov.in, ssc.nic.in"
                    value={newDomains}
                    onChange={(e) => setNewDomains(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Authority Home URL</label>
                  <input
                    type="url"
                    placeholder="https://ssc.gov.in"
                    value={newHomeUrl}
                    onChange={(e) => setNewHomeUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createExamMutation.isPending}>
                    {createExamMutation.isPending ? 'Registering...' : 'Save Examination'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Add Source */}
      <AnimatePresence>
        {showAddSourceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-white/10 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Register Official Source URL</h3>
              <p className="text-xs text-slate-500">
                The URL will be verified automatically against {activeExam?.shortName}'s whitelisted official domains.
              </p>
              <form onSubmit={handleAddSource} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Source Type</label>
                  <select
                    value={newSourceType}
                    onChange={(e) => setNewSourceType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  >
                    {['APPLICATION', 'NOTIFICATION', 'SYLLABUS', 'ADMIT_CARD', 'RESULT', 'EXAM_PORTAL', 'AUTHORITY_HOME'].map(
                      (st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Official URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://ssc.gov.in/apply"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <Button type="button" variant="secondary" onClick={() => setShowAddSourceModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addSourceMutation.isPending}>
                    {addSourceMutation.isPending ? 'Verifying...' : 'Verify & Add'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Ingest & Diff Syllabus (Phase 2) */}
      <AnimatePresence>
        {showSyllabusModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl max-w-3xl w-full p-6 space-y-5 border border-slate-200 dark:border-white/10 shadow-2xl my-8 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" /> Ingest Official Syllabus — {activeExam?.shortName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Extract structured canonical syllabus hierarchy from official notice text and review change diffs.
                  </p>
                </div>
                <button
                  onClick={() => setShowSyllabusModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 flex-1 overflow-y-auto pr-1 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Target Cycle</label>
                    <input
                      type="text"
                      required
                      value={syllabusCycleInput}
                      onChange={(e) => setSyllabusCycleInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Syllabus Version Tag</label>
                    <input
                      type="text"
                      required
                      placeholder="2026-v1"
                      value={syllabusVersionInput}
                      onChange={(e) => setSyllabusVersionInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Official Document URL</label>
                    <input
                      type="url"
                      placeholder="https://ssc.gov.in/notice.pdf"
                      value={syllabusSourceUrlInput}
                      onChange={(e) => setSyllabusSourceUrlInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Raw Syllabus Notice Text (or paste extracted PDF content)</label>
                  <textarea
                    rows={6}
                    placeholder="Paste official examination syllabus text containing stages, papers, subjects, topics..."
                    value={rawSyllabusText}
                    onChange={(e) => setRawSyllabusText(e.target.value)}
                    className="w-full px-3 py-2 font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl"
                  />
                </div>

                <div className="flex justify-start gap-2">
                  <Button
                    type="button"
                    onClick={handleExtractSyllabus}
                    disabled={!rawSyllabusText.trim() || extractSyllabusMutation.isPending}
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                  >
                    {extractSyllabusMutation.isPending ? 'Extracting via Structured LLM...' : 'Extract Canonical Structure'}
                  </Button>
                </div>

                {/* Diff Report View */}
                {diffReport && (
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <GitCompare className="w-4 h-4 text-indigo-500" /> Syllabus Diff against {diffReport.fromVersion}
                      </h4>
                      <div className="flex gap-1.5">
                        <Badge tone="success">+{diffReport.totalAddedTopics} Added</Badge>
                        <Badge tone="danger">-{diffReport.totalRemovedTopics} Removed</Badge>
                        <Badge tone="warning">*{diffReport.totalModifiedTopics} Modified</Badge>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-40 overflow-y-auto text-[11px] font-mono">
                      {diffReport.summary.length === 0 ? (
                        <p className="text-slate-400">No structural topic changes detected.</p>
                      ) : (
                        diffReport.summary.map((line: string, idx: number) => (
                          <div
                            key={idx}
                            className={cn(
                              'p-1.5 rounded',
                              line.startsWith('[+]') && 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
                              line.startsWith('[-]') && 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
                              line.startsWith('[*]') && 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                            )}
                          >
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Extracted Stages Preview */}
                {extractedStages && (
                  <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl border border-indigo-200/50 dark:border-indigo-800/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-900 dark:text-indigo-300">
                        Extracted {extractedStages.length} Stages • Content SHA-256: {extractedHash.slice(0, 12)}...
                      </span>
                      <Badge tone="info">Ready to Publish</Badge>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      Publishing will transactionally set this version as <strong className="text-emerald-600">CURRENT</strong>, supersede previous versions, index chunks into Pinecone with authority <strong className="text-indigo-600">OFFICIAL_SYLLABUS</strong>, and build the syllabus graph.
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
                <Button type="button" variant="secondary" onClick={() => setShowSyllabusModal(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={!extractedStages || publishSyllabusMutation.isPending}
                  onClick={handlePublishExtractedSyllabus}
                >
                  {publishSyllabusMutation.isPending ? 'Publishing & Indexing Vectors...' : 'Publish & Index to Vector DB'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
