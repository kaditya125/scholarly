import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Play,
  Clock,
  HelpCircle,
  Award,
  Users,
  Search,
  Filter,
  MoreHorizontal,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { api } from "../lib/api/client";
import { Loader2 } from "lucide-react";
import { useAnalytics } from "../hooks/ai/useAnalytics";

const tabs = [
  "BPSC TRE (1 to 5)(6)",
  "BPSC TRE (6 to 8)(9)",
  "BPSC TRE (9 to 10)(10)",
  "BPSC TRE (11 to 12)(15)"
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("BPSC TRE (1 to 5)(6)");
  const [showFilters, setShowFilters] = useState(false);
  const [filterSubject, setFilterSubject] = useState("All");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [filterDuration, setFilterDuration] = useState("All");

  const { metrics, isLoadingMetrics, insights, isLoadingInsights } = useAnalytics();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTests = async () => {
      try {
        const { data } = await api.get('/tests');
        const formattedTests = data.map((t: any, i: number) => ({
          ...t,
          color: i % 2 === 0 ? "bg-teal-50 dark:bg-teal-900/20" : "bg-yellow-50 dark:bg-yellow-900/10",
          border: i % 2 === 0 ? "border-teal-100 dark:border-teal-900/50" : "border-yellow-100 dark:border-yellow-900/30",
          dot: i % 2 === 0 ? "bg-teal-400 dark:bg-teal-500" : "bg-yellow-400 dark:bg-yellow-600",
        }));
        setTests(formattedTests);
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTests();
  }, []);

  const filteredTests = tests.filter(test => {
    if (filterSubject !== "All" && test.subject !== filterSubject) return false;
    if (filterDifficulty !== "All" && test.difficulty !== filterDifficulty) return false;
    if (filterDuration !== "All") {
      if (filterDuration === "< 120 mins" && test.mins >= 120) return false;
      if (filterDuration === "120+ mins" && test.mins < 120) return false;
    }
    return true;
  });

  const weakTopics = metrics?.weaknesses || ["general studies", "mathematics"];

  const suggestedTests = tests.filter(test => {
    const title = test.title.toLowerCase();
    if (weakTopics.includes("general studies") && title.includes("gs")) return true;
    return weakTopics.some(topic => title.includes(topic.toLowerCase()));
  });

  const testsToShowAsSuggested = suggestedTests.length > 0 ? suggestedTests.slice(0, 2) : tests.slice(0, 2);

  return (
    <div className="w-full flex h-[calc(100vh-100px)] p-6 pt-0 gap-6">
      
      {/* Main List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-8">
        
        {/* Header/Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-6 md:p-8 rounded-[24px] bg-gradient-to-br from-[#1a1f33] via-[#161a2b] to-[#121420] mt-1 relative overflow-hidden"
        >
           <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/4" />
           <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none translate-y-1/2 -translate-x-1/4" />
           
           <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div>
                 <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/90 text-[11px] font-bold uppercase tracking-wider mb-3 backdrop-blur-md">
                   <TrendingUp className="w-3 h-3 text-blue-400" /> Keep the streak going
                 </div>
                 <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2 tracking-tight">Test Series & PYPs</h1>
                 <p className="text-slate-400 dark:text-slate-400 font-medium max-w-lg text-[13px] leading-relaxed">
                   Practice with official previous year papers and high-quality mock tests designed to help you ace the exams.
                 </p>
              </div>
              <div className="flex gap-4 shrink-0">
                 <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[18px] p-4 flex items-center gap-4 slide-in-from-right-8 animate-in duration-700">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                       <Award className="w-5 h-5 text-white" />
                    </div>
                    <div>
                       <div className="text-2xl font-extrabold text-white tracking-tight">45+</div>
                       <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Total Tests</div>
                    </div>
                 </div>
              </div>
           </div>
        </motion.div>

        {/* Suggested Tests Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Suggested for You
            </h2>
            <span className="text-slate-500 dark:text-slate-400 font-medium">BPSC TRE / PRT (1-5)</span>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center w-full h-[200px]">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testsToShowAsSuggested.map((test, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={`suggested-${idx}`}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50/30 dark:from-[#1a1f33]/60 dark:to-[#1a1f33] rounded-[20px] p-5 border border-blue-100/50 dark:border-[#2a3048] shadow-sm hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden group flex flex-col"
                >
                    <div className="flex items-start justify-between mb-4 mt-0.5">
                       <div className="flex gap-2">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400">Suggested</span>
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold border border-slate-200 dark:border-[#2a3048] bg-white/60 dark:bg-white/5 text-slate-600 dark:text-slate-300">{test.difficulty}</span>
                       </div>
                       <button className="p-1 hover:bg-white/50 dark:hover:bg-white/5 rounded-md text-slate-400 dark:text-slate-500 transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                       </button>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-[15px] leading-snug mb-2.5 pr-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1">{test.title}</h3>
                    
                    <div className="flex items-center gap-1.5 mb-4 opacity-80">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{test.users} Users</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-5 bg-white/60 dark:bg-[#161925]/50 px-3 py-2 rounded-xl border border-blue-100 dark:border-[#2a3048]">
                      <div className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-slate-400" /> {test.questions} Qs</div>
                      <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-[#2a3048]"></div>
                      <div className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-slate-400" /> {test.marks} Marks</div>
                    </div>

                    <Link to="/test" className="w-full flex items-center justify-between px-5 py-2.5 bg-blue-600 dark:bg-blue-600 text-white rounded-xl text-[13px] font-bold shadow-sm hover:bg-blue-700 dark:hover:bg-blue-700 transition-all cursor-pointer group/btn mt-auto">
                      <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 fill-current" /> Take Test</span>
                      <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col mb-6 gap-4 sticky top-0 bg-[#fafbfc]/90 dark:bg-[#131314]/90 backdrop-blur-md z-20 py-2 transition-colors duration-300">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div className="flex gap-2 flex-wrap items-center">
               {tabs.map(tab => (
                 <button 
                   key={tab} 
                   onClick={() => setActiveTab(tab)}
                   className={cn(
                     "px-4 py-2 text-[13px] font-bold rounded-full transition-all whitespace-nowrap border cursor-pointer",
                     activeTab === tab 
                       ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10 dark:bg-white dark:text-black" 
                       : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 dark:bg-[#1a1f33] dark:border-[#2a3048] dark:text-[#b4badd] dark:hover:text-white dark:hover:bg-[#202538]"
                   )}
                 >
                   {tab}
                 </button>
               ))}
             </div>
             <div className="hidden md:flex gap-2">
               <button className="w-9 h-9 bg-white dark:bg-[#1a1f33] rounded-full flex items-center justify-center border border-slate-200 dark:border-[#2a3048] cursor-pointer text-slate-500 dark:text-[#798199] hover:bg-slate-50 hover:text-slate-900 dark:hover:text-white dark:hover:bg-[#202538] shadow-sm transition-all relative group">
                 <Search className="w-4 h-4" />
               </button>
               <button 
                 onClick={() => setShowFilters(!showFilters)}
                 className={cn(
                   "w-9 h-9 rounded-full flex items-center justify-center border cursor-pointer shadow-sm transition-all",
                   showFilters 
                     ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400" 
                     : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:bg-[#1a1f33] dark:border-[#2a3048] dark:text-[#798199] dark:hover:text-white dark:hover:bg-[#202538]"
                 )}
               >
                 <Filter className="w-4 h-4" />
               </button>
             </div>
           </div>

           {/* Filter Panel */}
           {showFilters && (
             <motion.div 
               initial={{ opacity: 0, height: 0 }}
               animate={{ opacity: 1, height: 'auto' }}
               className="bg-white dark:bg-[#1a1f33]/80 rounded-[20px] p-5 border border-slate-200 dark:border-[#2a3048] shadow-sm flex flex-col md:flex-row gap-6 transition-colors duration-300"
             >
               <div className="flex-1">
                 <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Subject Type</label>
                 <div className="flex gap-2 flex-wrap">
                   {["All", "PYP", "Full Mock", "Subject Test"].map(opt => (
                     <button
                       key={opt}
                       onClick={() => setFilterSubject(opt)}
                       className={cn(
                         "px-3 py-1.5 text-[12px] font-bold rounded-lg transition-colors border cursor-pointer",
                         filterSubject === opt ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-black" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-transparent dark:border-[#2a3048] dark:text-slate-400 dark:hover:text-white"
                       )}
                     >
                       {opt}
                     </button>
                   ))}
                 </div>
               </div>
               
               <div className="flex-1">
                 <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Difficulty</label>
                 <div className="flex gap-2 flex-wrap">
                   {["All", "Easy", "Medium", "Hard"].map(opt => (
                     <button
                       key={opt}
                       onClick={() => setFilterDifficulty(opt)}
                       className={cn(
                         "px-3 py-1.5 text-[12px] font-bold rounded-lg transition-colors border cursor-pointer",
                         filterDifficulty === opt ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-black" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-transparent dark:border-[#2a3048] dark:text-slate-400 dark:hover:text-white"
                       )}
                     >
                       {opt}
                     </button>
                   ))}
                 </div>
               </div>

               <div className="flex-1">
                 <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Duration</label>
                 <div className="flex gap-2 flex-wrap">
                   {["All", "< 120 mins", "120+ mins"].map(opt => (
                     <button
                       key={opt}
                       onClick={() => setFilterDuration(opt)}
                       className={cn(
                         "px-3 py-1.5 text-[12px] font-bold rounded-lg transition-colors border cursor-pointer",
                         filterDuration === opt ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-black" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-transparent dark:border-[#2a3048] dark:text-slate-400 dark:hover:text-white"
                       )}
                     >
                       {opt}
                     </button>
                   ))}
                 </div>
               </div>
             </motion.div>
           )}
        </div>

        {/* Test Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((test, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              key={idx} 
              className={cn("bg-white dark:bg-[#1a1f33]/60 rounded-[20px] p-5 border border-slate-200/80 dark:border-[#2a3048] shadow-sm transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-0.5 hover:dark:bg-[#1a1f33] relative overflow-hidden group flex flex-col")}
            >
              <div className="flex items-start justify-between mb-4 mt-0.5">
                <div className="flex gap-2">
                  <span className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold", test.color, test.border, "border text-slate-700 dark:text-slate-300 backdrop-blur-sm")}>
                     {test.subject}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold border border-slate-200 dark:border-[#2a3048] bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                     {test.difficulty}
                  </span>
                </div>
                <button className="p-1 hover:bg-slate-50 dark:hover:bg-white/5 rounded-md text-slate-400 dark:text-slate-500 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white text-[15px] leading-snug mb-2.5 pr-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-1">{test.title}</h3>
              
              <div className="flex items-center gap-1.5 mb-4 opacity-80">
                <span className={cn("w-1.5 h-1.5 rounded-full shadow-sm", test.dot)}></span>
                <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{test.users} Users</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-5 bg-slate-50 dark:bg-[#161925]/50 px-3 py-2 rounded-xl border border-slate-100/80 dark:border-[#2a3048]">
                <div className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-slate-400" /> {test.questions} Qs</div>
                <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-[#2a3048]"></div>
                <div className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-slate-400" /> {test.marks} Marks</div>
                <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-[#2a3048]"></div>
                <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> {test.mins} Mins</div>
              </div>

              <Link to="/test" className="w-full flex items-center justify-between px-5 py-2.5 bg-white dark:bg-[#202538] text-slate-900 dark:text-white rounded-xl text-[13px] font-bold shadow-sm border border-slate-200 dark:border-[#2a3048] hover:border-blue-500 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 transition-all cursor-pointer group/btn mt-auto">
                <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 fill-current text-blue-600 dark:text-blue-400" /> Start Mock Test</span>
                <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover/btn:text-blue-600 dark:group-hover/btn:text-blue-400 transition-colors group-hover/btn:translate-x-1" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right Sidebar Widgets */}
      <div className="w-[300px] shrink-0 h-full hidden xl:flex flex-col space-y-4 pt-1">
        
        {/* Proactive Companion Widget */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[20px] p-6 border border-indigo-400 shadow-xl shadow-indigo-500/20 relative overflow-hidden flex flex-col"
        >
           <div className="absolute top-0 right-0 w-24 h-24 bg-white/30 blur-[30px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
           <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-400/20 blur-[40px] rounded-full pointer-events-none translate-y-1/2 -translate-x-1/2"></div>
           
           <div className="flex items-center gap-2 mb-4 relative z-10">
               <span className="font-extrabold text-white border border-white/30 bg-white/10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest backdrop-blur-sm shadow-sm">AI COACH</span>
               <span className="text-[11px] font-bold text-indigo-50 uppercase tracking-wide">Companion Insight</span>
           </div>
           
           {isLoadingInsights ? (
             <div className="flex-1 flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
             </div>
           ) : insights && insights.length > 0 ? (
             <>
               <h3 className="text-xl font-extrabold text-white mb-2 leading-tight relative z-10 tracking-tight capitalize">
                 {insights[0].type} Focus
               </h3>
               <p className="text-[12px] text-indigo-100 font-medium mb-6 relative z-10 leading-relaxed">
                 {insights[0].message}
               </p>
               
               <Link to={insights[0].actionUrl} className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-indigo-600 rounded-xl text-[13px] font-bold shadow-lg shadow-black/10 transition-all hover:bg-indigo-50 hover:-translate-y-0.5 relative z-10 cursor-pointer mt-auto">
                 {insights[0].actionText} <ChevronRight className="w-3.5 h-3.5" />
               </Link>
             </>
           ) : (
             <>
               <h3 className="text-xl font-extrabold text-white mb-2 leading-tight relative z-10 tracking-tight">You're On Track!</h3>
               <p className="text-[12px] text-indigo-100 font-medium mb-6 relative z-10 leading-relaxed">No new AI insights. Keep studying and making progress.</p>
             </>
           )}
        </motion.div>

        {/* Analytics Mini-widget */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1a1f33] rounded-[20px] p-6 border border-slate-200/80 dark:border-[#2a3048] shadow-sm relative group hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all flex flex-col"
        >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-[15px]">Overall Metrics</h3>
              <div className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
              </div>
            </div>
            
            {isLoadingMetrics ? (
              <div className="flex items-center justify-center py-6">
                 <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : metrics ? (
              <div className="space-y-4">
                 <div>
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400">Total Study Hours</span>
                       <span className="text-[15px] font-extrabold text-slate-900 dark:text-white">{metrics.totalStudyHours}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-[#202538] rounded-full overflow-hidden">
                       <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full" style={{ width: `${Math.min(100, (metrics.totalStudyHours / 100) * 100)}%` }} ></div>
                    </div>
                 </div>
                 
                 <div>
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400">Topics Mastered</span>
                       <span className="text-[15px] font-extrabold text-slate-900 dark:text-white">{metrics.topicsMastered}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-[#202538] rounded-full overflow-hidden">
                       <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full" style={{ width: `${Math.min(100, (metrics.topicsMastered / 50) * 100)}%` }}></div>
                    </div>
                 </div>

                 <div>
                    <div className="flex justify-between items-end mb-1.5">
                       <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400">Average Score</span>
                       <span className="text-[15px] font-extrabold text-slate-900 dark:text-white">{metrics.averageScore}%</span>
                    </div>
                 </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No data available</div>
            )}
        </motion.div>

      </div>
    </div>
  );
}
