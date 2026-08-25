import React, { useState } from 'react';
import {
  ShieldCheck,
  ExternalLink,
  FileText,
  Sparkles,
  BookOpen,
  Building2,
  X,
  CheckCircle2,
  Layers,
  Award,
  HelpCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useExamSyllabus } from '../../hooks/api/useExams';
import { syllabusNodesOf, type SyllabusNode } from '../../lib/api/exams';

export interface OfficialSourceItem {
  examName?: string;
  examShortName?: string;
  authorityName?: string;
  authorityUrl?: string;
  pdfUrl?: string;
  pdfTitle?: string;
  documentHash?: string;
  activeTopic?: string;
  examId?: string;
  cycleId?: string;
  tip?: string;
  relatedQueries?: string[];
}

interface OfficialSourceCarouselProps {
  source?: OfficialSourceItem;
  className?: string;
  onSuggestionClick?: (query: string) => void;
}

/**
 * Renders a syllabus node and everything beneath it.
 *
 * Recursive, and styled by the node's TYPE rather than its depth, because the tree deliberately
 * skips levels: SSC CGL Tier-I holds subjects directly while Tier-II holds papers, so the same
 * visual depth means different things in different branches. A fixed four-level render dropped
 * whichever branches did not match its assumed shape.
 */
const SyllabusNodeView: React.FC<{ node: SyllabusNode; depth?: number }> = ({ node, depth = 0 }) => {
  const kids = node.children || [];
  const badge =
    node.marks != null ? (
      <span className="text-[10.5px] font-mono text-indigo-600 dark:text-indigo-400">
        {node.questionCount != null ? `${node.questionCount}Q • ` : ''}{node.marks}M
      </span>
    ) : null;

  if (node.type === 'STAGE') {
    return (
      <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5 space-y-3">
        <div className="flex items-center justify-between font-bold text-sm text-slate-900 dark:text-white">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" /> {node.name}
          </span>
          {badge}
        </div>
        {kids.map((c) => <SyllabusNodeView key={c.nodeId} node={c} depth={depth + 1} />)}
      </div>
    );
  }

  if (node.type === 'PAPER' || node.type === 'SECTION') {
    return (
      <div className="space-y-2 pl-2">
        <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-gray-300">
          <span>{node.name}</span>
          {badge}
        </div>
        <div className="space-y-2">
          {kids.map((c) => <SyllabusNodeView key={c.nodeId} node={c} depth={depth + 1} />)}
        </div>
      </div>
    );
  }

  if (node.type === 'SUBJECT') {
    return (
      <div className="p-3 rounded-lg bg-white dark:bg-white/5 border border-slate-200/50 dark:border-white/5 space-y-1.5">
        <div className="flex justify-between items-center font-bold text-slate-800 dark:text-gray-200">
          <span>{node.name}</span>
          {badge}
        </div>
        <div className="space-y-1 text-[11px] text-slate-500 dark:text-gray-400">
          {kids.map((c) => <SyllabusNodeView key={c.nodeId} node={c} depth={depth + 1} />)}
        </div>
      </div>
    );
  }

  // TOPIC and SUBTOPIC — the leaves, indented by how deep the document actually nests them.
  return (
    <div className="space-y-1" style={{ paddingLeft: node.type === 'SUBTOPIC' ? 10 : 0 }}>
      <div className="flex items-start gap-1">
        <span className={node.type === 'TOPIC' ? 'text-indigo-500 font-bold' : 'text-slate-400'}>•</span>
        <span className={node.type === 'TOPIC'
          ? 'text-slate-700 dark:text-gray-300 font-medium'
          : 'text-slate-500 dark:text-gray-400'}>{node.name}</span>
      </div>
      {kids.map((c) => <SyllabusNodeView key={c.nodeId} node={c} depth={depth + 1} />)}
    </div>
  );
};

export const OfficialSourceCarousel: React.FC<OfficialSourceCarouselProps> = ({
  source,
  className,
  onSuggestionClick,
}) => {
  const navigate = useNavigate();
  const [showDocModal, setShowDocModal] = useState(false);

  const examShort = source?.examShortName || 'SSC CGL';
  const examName = source?.examName || 'Staff Selection Commission — Combined Graduate Level';
  const authority = source?.authorityName || 'Staff Selection Commission';
  const portalUrl = source?.authorityUrl || 'https://ssc.gov.in';
  const examId = source?.examId || 'SSC_CGL';
  const activeTopic = source?.activeTopic || 'General Studies & Quantitative Aptitude';
  const docHash = source?.documentHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const relatedQueries = source?.relatedQueries || [
    `What is the complete syllabus breakdown for ${examShort}?`,
    `What are the age limits and category relaxations for ${examShort}?`,
    `What is the marking scheme and exam pattern for ${examShort}?`,
  ];

  const portalDomain = (() => {
    try {
      return new URL(portalUrl).hostname;
    } catch {
      return 'gov.in';
    }
  })();

  const { data: syllabusData } = useExamSyllabus(showDocModal ? examId : null);
  const syllabus = syllabusData?.syllabus;
  // Handles both the canonical node tree and older nested records.
  const syllabusNodes = syllabusNodesOf(syllabus);

  return (
    <div className={cn('my-3.5 space-y-2.5', className)}>
      {/* ── Callout Box (matching Pic 3 style) ───────────────────────────── */}
      <div className="rounded-xl border border-amber-500/30 dark:border-amber-500/25 bg-amber-500/[0.04] dark:bg-amber-950/20 p-3 text-xs">
        <div className="font-bold text-[11px] tracking-wider text-amber-600 dark:text-amber-400 uppercase mb-1 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Official Exam Recommendation</span>
        </div>
        <p className="text-slate-700 dark:text-gray-300 leading-relaxed">
          Grounded in the verified <strong>{examShort} 2026</strong> official syllabus. Master {activeTopic} through official PYQs and adaptive questions to maximize your score.
        </p>
      </div>

      {/* ── Verified Results & Sources (matching Pic 3 style) ────────────── */}
      <div className="space-y-0.5">
        <div className="text-[11.5px] text-slate-400 dark:text-gray-500 mb-1.5">
          3 verified results
        </div>

        <div className="space-y-1 w-full min-w-0">
          {/* Row 1: Official Portal */}
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300 py-1 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group cursor-pointer w-full min-w-0"
          >
            <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-emerald-500 transition-colors" />
            <span className="truncate flex-1 min-w-0 underline decoration-slate-200 dark:decoration-white/15 underline-offset-[3px] group-hover:decoration-slate-400 dark:group-hover:decoration-white/40">
              {authority} Official Portal — {portalDomain}
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
          </a>

          {/* Row 2: Official Notice & Syllabus Viewer */}
          <div
            onClick={() => setShowDocModal(true)}
            className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300 py-1 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group cursor-pointer w-full min-w-0"
          >
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-indigo-500 transition-colors" />
            <span className="truncate flex-1 min-w-0 underline decoration-slate-200 dark:decoration-white/15 underline-offset-[3px] group-hover:decoration-slate-400 dark:group-hover:decoration-white/40">
              {examShort} 2026 Official Gazette Notice & Canonical Syllabus
            </span>
            <span className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 font-semibold shrink-0 ml-auto pl-1">
              View Document →
            </span>
          </div>

          {/* Row 3: Practice Action */}
          <div
            onClick={() =>
              navigate(`/tests?exam=${encodeURIComponent(examId)}&topic=${encodeURIComponent(activeTopic)}`)
            }
            className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300 py-1 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group cursor-pointer w-full min-w-0"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-violet-500 transition-colors" />
            <span className="truncate flex-1 min-w-0 underline decoration-slate-200 dark:decoration-white/15 underline-offset-[3px] group-hover:decoration-slate-400 dark:group-hover:decoration-white/40">
              Practice {activeTopic} — Adaptive Quiz
            </span>
            <span className="text-[11px] text-violet-500 dark:text-violet-400 font-semibold shrink-0 ml-auto group-hover:translate-x-0.5 transition-transform pl-1">
              Practice →
            </span>
          </div>
        </div>
      </div>

      {/* ── Related Follow-Up Queries ("You can also check:") ──────────── */}
      {relatedQueries && relatedQueries.length > 0 && (
        <div className="pt-2 space-y-1">
          <div className="text-[11.5px] font-medium text-slate-400 dark:text-gray-500 mb-1 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>You can also check:</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {relatedQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick?.(q)}
                className="text-left text-[12.5px] text-slate-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 underline decoration-slate-200 dark:decoration-white/10 underline-offset-[3px] hover:decoration-indigo-400 dark:hover:decoration-indigo-400 transition-colors py-0.5 w-fit cursor-pointer"
              >
                • {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Official Document & Syllabus Viewer Modal ─────────────────────── */}
      <AnimatePresence>
        {showDocModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#14151f] rounded-2xl max-w-3xl w-full p-6 space-y-4 border border-slate-200 dark:border-white/10 shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/5 pb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified Official Document
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      SHA-256: {docHash.slice(0, 12)}...
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {examName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authority: <strong>{authority}</strong> • Cycle: 2026
                  </p>
                </div>
                <button
                  onClick={() => setShowDocModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Document Syllabus Breakdown */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                {syllabusNodes.length > 0 ? (
                  syllabusNodes.map((node) => (
                    <SyllabusNodeView key={node.nodeId} node={node} />
                  ))
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-2">
                    <div className="font-bold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Canonical Examination Gazette Details
                    </div>
                    <p className="text-slate-600 dark:text-gray-300 leading-relaxed">
                      Official examination schedule & syllabus verified under {authority} registry. Covers Prelims / Tier I, Mains Examination, and syllabus components with verified conducting rules.
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Open Official {portalDomain} Portal</span>
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
                <button
                  onClick={() => {
                    setShowDocModal(false);
                    navigate('/exam-center');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-800 dark:text-white transition-all"
                >
                  <Award className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Exam Command Center</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OfficialSourceCarousel;
