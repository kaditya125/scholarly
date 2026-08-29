import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Crown,
  Medal,
  Flame,
  Sparkles,
  Target,
  Zap,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Filter,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLeaderboard } from "../hooks/api/useLeaderboard";
import { useUserStats } from "../hooks/api/useUserStats";
import { useProfile } from "../hooks/api/useProfile";
import { useAuth } from "../lib/AuthContext";
import { cn } from "../lib/utils";

const ACCENT = "#c8e558";

const EXAM_FILTERS = [
  { label: "All Scholars", value: "ALL" },
  { label: "NEET UG", value: "NEET" },
  { label: "JEE Main", value: "JEE" },
  { label: "UPSC CSE", value: "UPSC" },
  { label: "SSC CGL", value: "SSC" },
  { label: "Banking & PO", value: "IBPS" },
  { label: "State PSC", value: "BPSC" },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const [selectedExam, setSelectedExam] = useState<string>("ALL");

  const { leaderboard, isLoading, isRefetching } = useLeaderboard(100, selectedExam);

  // Current user's stats
  const currentUserXP = stats?.gamification?.xp || 0;
  const currentUserStreak = stats?.gamification?.studyStreakDays || 0;
  const currentUserLevel = stats?.gamification?.level || 1;
  const currentUserTier = stats?.gamification?.rank || "Bronze";

  // Find user in leaderboard
  const currentUserRankIndex = useMemo(() => {
    if (!user) return -1;
    return leaderboard.findIndex((item) => item.userId === user.uid);
  }, [leaderboard, user]);

  const currentUserRank = currentUserRankIndex !== -1 ? currentUserRankIndex + 1 : stats?.overallRank || "-";

  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="w-full h-full overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#fafbfc] dark:bg-[#0b0b0c] text-slate-900 dark:text-white transition-colors duration-300 font-sans">
      <div className="max-w-[1040px] mx-auto space-y-8 pb-16">
        
        {/* ══ Header ══════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-[#c8e558]/20 dark:bg-[#c8e558]/15 text-[#556b12] dark:text-[#c8e558] border border-[#c8e558]/30">
                <Sparkles className="w-3.5 h-3.5" /> Season 1 · Active
              </span>
            </div>
            <h1 className="text-[26px] sm:text-[32px] font-bold text-slate-950 dark:text-white tracking-[-0.03em] flex items-center gap-3">
              <Award className="w-8 h-8 text-amber-500 shrink-0" />
              National Scholar Leaderboard
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-gray-400 mt-1">
              Rankings updated live from AI diagnostic tests, practice drills, and daily study streaks.
            </p>
          </div>

          <Link
            to="/tests"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[13.5px] text-slate-900 shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-transform self-start sm:self-auto"
            style={{ background: ACCENT }}
          >
            <Zap className="w-4 h-4 fill-slate-900" />
            <span>Earn XP with Practice</span>
          </Link>
        </div>

        {/* ══ Current User Standing Banner ═══════════════════════════════ */}
        {user && (
          <div className="rounded-3xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111113] p-5 sm:p-6 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#c8e558]/10 dark:bg-[#c8e558]/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold text-xl flex items-center justify-center shadow-md shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <span>{(profile?.name || user.displayName || user.email || 'S')[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[17px] text-slate-900 dark:text-white">
                      {profile?.name || user.displayName || 'Your Standing'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-300">
                      {profile?.targetExam || 'Scholar'}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-0.5">
                    Tier: <strong className="text-amber-600 dark:text-amber-400">{currentUserTier}</strong> · Level {currentUserLevel}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-6 border-t md:border-t-0 md:border-l border-slate-100 dark:border-white/[0.08] pt-4 md:pt-0 md:pl-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rank</p>
                  <p className="text-[20px] font-extrabold text-slate-900 dark:text-white mt-0.5">#{currentUserRank}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total XP</p>
                  <p className="text-[20px] font-extrabold text-amber-500 mt-0.5">{currentUserXP.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Streak</p>
                  <p className="text-[20px] font-extrabold text-rose-500 flex items-center gap-1 mt-0.5">
                    <Flame className="w-4 h-4 fill-rose-500" /> {currentUserStreak}d
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ Exam Filter Pills ═══════════════════════════════════════════ */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 shrink-0">
            {EXAM_FILTERS.map((filter) => {
              const isSelected = selectedExam === filter.value;
              return (
                <button
                  key={filter.value}
                  onClick={() => setSelectedExam(filter.value)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all cursor-pointer whitespace-nowrap",
                    isSelected
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                      : "bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20"
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══ Loading State ═══════════════════════════════════════════════ */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-9 h-9 animate-spin text-[#8ba32b] dark:text-[#c8e558] mb-3" />
            <p className="text-[14.5px] font-medium text-slate-500 dark:text-gray-400">Loading scholar rankings...</p>
          </div>
        ) : (
          <>
            {/* ══ Top 3 Podium ═════════════════════════════════════════════ */}
            {topThree.length > 0 && (
              <div className="flex flex-row items-end justify-center gap-2 sm:gap-6 pt-10 pb-4">
                
                {/* 🥈 Rank 2 */}
                {topThree[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col items-center flex-1 max-w-[210px]"
                  >
                    <div className="relative mb-3">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-slate-300 dark:border-slate-600 overflow-hidden shadow-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <img src={topThree[1].avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-white dark:border-[#0b0b0c] shadow-sm">
                        2
                      </div>
                    </div>
                    <h3 className="font-bold text-center text-[14px] sm:text-[15px] truncate w-full px-1 text-slate-900 dark:text-white">
                      {topThree[1].name}
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500 truncate max-w-full mb-2">
                      {topThree[1].targetExam || topThree[1].handle}
                    </span>
                    <div className="px-3 py-3 bg-white dark:bg-[#111113] w-full text-center rounded-t-2xl border-t border-x border-slate-200 dark:border-white/10 pb-6 shadow-2xs">
                      <p className="font-extrabold text-[15px] sm:text-[17px] text-amber-500">{Number(topThree[1].points).toLocaleString()} XP</p>
                      {topThree[1].streakDays ? (
                        <p className="text-[11px] font-semibold text-rose-500 flex items-center justify-center gap-0.5 mt-0.5">
                          <Flame className="w-3 h-3 fill-rose-500" /> {topThree[1].streakDays}d streak
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                )}

                {/* 👑 Rank 1 */}
                {topThree[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center flex-1 max-w-[240px] z-10 -mt-6"
                  >
                    <div className="relative mb-4">
                      <Crown className="w-7 h-7 sm:w-9 sm:h-9 text-amber-400 absolute -top-8 sm:-top-9 left-1/2 -translate-x-1/2 drop-shadow-md animate-bounce" />
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border-4 border-amber-400 overflow-hidden shadow-xl shadow-amber-500/20 bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                        <img src={topThree[0].avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-gradient-to-br from-amber-300 to-amber-500 rounded-full flex items-center justify-center text-white font-black text-sm border-2 border-white dark:border-[#0b0b0c] shadow-md">
                        1
                      </div>
                    </div>
                    <h3 className="font-bold text-center text-[15px] sm:text-[17px] truncate w-full px-1 text-slate-950 dark:text-white">
                      {topThree[0].name}
                    </h3>
                    <span className="text-[11.5px] font-medium text-amber-600 dark:text-amber-400 truncate max-w-full mb-2">
                      {topThree[0].targetExam || topThree[0].handle}
                    </span>
                    <div className="px-4 py-4 bg-white dark:bg-[#111113] w-full text-center rounded-t-3xl border-t border-x border-amber-300 dark:border-amber-500/30 pb-10 shadow-md">
                      <p className="font-black text-[18px] sm:text-[22px] text-amber-500">{Number(topThree[0].points).toLocaleString()} XP</p>
                      {topThree[0].streakDays ? (
                        <p className="text-[11.5px] font-bold text-rose-500 flex items-center justify-center gap-0.5 mt-1">
                          <Flame className="w-3.5 h-3.5 fill-rose-500" /> {topThree[0].streakDays}d streak
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                )}

                {/* 🥉 Rank 3 */}
                {topThree[2] && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center flex-1 max-w-[210px]"
                  >
                    <div className="relative mb-3">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-amber-600/60 dark:border-amber-600/40 overflow-hidden shadow-lg bg-amber-100/50 dark:bg-amber-950/30 flex items-center justify-center">
                        <img src={topThree[2].avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 bg-amber-700 dark:bg-amber-800 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-white dark:border-[#0b0b0c] shadow-sm">
                        3
                      </div>
                    </div>
                    <h3 className="font-bold text-center text-[14px] sm:text-[15px] truncate w-full px-1 text-slate-900 dark:text-white">
                      {topThree[2].name}
                    </h3>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500 truncate max-w-full mb-2">
                      {topThree[2].targetExam || topThree[2].handle}
                    </span>
                    <div className="px-3 py-3 bg-white dark:bg-[#111113] w-full text-center rounded-t-2xl border-t border-x border-slate-200 dark:border-white/10 pb-4 shadow-2xs">
                      <p className="font-extrabold text-[15px] sm:text-[17px] text-amber-500">{Number(topThree[2].points).toLocaleString()} XP</p>
                      {topThree[2].streakDays ? (
                        <p className="text-[11px] font-semibold text-rose-500 flex items-center justify-center gap-0.5 mt-0.5">
                          <Flame className="w-3 h-3 fill-rose-500" /> {topThree[2].streakDays}d streak
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                )}

              </div>
            )}

            {/* ══ Rest of the Table (#4 to #100) ═══════════════════════════ */}
            <div className="bg-white dark:bg-[#111113] border border-slate-200/90 dark:border-white/10 rounded-3xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] text-left">
                  <thead className="bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06] text-slate-400 dark:text-gray-500 uppercase font-semibold text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 sm:px-6 py-3.5">Rank</th>
                      <th className="px-5 sm:px-6 py-3.5">Scholar</th>
                      <th className="px-4 py-3.5 hidden sm:table-cell">Target Exam</th>
                      <th className="px-4 py-3.5 hidden md:table-cell text-center">Streak</th>
                      <th className="px-5 sm:px-6 py-3.5 text-right">XP Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {rest.map((entry) => {
                      const isMe = user?.uid === entry.userId;
                      return (
                        <tr
                          key={entry.userId}
                          className={cn(
                            "transition-colors",
                            isMe
                              ? "bg-[#f7fbe6] dark:bg-[#c8e558]/10 font-medium"
                              : "hover:bg-slate-50/60 dark:hover:bg-white/[0.02]"
                          )}
                        >
                          <td className="px-5 sm:px-6 py-4 font-bold text-slate-500 dark:text-gray-400">
                            #{entry.rank}
                          </td>
                          <td className="px-5 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={entry.avatar}
                                alt=""
                                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 object-cover shrink-0"
                              />
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{entry.name}</span>
                                  {isMe && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#8ba32b] text-white">
                                      YOU
                                    </span>
                                  )}
                                </p>
                                <p className="text-slate-400 dark:text-gray-500 text-xs">{entry.handle}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden sm:table-cell text-slate-600 dark:text-gray-300 font-medium">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs bg-slate-100 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/10">
                              {entry.targetExam || "General Prep"}
                            </span>
                          </td>
                          <td className="px-4 py-4 hidden md:table-cell text-center">
                            {entry.streakDays ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-500">
                                <Flame className="w-3.5 h-3.5 fill-rose-500" /> {entry.streakDays}d
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-5 sm:px-6 py-4 text-right font-extrabold text-amber-500 text-[14.5px]">
                            {Number(entry.points).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}

                    {rest.length === 0 && topThree.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-slate-500 dark:text-gray-400">
                          <Users className="w-8 h-8 text-slate-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="font-medium">No scholars found for this filter yet.</p>
                          <p className="text-xs text-slate-400 mt-1">Take a practice quiz to be the first on the board!</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
