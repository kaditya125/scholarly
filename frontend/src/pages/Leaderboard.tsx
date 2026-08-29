import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Crown,
  Flame,
  Zap,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Search,
  Sparkles,
  Info,
  Target,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLeaderboard } from "../hooks/api/useLeaderboard";
import { useUserStats } from "../hooks/api/useUserStats";
import { useProfile } from "../hooks/api/useProfile";
import { useAuth } from "../lib/AuthContext";
import { cn } from "../lib/utils";

const ACCENT = "#c8e558";
const PAGE_SIZE = 10;

const EXAM_FILTERS = [
  { label: "All Scholars", value: "ALL" },
  { label: "NEET", value: "NEET" },
  { label: "JEE", value: "JEE" },
  { label: "UPSC", value: "UPSC" },
  { label: "SSC", value: "SSC" },
  { label: "Banking", value: "IBPS" },
  { label: "State PSC", value: "BPSC" },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { leaderboard, isLoading } = useLeaderboard(100, selectedExam);

  // Filter by search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return leaderboard;
    const q = searchQuery.toLowerCase().trim();
    return leaderboard.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        (e.targetExam && e.targetExam.toLowerCase().includes(q))
    );
  }, [leaderboard, searchQuery]);

  // Pagination calculations
  const totalItems = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedList = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, safePage]);

  // Current user's stats
  const currentUserXP = stats?.gamification?.xp || 0;
  const currentUserStreak = stats?.gamification?.studyStreakDays || 0;
  const currentUserLevel = stats?.gamification?.level || 1;
  const currentUserTier = stats?.gamification?.rank || "Bronze";

  const currentUserRankIndex = useMemo(() => {
    if (!user) return -1;
    return leaderboard.findIndex((item) => item.userId === user.uid);
  }, [leaderboard, user]);

  const currentUserRank = currentUserRankIndex !== -1 ? currentUserRankIndex + 1 : stats?.overallRank || "—";

  const topThree = useMemo(() => {
    if (safePage !== 1 || searchQuery.trim()) return [];
    return filteredList.slice(0, 3);
  }, [safePage, searchQuery, filteredList]);

  const tableList = useMemo(() => {
    if (safePage === 1 && !searchQuery.trim() && topThree.length > 0) {
      return paginatedList.slice(3);
    }
    return paginatedList;
  }, [safePage, searchQuery, topThree, paginatedList]);

  return (
    <div className="w-full h-full overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#f8fafc] dark:bg-[#131417] text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">
      <div className="max-w-[880px] mx-auto space-y-6 pb-20">
        
        {/* ══ Minimal Header ═══════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/70 dark:border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11.5px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                Season 1 · Live Ranking
              </span>
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-bold text-slate-950 dark:text-white tracking-[-0.03em] flex items-center gap-2.5">
              <Award className="w-6 h-6 text-amber-500 shrink-0" />
              Scholar Leaderboard
            </h1>
          </div>

          <Link
            to="/tests"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-900 shadow-2xs hover:scale-[1.02] active:scale-[0.98] transition-transform self-start sm:self-auto"
            style={{ background: ACCENT }}
          >
            <Zap className="w-3.5 h-3.5 fill-slate-900" />
            <span>Practice & Earn XP</span>
          </Link>
        </div>

        {/* ══ Current User Standing (Sleek Bar) ════════════════════════════ */}
        {user && (
          <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1b20] p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/10 flex items-center justify-center font-bold text-base text-slate-800 dark:text-gray-200 shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <span>{(profile?.name || user.displayName || user.email || 'S')[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[15px] text-slate-900 dark:text-white">
                      {profile?.name || user.displayName || 'You'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-gray-400">
                      {profile?.targetExam || 'General'}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-400 dark:text-gray-400 mt-0.5">
                    Level {currentUserLevel} · {currentUserTier} Tier
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-5 sm:gap-7 self-end sm:self-auto text-right">
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400">Rank</p>
                  <p className="text-[17px] font-bold text-slate-900 dark:text-white">#{currentUserRank}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400">Total XP</p>
                  <p className="text-[17px] font-bold text-amber-500">{currentUserXP.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400">Streak</p>
                  <p className="text-[17px] font-bold text-rose-500 flex items-center gap-1 justify-end">
                    <Flame className="w-3.5 h-3.5 fill-rose-500" /> {currentUserStreak}d
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ Controls: Category Filter + Search ═══════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {EXAM_FILTERS.map((f) => {
              const isSelected = selectedExam === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => {
                    setSelectedExam(f.value);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[12.5px] font-medium transition-all cursor-pointer whitespace-nowrap",
                    isSelected
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold shadow-2xs"
                      : "bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.08] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative shrink-0 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search scholar..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12.5px] bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.08] text-slate-800 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#c8e558]"
            />
          </div>
        </div>

        {/* ══ Content Loading / Table ══════════════════════════════════════ */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558] mb-2.5" />
            <p className="text-[13.5px] text-slate-400">Loading rankings...</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* ══ Sleek Top 3 Cards (Shown only on Page 1 without search) ══ */}
            {topThree.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {/* #1 Leader */}
                {topThree[0] && (
                  <div className="sm:order-2 rounded-2xl border-2 border-amber-300 dark:border-amber-500/40 bg-white dark:bg-[#1a1b20] p-4 text-center relative shadow-xs">
                    <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center mx-auto absolute -top-3 left-1/2 -translate-x-1/2 shadow-xs">
                      1
                    </div>
                    <div className="w-14 h-14 rounded-2xl mx-auto mt-1 mb-2.5 overflow-hidden border border-amber-200 dark:border-amber-500/30">
                      <img src={topThree[0].avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h4 className="font-bold text-[14.5px] text-slate-900 dark:text-white truncate">
                      {topThree[0].name}
                    </h4>
                    <p className="text-[11.5px] text-amber-600 dark:text-amber-400 truncate mb-2">
                      {topThree[0].targetExam || topThree[0].handle}
                    </p>
                    <p className="text-[16px] font-black text-amber-500">{Number(topThree[0].points).toLocaleString()} XP</p>
                  </div>
                )}

                {/* #2 */}
                {topThree[1] && (
                  <div className="sm:order-1 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1b20] p-4 text-center relative shadow-2xs">
                    <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white font-bold text-xs flex items-center justify-center mx-auto absolute -top-3 left-1/2 -translate-x-1/2 shadow-xs">
                      2
                    </div>
                    <div className="w-12 h-12 rounded-2xl mx-auto mt-1 mb-2.5 overflow-hidden border border-slate-200 dark:border-white/10">
                      <img src={topThree[1].avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h4 className="font-bold text-[14px] text-slate-900 dark:text-white truncate">
                      {topThree[1].name}
                    </h4>
                    <p className="text-[11.5px] text-slate-400 dark:text-gray-400 truncate mb-2">
                      {topThree[1].targetExam || topThree[1].handle}
                    </p>
                    <p className="text-[15px] font-bold text-amber-500">{Number(topThree[1].points).toLocaleString()} XP</p>
                  </div>
                )}

                {/* #3 */}
                {topThree[2] && (
                  <div className="sm:order-3 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1b20] p-4 text-center relative shadow-2xs">
                    <div className="w-6 h-6 rounded-full bg-amber-600/70 text-white font-bold text-xs flex items-center justify-center mx-auto absolute -top-3 left-1/2 -translate-x-1/2 shadow-xs">
                      3
                    </div>
                    <div className="w-12 h-12 rounded-2xl mx-auto mt-1 mb-2.5 overflow-hidden border border-slate-200 dark:border-white/10">
                      <img src={topThree[2].avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h4 className="font-bold text-[14px] text-slate-900 dark:text-white truncate">
                      {topThree[2].name}
                    </h4>
                    <p className="text-[11.5px] text-slate-400 dark:text-gray-400 truncate mb-2">
                      {topThree[2].targetExam || topThree[2].handle}
                    </p>
                    <p className="text-[15px] font-bold text-amber-500">{Number(topThree[2].points).toLocaleString()} XP</p>
                  </div>
                )}
              </div>
            )}

            {/* ══ Rankings Table ═══════════════════════════════════════════ */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1a1b20] overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] text-left">
                  <thead className="bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06] text-slate-400 dark:text-gray-400 uppercase font-medium text-[10.5px] tracking-wider">
                    <tr>
                      <th className="px-4 sm:px-5 py-3 w-16">Rank</th>
                      <th className="px-4 sm:px-5 py-3">Scholar</th>
                      <th className="px-3 py-3 hidden sm:table-cell">Target Exam</th>
                      <th className="px-3 py-3 hidden md:table-cell text-center">Streak</th>
                      <th className="px-4 sm:px-5 py-3 text-right">XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {tableList.map((entry) => {
                      const isMe = user?.uid === entry.userId;
                      return (
                        <tr
                          key={entry.userId}
                          className={cn(
                            "transition-colors",
                            isMe
                              ? "bg-[#f7fbe6] dark:bg-[#c8e558]/10"
                              : "hover:bg-slate-50/50 dark:hover:bg-white/[0.015]"
                          )}
                        >
                          <td className="px-4 sm:px-5 py-3.5 font-bold text-slate-400 dark:text-gray-400">
                            #{entry.rank}
                          </td>
                          <td className="px-4 sm:px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <img
                                src={entry.avatar}
                                alt=""
                                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 object-cover shrink-0"
                              />
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{entry.name}</span>
                                  {isMe && (
                                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-[#8ba32b] text-white">
                                      YOU
                                    </span>
                                  )}
                                </p>
                                <p className="text-slate-400 dark:text-gray-400 text-[11.5px]">{entry.handle}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 hidden sm:table-cell text-slate-600 dark:text-gray-300">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] bg-slate-100 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/10 font-medium">
                              {entry.targetExam || "General Prep"}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 hidden md:table-cell text-center">
                            {entry.streakDays ? (
                              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-rose-500">
                                <Flame className="w-3 h-3 fill-rose-500" /> {entry.streakDays}d
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 text-right font-bold text-amber-500 text-[13.5px]">
                            {Number(entry.points).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}

                    {tableList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-14 text-center text-slate-400">
                          <Users className="w-7 h-7 text-slate-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-sm font-medium">No scholars found matching your criteria.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ══ Minimalist Pagination Bar ════════════════════════════════ */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 px-1 text-[12.5px] text-slate-500 dark:text-gray-400">
                <span>
                  Showing {Math.min((safePage - 1) * PAGE_SIZE + 1, totalItems)}–{Math.min(safePage * PAGE_SIZE, totalItems)} of {totalItems} scholars
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1a1b20] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <span className="px-2 font-medium">
                    {safePage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1a1b20] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ══ How Rankings & XP Work ═══════════════════════════════════ */}
            <div className="mt-8 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1a1b20] p-5 sm:p-6 shadow-2xs">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
                <h3 className="font-semibold text-[14.5px] text-slate-900 dark:text-white">
                  How Leaderboard Rankings & XP Work
                </h3>
              </div>
              <p className="text-[13px] text-slate-500 dark:text-gray-400 leading-relaxed mb-4">
                XP (Experience Points) reflect your continuous effort and mastery across Sadhya. Your leaderboard rank updates live whenever you practice or study.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white mb-1">
                    <Target className="w-3.5 h-3.5 text-blue-500" />
                    <span>Mock Tests & Practice</span>
                  </div>
                  <p className="text-slate-500 dark:text-gray-400 leading-snug">
                    <strong className="text-slate-800 dark:text-slate-200">+50 XP</strong> for completing a test, plus <strong className="text-amber-500">+20 XP bonus</strong> for accuracy ≥ 75%.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Quizzes & Flashcards</span>
                  </div>
                  <p className="text-slate-500 dark:text-gray-400 leading-snug">
                    <strong className="text-slate-800 dark:text-slate-200">+30 XP</strong> per completed chapter quiz or revision deck with instant review.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white mb-1">
                    <Flame className="w-3.5 h-3.5 text-rose-500" />
                    <span>Daily Streaks & Tiers</span>
                  </div>
                  <p className="text-slate-500 dark:text-gray-400 leading-snug">
                    Every 100 XP levels you up. Progress through <strong className="text-slate-800 dark:text-slate-200">Bronze → Silver → Gold → Platinum → Diamond</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
