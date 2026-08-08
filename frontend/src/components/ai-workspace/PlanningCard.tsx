/**
 * Planning Card
 * 
 * Displays the AI-generated lesson plan with outline, pedagogical metadata,
 * estimated duration, sources, and action buttons for approval or modification.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Check,
  Edit2,
  RefreshCw,
  Clock,
  Users,
  BookOpen,
  Target,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Play
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PlanMessage, LessonPlan } from '../../types/workspace.types';

interface PlanningCardProps {
  message: PlanMessage;
  onApprove: () => void;
  onModify?: () => void;
  onRegenerate?: () => void;
  delay?: number;
  disabled?: boolean;
}

export default function PlanningCard({
  message,
  onApprove,
  onModify,
  onRegenerate,
  delay = 0,
  disabled = false,
}: PlanningCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { plan } = message;

  const handleApprove = () => {
    if (disabled || isApproving) return;
    setIsApproving(true);
    onApprove();
  };

  const handleRegenerate = () => {
    if (disabled || isRegenerating || !onRegenerate) return;
    setIsRegenerating(true);
    onRegenerate();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay }}
      className="mb-6"
    >
      <div className="flex items-start gap-3">
        {/* AI Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>

        {/* Card Content */}
        <div className="flex-1">
          {/* Header */}
          <div className="mb-4">
            <h3 className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{plan.title}</span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                Ready
              </span>
            </h3>
            {plan.subtitle && (
              <p className="text-[14px] text-slate-600 dark:text-gray-400 mt-1">
                {plan.subtitle}
              </p>
            )}
          </div>

          {/* Metadata Pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {plan.estimatedDuration && (
              <MetadataPill icon={Clock} label={`${plan.estimatedDuration} min`} />
            )}
            {plan.targetAudience && (
              <MetadataPill icon={Users} label={plan.targetAudience} />
            )}
            {plan.curriculum && (
              <MetadataPill icon={BookOpen} label={plan.curriculum} />
            )}
            {plan.difficultyLevel && (
              <MetadataPill 
                icon={Target} 
                label={`${plan.difficultyLevel.charAt(0).toUpperCase() + plan.difficultyLevel.slice(1)} Level`}
                color={
                  plan.difficultyLevel === 'beginner' ? 'green' :
                  plan.difficultyLevel === 'intermediate' ? 'yellow' : 'red'
                }
              />
            )}
          </div>

          {/* Main Content Card */}
          <div className="bg-white dark:bg-[#141415] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            {/* Expandable Header */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  Lesson Outline
                </span>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-400">
                  {plan.outline.length} sections
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Outline Content */}
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="px-5 pb-5 space-y-3"
              >
                {plan.outline.map((section, idx) => (
                  <OutlineSection key={idx} section={section} index={idx} />
                ))}
              </motion.div>
            )}

            {/* Sources Section */}
            {plan.sources && plan.sources.length > 0 && (
              <div className="border-t border-slate-200 dark:border-white/10 px-5 py-4">
                <h4 className="text-[13px] font-semibold text-slate-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  <span>Sources & References</span>
                </h4>
                <div className="space-y-1">
                  {plan.sources.map((source, idx) => (
                    <SourceItem key={idx} source={source} />
                  ))}
                </div>
              </div>
            )}

            {/* Pedagogical Notes */}
            {plan.pedagogicalNotes && (
              <div className="border-t border-slate-200 dark:border-white/10 px-5 py-4 bg-blue-50/50 dark:bg-blue-950/20">
                <h4 className="text-[13px] font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  Teaching Notes
                </h4>
                <p className="text-[13px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  {plan.pedagogicalNotes}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              onClick={handleApprove}
              disabled={disabled || isApproving}
              className={cn(
                'inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all',
                disabled || isApproving
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/30'
              )}
            >
              <Play className="w-4 h-4" />
              <span>{isApproving ? 'Starting...' : 'Approve & Generate Podcast'}</span>
            </button>

            {onModify && (
              <button
                onClick={onModify}
                disabled={disabled || isApproving}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg font-medium border border-slate-300 dark:border-white/10 bg-white dark:bg-[#141415] text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit2 className="w-4 h-4" />
                <span>Modify Plan</span>
              </button>
            )}

            {onRegenerate && (
              <button
                onClick={handleRegenerate}
                disabled={disabled || isRegenerating}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg font-medium border border-slate-300 dark:border-white/10 bg-white dark:bg-[#141415] text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={cn('w-4 h-4', isRegenerating && 'animate-spin')} />
                <span>{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
              </button>
            )}
          </div>

          {/* Helper Text */}
          <p className="text-[12px] text-slate-500 dark:text-gray-500 mt-3 italic">
            Once approved, this plan will be used to generate your podcast content with AI narration.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Metadata Pill
 */
interface MetadataPillProps {
  icon: React.ComponentType<any>;
  label: string;
  color?: 'gray' | 'green' | 'yellow' | 'red';
}

function MetadataPill({ icon: Icon, label, color = 'gray' }: MetadataPillProps) {
  const colorClasses = {
    gray: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-300',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium',
      colorClasses[color]
    )}>
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Outline Section
 */
interface OutlineSectionProps {
  section: {
    title: string;
    duration?: string;
    keyPoints?: string[];
    description?: string;
  };
  index: number;
}

function OutlineSection({ section, index }: OutlineSectionProps) {
  return (
    <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
      {/* Section Header */}
      <div className="flex items-start gap-3 mb-2">
        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
          <span className="text-white text-[11px] font-bold">{index + 1}</span>
        </div>
        <div className="flex-1">
          <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            {section.title}
          </h4>
          {section.duration && (
            <div className="flex items-center gap-1 mt-1 text-[12px] text-slate-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{section.duration}</span>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {section.description && (
        <p className="text-[13px] text-slate-600 dark:text-gray-400 ml-9 mb-2">
          {section.description}
        </p>
      )}

      {/* Key Points */}
      {section.keyPoints && section.keyPoints.length > 0 && (
        <ul className="ml-9 space-y-1">
          {section.keyPoints.map((point, idx) => (
            <li key={idx} className="flex items-start gap-2 text-[13px] text-slate-700 dark:text-gray-300">
              <Check className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Source Item
 */
interface SourceItemProps {
  source: string;
}

function SourceItem({ source }: SourceItemProps) {
  const isUrl = source.startsWith('http://') || source.startsWith('https://');

  if (isUrl) {
    return (
      <a
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group"
      >
        <ExternalLink className="w-3 h-3 shrink-0" />
        <span className="truncate group-hover:underline">{source}</span>
      </a>
    );
  }

  return (
    <div className="flex items-start gap-2 text-[12px] text-slate-600 dark:text-gray-400">
      <span className="text-slate-400 dark:text-gray-600">•</span>
      <span>{source}</span>
    </div>
  );
}
