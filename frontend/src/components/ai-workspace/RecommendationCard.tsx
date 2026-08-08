/**
 * Recommendation Card
 * 
 * Displays AI educational suggestions including learning objectives,
 * misconceptions, exam tips, and memory tricks based on curriculum analysis.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Target, 
  AlertTriangle, 
  BookOpen, 
  Lightbulb,
  Sparkles,
  Edit2,
  ThumbsUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { RecommendationMessage, LearningObjective, Misconception } from '../../types/workspace.types';

interface RecommendationCardProps {
  message: RecommendationMessage;
  onAccept: () => void;
  onModify?: () => void;
  delay?: number;
  disabled?: boolean;
}

export default function RecommendationCard({
  message,
  onAccept,
  onModify,
  delay = 0,
  disabled = false,
}: RecommendationCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['objectives']) // Objectives expanded by default
  );
  const [isAccepting, setIsAccepting] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleAccept = () => {
    if (disabled || isAccepting) return;
    setIsAccepting(true);
    onAccept();
  };

  const hasObjectives = message.recommendations.objectives?.length > 0;
  const hasMisconceptions = message.recommendations.misconceptions?.length > 0;
  const hasExamTips = message.recommendations.examTips?.length > 0;
  const hasMemoryTricks = message.recommendations.memoryTricks?.length > 0;

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
            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Educational Recommendations</span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                AI Generated
              </span>
            </h3>
            {message.summary && (
              <p className="text-[13px] text-slate-600 dark:text-gray-400 mt-1">
                {message.summary}
              </p>
            )}
          </div>

          {/* Recommendations Container */}
          <div className="bg-white dark:bg-[#141415] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            {/* Learning Objectives */}
            {hasObjectives && (
              <CollapsibleSection
                id="objectives"
                title="Learning Objectives"
                icon={Target}
                count={message.recommendations.objectives.length}
                isExpanded={expandedSections.has('objectives')}
                onToggle={() => toggleSection('objectives')}
                iconColor="text-blue-500"
              >
                <div className="space-y-3">
                  {message.recommendations.objectives.map((obj, idx) => (
                    <ObjectiveItem key={idx} objective={obj} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Common Misconceptions */}
            {hasMisconceptions && (
              <CollapsibleSection
                id="misconceptions"
                title="Common Misconceptions"
                icon={AlertTriangle}
                count={message.recommendations.misconceptions.length}
                isExpanded={expandedSections.has('misconceptions')}
                onToggle={() => toggleSection('misconceptions')}
                iconColor="text-amber-500"
              >
                <div className="space-y-3">
                  {message.recommendations.misconceptions.map((misc, idx) => (
                    <MisconceptionItem key={idx} misconception={misc} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Exam Tips */}
            {hasExamTips && (
              <CollapsibleSection
                id="examTips"
                title="Exam-Focused Tips"
                icon={BookOpen}
                count={message.recommendations.examTips.length}
                isExpanded={expandedSections.has('examTips')}
                onToggle={() => toggleSection('examTips')}
                iconColor="text-purple-500"
              >
                <div className="space-y-2">
                  {message.recommendations.examTips.map((tip, idx) => (
                    <TipItem key={idx} tip={tip} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Memory Tricks */}
            {hasMemoryTricks && (
              <CollapsibleSection
                id="memoryTricks"
                title="Memory Tricks & Mnemonics"
                icon={Lightbulb}
                count={message.recommendations.memoryTricks.length}
                isExpanded={expandedSections.has('memoryTricks')}
                onToggle={() => toggleSection('memoryTricks')}
                iconColor="text-green-500"
              >
                <div className="space-y-2">
                  {message.recommendations.memoryTricks.map((trick, idx) => (
                    <MemoryTrickItem key={idx} trick={trick} />
                  ))}
                </div>
              </CollapsibleSection>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleAccept}
              disabled={disabled || isAccepting}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all',
                disabled || isAccepting
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25'
              )}
            >
              <ThumbsUp className="w-4 h-4" />
              <span>{isAccepting ? 'Accepting...' : 'Accept & Continue'}</span>
            </button>

            {onModify && (
              <button
                onClick={onModify}
                disabled={disabled || isAccepting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-slate-300 dark:border-white/10 bg-white dark:bg-[#141415] text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit2 className="w-4 h-4" />
                <span>Modify</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Collapsible Section
 */
interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  iconColor: string;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  isExpanded,
  onToggle,
  iconColor,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border-b border-slate-200 dark:border-white/10 last:border-b-0">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={cn('w-5 h-5', iconColor)} />
          <span className="text-[14px] font-medium text-slate-900 dark:text-white">
            {title}
          </span>
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-400">
            {count}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Objective Item
 */
interface ObjectiveItemProps {
  objective: LearningObjective;
}

function ObjectiveItem({ objective }: ObjectiveItemProps) {
  const bloomColors: Record<string, string> = {
    'remember': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    'understand': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    'apply': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    'analyze': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    'evaluate': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    'create': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  };

  const priorityColors: Record<string, string> = {
    'high': 'border-red-300 dark:border-red-700',
    'medium': 'border-yellow-300 dark:border-yellow-700',
    'low': 'border-slate-300 dark:border-white/10',
  };

  return (
    <div className={cn(
      'p-3 rounded-lg border-l-4 bg-slate-50 dark:bg-white/5',
      priorityColors[objective.priority || 'medium']
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-medium text-slate-900 dark:text-white flex-1">
          {objective.text}
        </p>
        <span className={cn(
          'px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full shrink-0',
          bloomColors[objective.bloomLevel || 'understand']
        )}>
          {objective.bloomLevel}
        </span>
      </div>
      {objective.description && (
        <p className="text-[12px] text-slate-600 dark:text-gray-400">
          {objective.description}
        </p>
      )}
    </div>
  );
}

/**
 * Misconception Item
 */
interface MisconceptionItemProps {
  misconception: Misconception;
}

function MisconceptionItem({ misconception }: MisconceptionItemProps) {
  return (
    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[13px] font-medium text-amber-900 dark:text-amber-100 flex-1">
          {misconception.misconception}
        </p>
      </div>
      <div className="ml-6">
        <p className="text-[12px] text-amber-800 dark:text-amber-200/80">
          <span className="font-semibold">Correction: </span>
          {misconception.correction}
        </p>
      </div>
    </div>
  );
}

/**
 * Tip Item
 */
interface TipItemProps {
  tip: string;
}

function TipItem({ tip }: TipItemProps) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors">
      <Check className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
      <p className="text-[13px] text-slate-700 dark:text-gray-300">
        {tip}
      </p>
    </div>
  );
}

/**
 * Memory Trick Item
 */
interface MemoryTrickItemProps {
  trick: string;
}

function MemoryTrickItem({ trick }: MemoryTrickItemProps) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
      <Lightbulb className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
      <p className="text-[13px] text-green-900 dark:text-green-100 font-medium">
        {trick}
      </p>
    </div>
  );
}
