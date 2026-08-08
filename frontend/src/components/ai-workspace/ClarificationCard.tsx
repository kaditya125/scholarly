/**
 * Clarification Card
 * 
 * Interactive card for AI asking clarifying questions with multiple choice options.
 * Used for curriculum selection, teaching style, duration, audience, etc.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ClarificationMessage, ClarificationOption } from '../../types/workspace.types';

interface ClarificationCardProps {
  message: ClarificationMessage;
  onSelect: (optionId: string) => void;
  delay?: number;
  disabled?: boolean;
}

export default function ClarificationCard({
  message,
  onSelect,
  delay = 0,
  disabled = false,
}: ClarificationCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(message.selectedOptionId || null);
  const [customValue, setCustomValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = (optionId: string) => {
    if (disabled || isSubmitting) return;
    setSelectedId(optionId);
  };

  const handleConfirm = () => {
    if (!selectedId || disabled || isSubmitting) return;
    
    setIsSubmitting(true);
    
    // If custom option and custom value required
    if (selectedId === 'custom' && message.allowCustom && !customValue.trim()) {
      setIsSubmitting(false);
      return;
    }

    // Emit selection
    onSelect(selectedId === 'custom' && customValue ? customValue : selectedId);
  };

  const canConfirm = selectedId && !disabled && !isSubmitting && 
    (selectedId !== 'custom' || (message.allowCustom && customValue.trim()));

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
          <span className="text-white text-sm font-bold">AI</span>
        </div>

        {/* Card Content */}
        <div className="flex-1">
          {/* Question */}
          <div className="mb-4">
            <p className="text-[15px] font-medium text-slate-900 dark:text-white">
              {message.question}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2 mb-4">
            {message.options.map((option) => (
              <OptionButton
                key={option.id}
                option={option}
                isSelected={selectedId === option.id}
                isDisabled={disabled || isSubmitting}
                onClick={() => handleSelect(option.id)}
              />
            ))}

            {/* Custom Input Option */}
            {message.allowCustom && (
              <div className="pt-2">
                <button
                  onClick={() => handleSelect('custom')}
                  disabled={disabled || isSubmitting}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border-2 transition-all',
                    selectedId === 'custom'
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] hover:border-orange-300 dark:hover:border-orange-700',
                    disabled || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                      selectedId === 'custom'
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-slate-300 dark:border-gray-600'
                    )}>
                      {selectedId === 'custom' && (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <span className="text-[14px] font-medium text-slate-700 dark:text-gray-300">
                      Other (specify)
                    </span>
                  </div>
                </button>

                {/* Custom Input Field */}
                {selectedId === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2"
                  >
                    <input
                      type="text"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      placeholder="Enter your answer..."
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none focus:border-orange-500 dark:focus:border-orange-500 transition-colors"
                      disabled={disabled || isSubmitting}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canConfirm) {
                          handleConfirm();
                        }
                      }}
                    />
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Confirm Button */}
          <div className="flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all',
                canConfirm
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              )}
            >
              <span>{isSubmitting ? 'Sending...' : 'Continue'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}


/**
 * Option Button
 * 
 * Individual option button within the clarification card
 */
interface OptionButtonProps {
  option: ClarificationOption;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function OptionButton({ option, isSelected, isDisabled, onClick }: OptionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg border-2 transition-all group',
        isSelected
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 shadow-sm'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/10',
        isDisabled ? 'opacity-50 cursor-not-allowed' : '',
        option.recommended ? 'ring-2 ring-orange-200 dark:ring-orange-900/50' : ''
      )}
    >
      <div className="flex items-start gap-3">
        {/* Radio Circle */}
        <div className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
          isSelected
            ? 'border-orange-500 bg-orange-500'
            : 'border-slate-300 dark:border-gray-600 group-hover:border-orange-400'
        )}>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </div>

        {/* Label & Description */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[14px] font-medium transition-colors',
              isSelected
                ? 'text-orange-900 dark:text-orange-100'
                : 'text-slate-700 dark:text-gray-300 group-hover:text-orange-800 dark:group-hover:text-orange-200'
            )}>
              {option.label}
            </span>
            {option.recommended && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                Recommended
              </span>
            )}
          </div>
          {option.description && (
            <p className={cn(
              'text-[13px] mt-1 transition-colors',
              isSelected
                ? 'text-orange-700 dark:text-orange-200'
                : 'text-slate-500 dark:text-gray-400 group-hover:text-slate-600 dark:group-hover:text-gray-300'
            )}>
              {option.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

