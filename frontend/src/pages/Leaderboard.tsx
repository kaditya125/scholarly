import { useState } from "react";
import { Link } from "react-router-dom";
import { Award, TrendingUp, TrendingDown, Minus, Crown, Medal, User, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useLeaderboard } from "../hooks/api/useLeaderboard";

export default function Leaderboard() {
  const { leaderboard, isLoading } = useLeaderboard(100);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-[1000px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Award className="w-8 h-8 text-amber-500" />
              Global Leaderboard
            </h1>
            <p className="text-slate-500 mt-1">Rankings based on XP earned through study and community contribution.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium px-4 py-2 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 rounded-full">
              Season 1 Active
            </span>
          </div>
        </div>

        {/* Top 3 Podium */}
        {topThree.length > 0 && (
          <div className="flex flex-col md:flex-row items-end justify-center gap-4 md:gap-8 pt-12 pb-8">
            
            {/* Rank 2 */}
            {topThree[1] && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center flex-1 max-w-[200px]"
              >
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full border-4 border-slate-300 dark:border-slate-600 overflow-hidden shadow-lg">
                    <img src={topThree[1].avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center text-white font-bold border-2 border-white dark:border-slate-900 shadow-sm">
                    2
                  </div>
                </div>
                <h3 className="font-bold text-center truncate w-full">{topThree[1].name}</h3>
                <p className="text-sm text-slate-500 mb-2">{topThree[1].handle}</p>
                <div className="px-4 py-3 bg-white dark:bg-slate-900 w-full text-center rounded-t-2xl border-t border-x border-slate-200 dark:border-slate-800 pb-8 mt-2 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
                  <p className="font-bold text-lg text-amber-500">{topThree[1].points} XP</p>
                </div>
              </motion.div>
            )}

            {/* Rank 1 */}
            {topThree[0] && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center flex-1 max-w-[240px] z-10"
              >
                <div className="relative mb-6">
                  <Crown className="w-8 h-8 text-amber-400 absolute -top-8 left-1/2 -translate-x-1/2 drop-shadow-md" />
                  <div className="w-28 h-28 rounded-full border-4 border-amber-400 overflow-hidden shadow-xl shadow-amber-500/20">
                    <img src={topThree[0].avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-10 h-10 bg-gradient-to-br from-amber-300 to-amber-500 rounded-full flex items-center justify-center text-white font-bold text-lg border-2 border-white dark:border-slate-900 shadow-sm">
                    1
                  </div>
                </div>
                <h3 className="font-bold text-xl text-center truncate w-full">{topThree[0].name}</h3>
                <p className="text-sm text-slate-500 mb-2">{topThree[0].handle}</p>
                <div className="px-4 py-4 bg-white dark:bg-slate-900 w-full text-center rounded-t-3xl border-t border-x border-amber-200 dark:border-amber-900/50 pb-12 mt-2 shadow-[0_-8px_30px_-15px_rgba(245,158,11,0.3)]">
                  <p className="font-bold text-2xl text-amber-500">{topThree[0].points} XP</p>
                </div>
              </motion.div>
            )}

            {/* Rank 3 */}
            {topThree[2] && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center flex-1 max-w-[200px]"
              >
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full border-4 border-orange-400 dark:border-orange-600/50 overflow-hidden shadow-lg">
                    <img src={topThree[2].avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-orange-400 dark:bg-orange-600 rounded-full flex items-center justify-center text-white font-bold border-2 border-white dark:border-slate-900 shadow-sm">
                    3
                  </div>
                </div>
                <h3 className="font-bold text-center truncate w-full">{topThree[2].name}</h3>
                <p className="text-sm text-slate-500 mb-2">{topThree[2].handle}</p>
                <div className="px-4 py-3 bg-white dark:bg-slate-900 w-full text-center rounded-t-2xl border-t border-x border-slate-200 dark:border-slate-800 pb-6 mt-2 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
                  <p className="font-bold text-lg text-amber-500">{topThree[2].points} XP</p>
                </div>
              </motion.div>
            )}

          </div>
        )}

        {/* Rest of the List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase font-medium">
                <tr>
                  <th className="px-6 py-4 rounded-tl-3xl">Rank</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Trend</th>
                  <th className="px-6 py-4 text-right rounded-tr-3xl">XP Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {rest.map((user) => (
                  <tr key={user.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-500">
                      #{user.rank}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                          <p className="text-slate-500 text-xs">{user.handle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.rankTrend === 'up' && <TrendingUp className="w-5 h-5 text-emerald-500" />}
                      {user.rankTrend === 'down' && <TrendingDown className="w-5 h-5 text-rose-500" />}
                      {user.rankTrend === 'same' && <Minus className="w-5 h-5 text-slate-300 dark:text-slate-600" />}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-amber-500">
                      {user.points}
                    </td>
                  </tr>
                ))}
                {rest.length === 0 && topThree.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No leaderboard data available yet. Start studying to earn XP!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
