import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface CalloutProps {
  show: boolean;
  text: string;
  direction?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'right' | 'left';
  className?: string;
  delay?: number;
}

export function DemoCallout({ show, text, direction = 'top-right', className, delay = 0 }: CalloutProps) {
  // Calculate positioning classes based on direction
  const positionClasses = {
    'top-right': 'bottom-full left-1/2 -translate-y-4 translate-x-4',
    'top-left': 'bottom-full right-1/2 -translate-y-4 -translate-x-4',
    'bottom-right': 'top-full left-1/2 translate-y-4 translate-x-4',
    'bottom-left': 'top-full right-1/2 translate-y-4 -translate-x-4',
    'right': 'left-full top-1/2 -translate-y-1/2 translate-x-4',
    'left': 'right-full top-1/2 -translate-y-1/2 -translate-x-4',
  }[direction];

  // SVG Line path based on direction
  const getPath = () => {
    switch (direction) {
      case 'top-right': return "M 0 40 Q 0 20 20 20 L 40 20";
      case 'top-left': return "M 40 40 Q 40 20 20 20 L 0 20";
      case 'bottom-right': return "M 0 0 Q 0 20 20 20 L 40 20";
      case 'bottom-left': return "M 40 0 Q 40 20 20 20 L 0 20";
      case 'right': return "M 0 20 L 40 20";
      case 'left': return "M 40 20 L 0 20";
      default: return "M 0 40 Q 0 20 20 20 L 40 20";
    }
  };

  const svgPosition = {
    'top-right': 'top-full right-full translate-x-[15px] -translate-y-[15px]',
    'top-left': 'top-full left-full -translate-x-[15px] -translate-y-[15px]',
    'bottom-right': 'bottom-full right-full translate-x-[15px] translate-y-[15px]',
    'bottom-left': 'bottom-full left-full -translate-x-[15px] translate-y-[15px]',
    'right': 'top-1/2 right-full -translate-y-1/2 translate-x-[5px]',
    'left': 'top-1/2 left-full -translate-y-1/2 -translate-x-[5px]',
  }[direction];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
          transition={{ duration: 0.4, delay, type: 'spring', bounce: 0.2 }}
          className={cn("absolute z-50 whitespace-nowrap pointer-events-none", positionClasses, className)}
        >
          {/* Connector Line */}
          <svg 
            width="40" 
            height="40" 
            viewBox="0 0 40 40" 
            fill="none" 
            className={cn("absolute pointer-events-none", svgPosition)}
          >
            <motion.path
              d={getPath()}
              stroke="#cbd5e1" // slate-300
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: delay + 0.1, ease: "easeOut" }}
            />
            {/* Small dot at the end of the line (connecting to the element) */}
            <motion.circle
              cx={direction.includes('left') ? 40 : 0}
              cy={direction.includes('top') ? 40 : direction.includes('bottom') ? 0 : 20}
              r="3"
              fill="#818cf8" // indigo-400
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: delay + 0.5, type: 'spring' }}
            />
          </svg>

          {/* Callout Box */}
          <div className="bg-white dark:bg-[#2a2a2b] border border-indigo-100 dark:border-indigo-500/20 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl px-4 py-2.5 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[12.5px] font-semibold text-indigo-900 dark:text-indigo-100 tracking-tight">
              {text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
