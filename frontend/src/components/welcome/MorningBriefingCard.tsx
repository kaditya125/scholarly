import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { Sparkles, Target, Trophy } from 'lucide-react';

interface Props {
  briefing: BriefingResponse;
}

export function MorningBriefingCard({ briefing }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="col-span-full md:col-span-8 lg:col-span-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl"
    >
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>

      <div className="relative z-10 flex flex-col h-full justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4 text-white/80 font-medium text-sm tracking-wider uppercase">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>AI Learning Briefing</span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
            {briefing.welcomeMessage.greeting}
          </h1>
          
          <p className="text-indigo-100 text-lg sm:text-xl mb-6 max-w-lg">
            {briefing.welcomeMessage.overview}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-6">
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
            <div className="bg-indigo-400/30 p-2 rounded-lg">
              <Target className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <p className="text-xs text-indigo-200">Target Exam</p>
              <p className="font-semibold">{briefing.welcomeMessage.examContext}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
            <div className="bg-indigo-400/30 p-2 rounded-lg">
              <Trophy className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <p className="text-xs text-indigo-200">Mastery Goal</p>
              <p className="font-semibold">{briefing.learningAnalytics.masteryPercentage}% Reached</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
