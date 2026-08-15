import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Gift, Sparkles, IndianRupee, Link as LinkIcon, Star } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A subtle, interactive background for the Referral page.
 * Implements mouse parallax, slow floating animations, and subtle dotted paths.
 * Respects prefers-reduced-motion.
 */
export default function ReferralBackground() {
  const reducedMotion = useReducedMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse coordinates to -1 to 1 based on screen size
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [reducedMotion]);

  // If reduced motion is enabled, set mouse position to 0 to disable parallax
  const px = reducedMotion ? 0 : mousePosition.x;
  const py = reducedMotion ? 0 : mousePosition.y;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 
        1. Dotted Path connecting the two cards (conceptual).
        We position an SVG that curves across the middle of the screen. 
      */}
      <svg
        className="absolute top-[40%] left-1/2 -translate-x-1/2 w-full max-w-[900px] h-[300px] opacity-[0.03] dark:opacity-[0.02]"
        viewBox="0 0 900 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M100 150 C 300 50, 600 250, 800 150"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="8 8"
          strokeLinecap="round"
        />
        {/* Tiny decorative nodes on the path */}
        <circle cx="100" cy="150" r="4" fill="currentColor" />
        <circle cx="800" cy="150" r="4" fill="currentColor" />
        <circle cx="450" cy="150" r="3" fill="currentColor" />
      </svg>

      {/* 
        2. Large Watermark Elements (Extremely faint)
        Parallax moves them slightly (5-10px range).
      */}
      <motion.div
        className="absolute top-[10%] -left-[5%] text-slate-200 dark:text-white/5 opacity-40 dark:opacity-20"
        animate={{ x: px * -15, y: py * -15 }}
        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
      >
        <Gift strokeWidth={1} className="w-48 h-48 rotate-[-15deg]" />
      </motion.div>

      <motion.div
        className="absolute top-[60%] -right-[5%] text-slate-200 dark:text-white/5 opacity-40 dark:opacity-20"
        animate={{ x: px * 12, y: py * 12 }}
        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
      >
        <Gift strokeWidth={1} className="w-56 h-56 rotate-[10deg]" />
      </motion.div>

      <motion.div
        className="absolute top-[80%] left-[20%] text-slate-200 dark:text-white/5 opacity-30 dark:opacity-10"
        animate={{ x: px * 8, y: py * -8 }}
        transition={{ type: 'spring', stiffness: 50, damping: 20 }}
      >
        <IndianRupee strokeWidth={1} className="w-32 h-32 rotate-[15deg]" />
      </motion.div>

      {/* 
        3. Floating Elements (Slow drift)
      */}
      <motion.div
        className="absolute top-[25%] left-[25%] text-[#F4C542] opacity-20 dark:opacity-[0.08]"
        animate={reducedMotion ? {} : { y: [0, -15, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Star className="w-8 h-8 fill-current" />
      </motion.div>

      <motion.div
        className="absolute top-[15%] right-[30%] text-[#8ab4f8] opacity-30 dark:opacity-[0.15]"
        animate={reducedMotion ? {} : { y: [0, 20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        <Sparkles strokeWidth={1.5} className="w-10 h-10" />
      </motion.div>

      <motion.div
        className="absolute top-[45%] right-[15%] text-slate-400 dark:text-gray-500 opacity-20 dark:opacity-20"
        animate={reducedMotion ? {} : { y: [0, -10, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      >
        <LinkIcon strokeWidth={2} className="w-6 h-6 rotate-45" />
      </motion.div>

      <motion.div
        className="absolute top-[75%] right-[40%] text-[#F4C542] opacity-15 dark:opacity-[0.06]"
        animate={reducedMotion ? {} : { y: [0, 15, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <Gift strokeWidth={1.5} className="w-12 h-12 -rotate-12" />
      </motion.div>

      <motion.div
        className="absolute top-[65%] left-[10%] text-[#c8e558] opacity-20 dark:opacity-[0.1]"
        animate={reducedMotion ? {} : { y: [0, -12, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      >
        <Sparkles strokeWidth={1.5} className="w-8 h-8" />
      </motion.div>
    </div>
  );
}
