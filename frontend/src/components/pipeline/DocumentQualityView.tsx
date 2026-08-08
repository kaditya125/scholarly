/**
 * DocumentQualityView
 * Phase 8: Content Quality & Pre-READY Invariant Visualizer
 */

import React, { useState } from 'react';
import {
  ContentQualityReport,
  QualityHealthStatus,
  QualityIndicatorName,
  QualityIndicatorResult,
  QualityValidationInvariant,
} from '../../types/pipeline.types';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  RefreshCw,
  Info,
  CheckCircle2,
  HelpCircle,
  Sliders,
  Sparkles,
  Layers,
  FileText,
  Tag,
  Network,
  Cpu,
} from 'lucide-react';

interface DocumentQualityViewProps {
  report: ContentQualityReport | null;
  loading?: boolean;
  revalidating?: boolean;
  onRevalidate?: (strictMode?: boolean) => void;
}

export const DocumentQualityView: React.FC<DocumentQualityViewProps> = ({
  report,
  loading = false,
  revalidating = false,
  onRevalidate,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'failed' | 'warnings'>('all');
  const [strictMode, setStrictMode] = useState(false);

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
        <p className="font-medium text-slate-300">Evaluating 10 pre-READY invariants and computing quality score...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-8 bg-slate-900/40 rounded-2xl border border-slate-800 text-center text-slate-400">
        <HelpCircle className="w-10 h-10 text-slate-500 mx-auto mb-2" />
        <p>No quality evaluation report available for this document.</p>
      </div>
    );
  }

  const getHealthBadge = (status: QualityHealthStatus) => {
    switch (status) {
      case 'Healthy':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          icon: ShieldCheck,
          label: 'Healthy',
          desc: 'Passed all mandatory invariants with high content fidelity',
        };
      case 'Warning':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          icon: AlertTriangle,
          label: 'Warning',
          desc: 'Searchable and usable, but minor quality degradations detected',
        };
      case 'Needs Review':
        return {
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
          icon: AlertOctagon,
          label: 'Needs Review',
          desc: 'Significant anomalies detected (low text density or vector discrepancy)',
        };
      case 'Failed':
      default:
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          icon: XCircle,
          label: 'Failed',
          desc: 'Critical invariants failed. Document cannot enter production READY state',
        };
    }
  };

  const getIndicatorIcon = (name: QualityIndicatorName) => {
    switch (name) {
      case 'Extraction':
        return FileText;
      case 'Metadata':
        return Tag;
      case 'Chunking':
        return Layers;
      case 'Embeddings':
        return Cpu;
      case 'Vector Index':
        return Sparkles;
      case 'Knowledge Graph':
        return Network;
      case 'Validation':
        return ShieldCheck;
    }
  };

  const health = getHealthBadge(report.healthStatus);
  const HealthIcon = health.icon;

  const filteredInvariants = report.invariants.filter(inv => {
    if (filterType === 'failed') return !inv.passed;
    if (filterType === 'warnings') return inv.passed && inv.explanation;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Top Executive Quality Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900 p-6 rounded-2xl border border-slate-700/60 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Score Radial & Health Pill */}
        <div className="flex items-center gap-5">
          <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-slate-950 border border-slate-700 shadow-inner flex-shrink-0">
            <div className="text-center">
              <span className={`text-3xl font-black tracking-tight ${
                report.overallScore >= 85 ? 'text-emerald-400' :
                report.overallScore >= 65 ? 'text-amber-400' :
                report.overallScore >= 40 ? 'text-orange-400' : 'text-rose-400'
              }`}>
                {report.overallScore}%
              </span>
              <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5">
                Quality
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${health.bg}`}>
                <HealthIcon className="w-3.5 h-3.5" />
                {health.label}
              </span>
              <span className="text-xs text-slate-400">
                {report.summary.passedInvariants} / {report.summary.totalInvariants} Invariants Passed
              </span>
            </div>
            <p className="text-sm text-slate-300 font-medium max-w-md">
              {health.desc}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Score is mathematically derived across 7 multi-dimensional indicators (never inflated).
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-700/60 hover:bg-slate-800 transition">
            <input
              type="checkbox"
              checked={strictMode}
              onChange={e => setStrictMode(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
            />
            Strict Invariant Mode
          </label>

          <button
            onClick={() => onRevalidate?.(strictMode)}
            disabled={revalidating}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-900/30 transition w-full sm:w-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin' : ''}`} />
            {revalidating ? 'Auditing Pipeline...' : 'Re-verify Invariants'}
          </button>
        </div>
      </div>

      {/* 2. Critical Failures & Warnings Callout (if any) */}
      {(report.failures.length > 0 || report.warnings.length > 0) && (
        <div className="space-y-3">
          {report.failures.map((fail, i) => (
            <div key={`fail-${i}`} className="flex items-start gap-3 p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-200">
              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300">Blocking Validation Failure: </span>
                {fail}
              </div>
            </div>
          ))}

          {report.warnings.map((warn, i) => (
            <div key={`warn-${i}`} className="flex items-start gap-3 p-4 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">Quality Notice: </span>
                {warn}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Seven Component Quality Indicators Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            Component Quality Indicators (7)
          </h3>
          <span className="text-xs text-slate-400">
            Weighted composite scoring
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Object.entries(report.indicators).map(([name, ind]: [string, QualityIndicatorResult]) => {
            const Icon = getIndicatorIcon(name as QualityIndicatorName);
            const isUnavailable = ind.status === 'unavailable';
            const isExcellent = ind.score >= 85;
            const isGood = ind.score >= 70 && ind.score < 85;

            return (
              <div
                key={name}
                className={`p-4 rounded-xl border transition ${
                  isUnavailable
                    ? 'bg-slate-900/30 border-slate-800 text-slate-500'
                    : isExcellent
                    ? 'bg-slate-900/60 border-slate-700/80 hover:border-slate-600'
                    : isGood
                    ? 'bg-slate-900/60 border-amber-900/40 hover:border-amber-700/60'
                    : 'bg-slate-900/60 border-rose-900/40 hover:border-rose-700/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-200">{name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {(ind.weight * 100).toFixed(0)}% wt
                    </span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        isUnavailable
                          ? 'bg-slate-800 text-slate-400'
                          : isExcellent
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : isGood
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {isUnavailable ? 'N/A' : `${ind.score}%`}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isUnavailable
                        ? 'bg-slate-600'
                        : isExcellent
                        ? 'bg-emerald-400'
                        : isGood
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                    style={{ width: `${isUnavailable ? 0 : ind.score}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {ind.summary}
                </p>

                {ind.explanation && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-amber-300/80 flex items-start gap-1">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-400" />
                    <span>{ind.explanation}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Ten Mandatory Pre-READY Invariants Checklist */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              10 Pre-READY Mandatory Validation Invariants
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic assertions evaluated before marking document as READY
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                filterType === 'all' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All (10)
            </button>
            <button
              onClick={() => setFilterType('failed')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                filterType === 'failed' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Failed ({report.invariants.filter(i => !i.passed).length})
            </button>
            <button
              onClick={() => setFilterType('warnings')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                filterType === 'warnings' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Notices ({report.invariants.filter(i => i.passed && i.explanation).length})
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredInvariants.map((inv: QualityValidationInvariant, idx: number) => (
            <div
              key={inv.id}
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                !inv.passed
                  ? inv.critical
                    ? 'bg-rose-950/20 border-rose-900/50'
                    : 'bg-amber-950/20 border-amber-900/50'
                  : 'bg-slate-950/50 border-slate-800/80'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {inv.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : inv.critical ? (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      {idx + 1}. {inv.name}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        inv.critical ? 'bg-rose-900/50 text-rose-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {inv.critical ? 'Mandatory' : 'Optional'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">{inv.message}</p>
                  {inv.explanation && (
                    <p className="text-[11px] text-amber-400/90 mt-1 italic">
                      ℹ {inv.explanation}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    inv.passed
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {inv.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Diagnostic Explanations Summary */}
      {report.explanationSummary.length > 0 && (
        <div className="p-5 bg-slate-900/40 rounded-2xl border border-slate-800/80">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            Validation Diagnostic & Component Status Summary
          </h4>
          <ul className="space-y-1.5 text-xs text-slate-400 list-disc list-inside">
            {report.explanationSummary.map((exp, i) => (
              <li key={i} className="leading-relaxed">
                {exp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
