import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trophy, Clock, Gem, ArrowUp, ArrowDown, Minus, Search, X, Activity, Award, Target, CheckCircle2, Bookmark, MessagesSquare, SearchX } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { cn } from "../lib/utils";
import { api } from "../lib/api/client";

type UserData = {
  id: number;
  name: string;
  followers: string;
  points: string;
  reward: number;
  prize?: string;
  avatar: string;
  rank: number;
  handle: string;
  rankTrend: string;
  scoreTrend: string;
  isCurrentUser?: boolean;
};

export default function Leaderboard() {
  const [filter, setFilter] = useState("Daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [modalTab, setModalTab] = useState<"Overview"|"Shared Activity">("Overview");
  const [leaderboardData, setLeaderboardData] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await api.get('/leaderboard');
        setLeaderboardData(response.data);
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

const radarMockData = [
  { subject: 'Math', peer: 95, you: 80, fullMark: 100 },
  { subject: 'Science', peer: 85, you: 90, fullMark: 100 },
  { subject: 'History', peer: 80, you: 75, fullMark: 100 },
  { subject: 'English', peer: 90, you: 85, fullMark: 100 },
  { subject: 'Logic', peer: 75, you: 80, fullMark: 100 },
];



  const handleSelectUser = (user: UserData) => {
    setSelectedUser(user);
    setModalTab("Overview");
  };

  const filteredList = leaderboardData.length > 3 ? leaderboardData.slice(3).filter((user) => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    user.handle.toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  if (isLoading) {
    return <div className="flex items-center justify-center w-full h-full text-white">Loading...</div>;
  }

  return (
    <div className="flex flex-col relative w-full h-full pb-10">
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-full max-w-[850px] h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none blur-3xl" />
      
      <div className="max-w-[850px] mx-auto w-full flex-1 flex flex-col pt-8 relative z-10">
          
          <div className="flex flex-col md:flex-row items-center justify-between mb-10 px-6 gap-6">
             <div>
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">TRE 4.0 - Primary Teacher Mock #1</h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-[12px] mt-0.5">Leaderboards</p>
             </div>

             <div className="flex bg-[#f1f3f5] dark:bg-[#171a25] rounded-xl p-1 shadow-sm w-max shrink-0">
               {["Daily", "Monthly"].map(tab => (
                 <button 
                   key={tab} 
                   onClick={() => setFilter(tab)}
                   className={cn(
                     "px-8 py-2 text-[13px] font-semibold rounded-lg transition-colors",
                     filter === tab 
                       ? "bg-white dark:bg-[#202538] text-slate-900 dark:text-white shadow-sm" 
                       : "text-slate-500 dark:text-[#6a7391] hover:text-slate-700 dark:hover:text-[#8d96b8]"
                   )}
                 >
                   {tab}
                 </button>
               ))}
             </div>
          </div>

          <div className="flex justify-center items-end gap-5 mb-8 w-full px-6">
             <div 
                className="flex flex-col items-center flex-1 max-w-[200px] cursor-pointer group"
                onClick={() => handleSelectUser(leaderboardData[1])}
             >
                <div className="w-[56px] h-[56px] rounded-[16px] overflow-hidden border border-slate-200 dark:border-[#2a2f42] mb-3 shadow-lg bg-slate-100 dark:bg-[#1a1f33] group-hover:scale-105 transition-transform duration-300">
                  <img src={leaderboardData[1].avatar} alt="Rank 2" className="w-full h-full object-cover" />
                </div>
                <div className="text-[14px] font-bold text-slate-900 dark:text-white mb-3 tracking-tight group-hover:text-blue-500 transition-colors">{leaderboardData[1].name}</div>
                
                <div className="w-full h-[140px] bg-white dark:bg-gradient-to-b dark:from-[#2a3048] dark:to-[#161925] border-t border-slate-200 dark:border-[#414a66]/50 rounded-2xl flex flex-col items-center py-4 shadow-lg relative mt-auto border-x border-b group-hover:border-blue-400/50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-2">
                    <Trophy className="w-3.5 h-3.5 text-slate-400 fill-slate-300 dark:text-slate-400 dark:fill-slate-500" />
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-3">Earn 2,000 points</div>
                  
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gem className="w-4 h-4 text-blue-500 fill-blue-500/20" />
                    <span className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">{leaderboardData[1].prize}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Prize</div>
                </div>
             </div>

             <div 
                className="flex flex-col items-center flex-1 max-w-[220px] cursor-pointer group"
                onClick={() => handleSelectUser(leaderboardData[0])}
             >
                <div className="w-[72px] h-[72px] rounded-[20px] overflow-hidden border border-yellow-200 dark:border-[#2a2f42] mb-3 shadow-xl bg-slate-100 dark:bg-[#1a1f33] group-hover:scale-105 transition-transform duration-300">
                  <img src={leaderboardData[0].avatar} alt="Rank 1" className="w-full h-full object-cover" />
                </div>
                <div className="text-[16px] font-bold text-slate-900 dark:text-white mb-3 tracking-tight group-hover:text-yellow-500 transition-colors">{leaderboardData[0].name}</div>
                
                <div className="w-full h-[190px] bg-gradient-to-b from-yellow-50 to-white dark:from-[#2a3048] dark:to-[#161925] border-t border-yellow-200 dark:border-[#414a66]/50 border-x border-b border-slate-200 dark:border-transparent rounded-2xl flex flex-col items-center py-5 shadow-xl relative group-hover:border-yellow-400 border-x group-hover:border-b-yellow-400 group-hover:border-x-yellow-400 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center mb-2">
                    <Trophy className="w-4 h-4 text-yellow-600 dark:text-yellow-500 fill-yellow-500 dark:fill-yellow-500" />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mb-4">Earn 2,000 points</div>
                  
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gem className="w-5 h-5 text-blue-500 fill-blue-500/20" />
                    <span className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">{leaderboardData[0].prize}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-auto">Prize</div>
                  
                  <div className="flex flex-col items-center mt-3 w-full">
                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 mb-1" />
                    <div className="text-[9px] text-slate-500 dark:text-[#798199] font-medium tracking-wide uppercase">Ends in</div>
                    <div className="text-[10px] font-bold text-slate-800 dark:text-white mt-0.5 uppercase tracking-wider">10d 23h 59m 29s</div>
                  </div>
                </div>
             </div>

             <div 
                className="flex flex-col items-center flex-1 max-w-[200px] cursor-pointer group"
                onClick={() => handleSelectUser(leaderboardData[2])}
             >
                <div className="w-[56px] h-[56px] rounded-[16px] overflow-hidden border border-slate-200 dark:border-[#2a2f42] mb-3 shadow-lg bg-slate-100 dark:bg-[#1a1f33] group-hover:scale-105 transition-transform duration-300">
                  <img src={leaderboardData[2].avatar} alt="Rank 3" className="w-full h-full object-cover" />
                </div>
                <div className="text-[14px] font-bold text-slate-900 dark:text-white mb-3 tracking-tight group-hover:text-orange-500 transition-colors">{leaderboardData[2].name}</div>
                
                <div className="w-full h-[140px] bg-white dark:bg-gradient-to-b dark:from-[#2a3048] dark:to-[#161925] border-t border-slate-200 dark:border-[#414a66]/50 rounded-2xl flex flex-col items-center py-4 shadow-lg relative mt-auto border-x border-b group-hover:border-orange-400/50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mb-2">
                    <Trophy className="w-3.5 h-3.5 text-orange-600 dark:text-orange-500 fill-orange-400 dark:fill-orange-600/80" />
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mb-3">Earn 2,000 points</div>
                  
                  <div className="flex items-center gap-1.5 mb-1">
                    <Gem className="w-4 h-4 text-blue-500 fill-blue-500/20" />
                    <span className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">{leaderboardData[2].prize}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Prize</div>
                </div>
             </div>
          </div>

          <div className="max-w-max mx-auto px-6 py-2.5 bg-white dark:bg-[#1a1f33]/80 rounded-full border border-slate-200 dark:border-[#2a3048] text-[13px] text-slate-600 dark:text-[#b4badd] shadow-sm flex items-center gap-1.5 mb-10">
            You earned <Gem className="w-3.5 h-3.5 text-blue-500 fill-blue-500/20" /> <span className="font-bold text-slate-900 dark:text-white mx-0.5">5</span> today and we ranked - out of <span className="font-bold text-slate-900 dark:text-white mx-0.5">23141 users</span>
          </div>

          <div className="px-6 mb-6 flex flex-col gap-4">
             <div className="relative w-full max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search students or groups..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1a1f33] border border-slate-200 dark:border-[#2a3048] rounded-xl text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                />
             </div>
             
             <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-slate-500 dark:text-[#798199] mr-1">Recent Filters:</span>
                {[
                  { id: 1, label: 'Math • Hard' },
                  { id: 2, label: 'Science • Medium' },
                  { id: 3, label: 'History • Expert' },
                ].map(f => {
                  const isSelected = f.label === 'Math • Hard'; // Just a visual mock for the selected state
                  return (
                  <button 
                    key={f.id}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-[11px] font-medium transition-colors shadow-sm",
                      isSelected
                       ? "border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                       : "border-slate-200 dark:border-[#2a3048] bg-white dark:bg-[#1a1f33]/60 hover:bg-slate-50 dark:hover:bg-[#1a1f33] text-slate-600 dark:text-[#b4badd]"
                    )}
                  >
                    {f.label}
                  </button>
                )})}
             </div>
          </div>

          {/* List */}
          <div className="w-full flex-1 flex flex-col">
             <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[12px] font-semibold text-slate-500 dark:text-[#798199] border-b border-transparent">
                <div className="col-span-1">Rank</div>
                <div className="col-span-5">User name</div>
                <div className="col-span-2">Followers</div>
                <div className="col-span-2">Point</div>
                <div className="col-span-2">Reward</div>
             </div>
             
             <div className="flex-1 flex flex-col gap-2">
                {filteredList.length > 0 ? (
                  filteredList.map((user) => (
                    <div 
                      key={user.id} 
                      onClick={() => handleSelectUser(user)}
                      className={cn(
                      "grid grid-cols-12 gap-4 px-6 py-3.5 items-center rounded-[18px] transition-colors shadow-sm cursor-pointer",
                      user.isCurrentUser
                        ? "bg-blue-50/60 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                        : "bg-white dark:bg-[#1a1f33]/60 hover:dark:bg-[#1a1f33] hover:bg-slate-50 border border-slate-200 dark:border-[#2a3048]"
                    )}>
                       <div className="col-span-1 font-bold text-slate-900 dark:text-white pl-2 flex items-center gap-2">
                          <span>{user.rank}</span>
                          {user.rankTrend === 'up' && <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />}
                          {user.rankTrend === 'down' && <ArrowDown className="w-3.5 h-3.5 text-red-500" />}
                          {user.rankTrend === 'same' && <Minus className="w-3.5 h-3.5 text-slate-400 dark:text-[#798199]" />}
                       </div>
                       <div className="col-span-5 flex items-center gap-4">
                          <img src={user.avatar} className="w-10 h-10 rounded-[14px] object-cover" alt={user.name} />
                          <div className="flex flex-col">
                             <span className="font-bold text-slate-900 dark:text-white text-[14px]">{user.name}</span>
                             <span className="text-[12px] text-slate-500 dark:text-[#798199]">{user.handle}</span>
                          </div>
                       </div>
                       <div className="col-span-2 font-semibold text-slate-700 dark:text-[#b4badd] text-[13px]">
                          {user.followers}
                       </div>
                       <div className="col-span-2 font-bold text-slate-900 dark:text-white text-[14px] flex items-center gap-2">
                          <span>{user.points}</span>
                          {user.scoreTrend === 'up' && <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />}
                          {user.scoreTrend === 'down' && <ArrowDown className="w-3.5 h-3.5 text-red-500" />}
                          {user.scoreTrend === 'same' && <Minus className="w-3.5 h-3.5 text-slate-400 dark:text-[#798199]" />}
                       </div>
                       <div className="col-span-2 flex items-center gap-2 font-bold text-slate-900 dark:text-white text-[13px]">
                          <Gem className="w-4 h-4 text-blue-500 fill-blue-500/20" /> {user.reward}
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-[#1a1f33] flex items-center justify-center mb-4">
                      <SearchX className="w-8 h-8 text-slate-400 dark:text-[#798199]" />
                    </div>
                    <h3 className="text-[16px] font-bold text-slate-900 dark:text-white mb-2">No peers found</h3>
                    <p className="text-[13px] text-slate-500 dark:text-[#798199] text-center max-w-[280px]">
                      We couldn't find anyone matching your current search or format. Try adjusting your filters.
                    </p>
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="mt-6 px-5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold text-[13px] hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                    >
                      Clear Search
                    </button>
                  </div>
                )}
             </div>
          </div>

      </div>

      {/* User Modal Overlay */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedUser(null)}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#1a1f33] rounded-3xl shadow-2xl border border-slate-200 dark:border-[#2a3048] flex flex-col pt-6 pb-2 px-2 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
             {/* Discussion Logo Button */}
            <button 
              className="absolute top-4 left-4 z-20 p-2 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors bg-white/80 dark:bg-[#1a1f33]/80 backdrop-blur-sm"
              title="Message peer"
            >
              <MessagesSquare className="w-5 h-5" />
            </button>
            {/* Close Button */}
            <button 
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 z-20 p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors bg-white/80 dark:bg-[#1a1f33]/80 backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto no-scrollbar pb-4">
              {/* Header Section */}
              <div className="flex flex-col items-center px-6 pb-6 border-b border-slate-100 dark:border-[#2a3048]">
              <div className="w-[84px] h-[84px] rounded-[24px] overflow-hidden border-2 border-slate-100 dark:border-[#2a3048] shadow-md mb-4 bg-slate-50 dark:bg-[#161925]">
                <img src={selectedUser.avatar} alt={selectedUser.name} className="w-full h-full object-cover" />
              </div>
              <h3 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight mb-1">{selectedUser.name}</h3>
              <p className="text-[14px] text-slate-500 dark:text-slate-400 mb-5">{selectedUser.handle}</p>

              <div className="flex items-center justify-center gap-10 w-full">
                <div className="flex flex-col items-center">
                  <span className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight mb-0.5">{selectedUser.rank}</span>
                  <span className="text-[12px] font-medium text-slate-500 dark:text-[#798199] uppercase tracking-wider">Rank</span>
                </div>
                <div className="w-[1px] h-8 bg-slate-200 dark:bg-[#2a3048]"></div>
                <div className="flex flex-col items-center">
                  <span className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight mb-0.5">{selectedUser.points}</span>
                  <span className="text-[12px] font-medium text-slate-500 dark:text-[#798199] uppercase tracking-wider">Points</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex justify-center mt-6">
                 <div className="flex bg-[#f1f3f5] dark:bg-[#171a25] rounded-xl p-1 shadow-sm w-full max-w-[280px]">
                   {["Overview", "Shared Activity"].map(tab => (
                     <button 
                       key={tab} 
                       onClick={() => setModalTab(tab as any)}
                       className={cn(
                         "flex-1 py-1.5 text-[12px] font-semibold rounded-lg transition-colors",
                         modalTab === tab 
                           ? "bg-white dark:bg-[#202538] text-slate-900 dark:text-white shadow-sm" 
                           : "text-slate-500 dark:text-[#6a7391] hover:text-slate-700 dark:hover:text-[#8d96b8]"
                       )}
                     >
                       {tab}
                     </button>
                   ))}
                 </div>
              </div>
            </div>

            <div className="px-5 py-5 pb-6">
              {modalTab === "Overview" ? (
                <>
                  {/* Badges Section */}
              <div className="mb-6">
                <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 px-1">Recent Badges</h4>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-2 group flex-1">
                    <div className="w-12 h-12 rounded-[14px] bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-100/50 dark:border-blue-500/20 group-hover:scale-105 transition-transform">
                      <Award className="w-6 h-6 text-blue-600 dark:text-blue-500" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 text-center">Top 10%<br/>Math</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 group flex-1">
                    <div className="w-12 h-12 rounded-[14px] bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center border border-amber-100/50 dark:border-amber-500/20 group-hover:scale-105 transition-transform">
                      <Clock className="w-6 h-6 text-amber-600 dark:text-amber-500" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 text-center">Early<br/>Bird</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 group flex-1">
                    <div className="w-12 h-12 rounded-[14px] bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center border border-purple-100/50 dark:border-purple-500/20 group-hover:scale-105 transition-transform">
                      <Activity className="w-6 h-6 text-purple-600 dark:text-purple-500" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 text-center">7 Day<br/>Streak</span>
                  </div>
                </div>
              </div>

              {/* Radar Chart Section */}
              <div className="mb-6 px-1">
                <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Domain Comparison</h4>
                <div className="h-[200px] w-full bg-slate-50 dark:bg-[#161925] rounded-[18px] border border-slate-100 dark:border-[#2a3048] pt-4 pb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarMockData}>
                      <PolarGrid stroke="#e2e8f0" className="opacity-50 dark:stroke-[#414a66]" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} className="dark:fill-[#94a3b8]" />
                      <Radar name="Peer" dataKey="peer" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                      <Radar name="You" dataKey="you" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-3">
                   <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-[3px] bg-blue-500 opacity-60 border border-blue-500" />
                     <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">Peer</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500 opacity-60 border border-emerald-500" />
                     <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">You</span>
                   </div>
                </div>
              </div>

              {/* Activity Section */}
              <div>
                <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 px-1">Recent Activity</h4>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-3 p-3 rounded-[14px] bg-slate-50 dark:bg-[#161925] border border-slate-100 dark:border-[#2a3048]">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-500">92%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">Science Mock Test #4</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">2 hours ago</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-[14px] bg-slate-50 dark:bg-[#161925] border border-slate-100 dark:border-[#2a3048]">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-500">88%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">History Quiz #1</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">1 day ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Shared Goals Section */}
                  <div className="mb-6">
                    <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 px-1">Current Goals</h4>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-3 p-3 rounded-[14px] bg-slate-50 dark:bg-[#161925] border border-slate-100 dark:border-[#2a3048]">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                          <Target className="w-4 h-4 text-blue-600 dark:text-blue-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">Master Calculus I</span>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-[#2a3048] rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-blue-500 w-[60%] rounded-full"></div>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">60% Completed • 2 days left</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Public Achievements Section */}
                  <div>
                    <h4 className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 px-1">Shared Study Resources</h4>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-3 p-3 rounded-[14px] bg-slate-50 dark:bg-[#161925] border border-slate-100 dark:border-[#2a3048] hover:bg-slate-100 dark:hover:bg-[#202538] transition-colors cursor-pointer group">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Bookmark className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                        </div>
                        <div className="flex flex-col flex-1">
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Biology Cheat Sheet: Cells</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Saved by 142 peers</span>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity self-center" />
                      </div>
                      
                      <div className="flex items-start gap-3 p-3 rounded-[14px] bg-slate-50 dark:bg-[#161925] border border-slate-100 dark:border-[#2a3048] hover:bg-slate-100 dark:hover:bg-[#202538] transition-colors cursor-pointer group">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Activity className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                        </div>
                        <div className="flex flex-col flex-1">
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">History Exam Notes</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Shared yesterday</span>
                        </div>
                         <CheckCircle2 className="w-4 h-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity self-center" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
