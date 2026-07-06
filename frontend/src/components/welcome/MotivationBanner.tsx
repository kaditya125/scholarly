import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { Quote } from 'lucide-react';

interface Props {
  motivation: BriefingResponse['motivation'];
  delay?: number;
}

export function MotivationBanner({ motivation, delay = 0.5 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay, type: "spring", bounce: 0.4 }}
      className="col-span-full bg-gradient-to-r from-yellow-400/20 via-orange-400/20 to-red-400/20 border border-yellow-500/30 dark:border-yellow-500/20 rounded-2xl p-6 relative overflow-hidden"
    >
      <div className="absolute top-4 left-4 opacity-20">
        <Quote className="w-12 h-12 text-yellow-600 dark:text-yellow-400" />
      </div>
      
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white max-w-3xl leading-relaxed">
          "{motivation.message}"
        </p>
      </div>
    </motion.div>
  );
}
