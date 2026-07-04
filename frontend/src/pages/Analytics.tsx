import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ArrowRight, Activity, Users, Settings } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { PeerComparisonChart } from "../components/PeerComparisonChart";

export default function Analytics() {
  const [isLoading, setIsLoading] = useState(true);

  // Heatmap mock data generation
  const [heatmapData] = useState(() => {
    const data = [];
    const weeks = 28; // ~ 6 months
    for (let w = 0; w < weeks; w++) {
      const weekData = [];
      for (let d = 0; d < 7; d++) {
        // Random performance intensity (0-4)
        // Weight it to be mostly 0, 1, or 2, with occasional 3 or 4
        const rand = Math.random();
        let intensity = 0;
        if (rand > 0.6) intensity = 1;
        if (rand > 0.8) intensity = 2;
        if (rand > 0.9) intensity = 3;
        if (rand > 0.96) intensity = 4;
        weekData.push({ day: d, intensity });
      }
      data.push(weekData);
    }
    return data;
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-[#131314] transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Top Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Overview Theme Block */}
          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="bg-slate-900 rounded-[32px] p-10 text-white relative overflow-hidden shadow-lg group"
          >
             <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/20 rounded-full blur-[80px] pointer-events-none group-hover:bg-teal-500/30 transition-colors" />
             
             <div className="flex justify-between items-start mb-10 relative z-10">
                <h3 className="text-2xl font-bold opacity-90 tracking-wide uppercase text-teal-400">overview</h3>
                
                <div className="flex -space-x-4">
                  <img src="https://i.pravatar.cc/150?img=11" alt="Avatar" className="w-12 h-12 rounded-full border-[3px] border-slate-900 shadow-sm relative z-10" />
                  <img src="https://i.pravatar.cc/150?img=12" alt="Avatar" className="w-12 h-12 rounded-full border-[3px] border-slate-900 shadow-sm relative z-20" />
                  <img src="https://i.pravatar.cc/150?img=13" alt="Avatar" className="w-12 h-12 rounded-full border-[3px] border-slate-900 shadow-sm relative z-30" />
                  <img src="https://i.pravatar.cc/150?img=14" alt="Avatar" className="w-12 h-12 rounded-full border-[3px] border-slate-900 shadow-sm relative z-20" />
                  <img src="https://i.pravatar.cc/150?img=15" alt="Avatar" className="w-12 h-12 rounded-full border-[3px] border-slate-900 shadow-sm relative z-10" />
                </div>
             </div>

             <div className="flex items-end justify-between relative z-10 mt-12">
                <div>
                   <p className="text-slate-300 font-medium mb-1 drop-shadow-sm text-lg">Take the exam</p>
                   <div className="text-8xl font-light tracking-tight text-white drop-shadow-sm">48</div>
                </div>

                <button className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-slate-900 transition-colors px-8 py-3.5 rounded-full text-sm font-bold shadow-sm">
                   Entry results <ArrowRight className="w-4 h-4 ml-1" />
                </button>
             </div>
          </motion.div>

          {/* Right Top Area - Statistics & Ranking */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             
             {/* Box 1 - Statistics */}
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.1 }}
               className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col border border-slate-200 dark:border-white/10 transition-colors"
             >
                <div className="flex justify-between items-center mb-8">
                   <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg">Statistics</h3>
                   <button className="text-slate-400 hover:text-teal-600 transition-colors"><Settings className="w-5 h-5" /></button>
                </div>
                
                <div className="grid grid-cols-2 gap-y-10 gap-x-4 flex-1 content-center">
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Highest score</p>
                     <div className="text-4xl font-light text-teal-600 dark:text-teal-400">99</div>
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Minimum score</p>
                     <div className="text-4xl font-light text-slate-800 dark:text-slate-200">36</div>
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Average</p>
                     <div className="text-4xl font-light text-slate-800 dark:text-slate-200">68</div>
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Median</p>
                     <div className="text-4xl font-light text-slate-800 dark:text-slate-200">71</div>
                   </div>
                </div>
             </motion.div>

             {/* Box 2 - Student achievement ranking */}
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.2 }}
               className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col border border-slate-200 dark:border-white/10 transition-colors"
             >
                <div className="flex justify-between items-center mb-8">
                   <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg max-w-[120px] leading-snug">Student achievement ranking</h3>
                   <div className="text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors shadow-sm">Class selection ▾</div>
                </div>

                <div className="space-y-5 flex-1">
                   {[
                     { name: "Giga Tamarashvili", score: 99, trend: "up", avatar: "https://i.pravatar.cc/150?img=11" },
                     { name: "Michal Parulski", score: 98, trend: "down", avatar: "https://i.pravatar.cc/150?img=12" },
                     { name: "Igor Varenov", score: 94, trend: "up", avatar: "https://i.pravatar.cc/150?img=13" },
                     { name: "Nermin Muminovic", score: 94, trend: "up", avatar: "https://i.pravatar.cc/150?img=14" }
                   ].map((student, i) => (
                     <div key={i} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                           <img src={student.avatar} alt="Avatar" className="w-8 h-8 rounded-full border-2 border-white dark:border-[#1f1f1f] shadow-sm" />
                           <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-teal-600 transition-colors cursor-pointer">{student.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="font-bold text-slate-800 dark:text-slate-200 text-[15px]">{student.score}</span>
                           <span className={cn("text-[11px] font-bold", student.trend === 'up' ? "text-teal-500" : "text-rose-500")}>
                             {student.trend === 'up' ? "↑" : "↓"}
                           </span>
                        </div>
                     </div>
                   ))}
                </div>
             </motion.div>

          </div>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Grade distribution (Circle Chart) */}
           <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-white/10 col-span-1 transition-colors"
           >
              <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg mb-8">Grade distribution</h3>
              <div className="flex flex-col items-center justify-center">
                 <div className="relative w-48 h-48 mb-8">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f8fafc" strokeWidth="8" className="dark:stroke-white/5" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#0d9488" strokeWidth="8" strokeDasharray="50 250" strokeDashoffset="0" className="drop-shadow-sm" strokeLinecap="round" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#facc15" strokeWidth="8" strokeDasharray="30 250" strokeDashoffset="-50" className="drop-shadow-sm" strokeLinecap="round"/>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#64748b" strokeWidth="8" strokeDasharray="140 250" strokeDashoffset="-80" className="drop-shadow-sm" strokeLinecap="round"/>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#0f172a" strokeWidth="8" strokeDasharray="40 250" strokeDashoffset="-220" className="drop-shadow-sm dark:stroke-slate-100" strokeLinecap="round"/>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-[11px] font-bold text-slate-400 mb-1 tracking-wider uppercase">Total amount</span>
                       <span className="text-4xl font-light text-slate-900 dark:text-slate-100">57</span>
                    </div>
                 </div>

                 <div className="flex flex-col gap-4 text-sm w-full px-4">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-teal-600 shadow-sm"></span><span className="font-medium text-slate-500 dark:text-slate-400">Grade A</span></div>
                       <span className="font-bold text-slate-800 dark:text-slate-200">11</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-sm"></span><span className="font-medium text-slate-500 dark:text-slate-400">Grade B</span></div>
                       <span className="font-bold text-slate-800 dark:text-slate-200">14</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 shadow-sm"></span><span className="font-medium text-slate-500 dark:text-slate-400">Grade C</span></div>
                       <span className="font-bold text-slate-800 dark:text-slate-200">26</span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-slate-100 shadow-sm"></span><span className="font-medium text-slate-500 dark:text-slate-400">Grade D</span></div>
                       <span className="font-bold text-slate-800 dark:text-slate-200">6</span>
                    </div>
                 </div>
              </div>
           </motion.div>

           {/* Knowledge Points */}
           <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
               className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-white/10 col-span-2 flex flex-col transition-colors"
           >
              <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg mb-8">Knowledge point statistics</h3>
              
              <div className="flex flex-col md:flex-row h-full gap-8 md:gap-16 items-center px-4">
                 <div className="relative w-48 h-48 shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f8fafc" strokeWidth="8" className="dark:stroke-white/5" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#0f172a" strokeWidth="8" strokeDasharray="180 250" className="opacity-90 drop-shadow-sm dark:stroke-slate-400" strokeLinecap="round"/>
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#0d9488" strokeWidth="2" strokeDasharray="100 250" strokeDashoffset="-120" strokeLinecap="round" className="drop-shadow-sm" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                       <span className="text-[10px] font-bold text-slate-400 mb-1 leading-snug text-center tracking-widest uppercase max-w-[80px]">Knowledge</span>
                       <span className="text-4xl font-light text-slate-800 dark:text-slate-100">17</span>
                    </div>
                 </div>

                 <div className="flex-1 space-y-6 w-full">
                    {[
                      { name: "Anked Cloze", p1: "14.8", p2: "12.2" },
                      { name: "Ancient poetry writing", p1: "12.5", p2: "10.1" },
                      { name: "Pinyin", p1: "8.4", p2: "15.0" },
                      { name: "Wrongly written characters", p1: "19.2", p2: "8.6" }
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                         <div className="w-48 text-[13px] font-semibold text-slate-700 dark:text-slate-300 truncate">{item.name}</div>
                         <div className="flex-1 h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex relative group cursor-pointer w-full">
                            <div className="bg-teal-600 dark:bg-teal-500 h-full transition-all group-hover:brightness-110" style={{ width: '40%' }}></div>
                            <div className="bg-slate-800 dark:bg-slate-500 h-full transition-all group-hover:brightness-110" style={{ width: '30%' }}></div>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
           </motion.div>
        </div>

        {/* Third Row - Colorful Stats Blocks */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-white/10 transition-colors"
        >
           <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg mb-8">Examination Statistics</h3>

           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              <div className="bg-teal-600 rounded-[28px] p-8 text-white shadow-lg relative overflow-hidden group border border-teal-500 hover:-translate-y-1 transition-transform cursor-pointer">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-[40px] pointer-events-none group-hover:scale-110 transition-transform" />
                 <p className="text-[11px] font-bold text-teal-100 mb-8 uppercase tracking-widest relative z-10 opacity-90">Examination results</p>
                 <div className="text-5xl font-light mb-2 relative z-10">90.5</div>
                 <p className="text-xs font-medium text-teal-200 relative z-10">Class average: 75.4</p>
              </div>

              <div className="bg-yellow-400 rounded-[28px] p-8 text-slate-900 shadow-lg relative overflow-hidden group border border-yellow-300 hover:-translate-y-1 transition-transform cursor-pointer">
                 <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/40 rounded-full blur-[30px] pointer-events-none group-hover:scale-110 transition-transform" />
                 <p className="text-[11px] font-bold text-slate-800 mb-8 uppercase tracking-widest relative z-10 opacity-90">Class ranking</p>
                 <div className="text-5xl font-light mb-2 relative z-10 font-bold">45</div>
                 <p className="text-xs font-medium text-slate-700 relative z-10">Total number of participants: 55</p>
              </div>

              <div className="bg-slate-800 dark:bg-slate-900 rounded-[28px] p-8 text-white shadow-lg relative overflow-hidden group border border-slate-700 hover:-translate-y-1 transition-transform cursor-pointer">
                 <div className="absolute top-0 -left-10 w-32 h-32 bg-white/5 rounded-full blur-[30px] pointer-events-none group-hover:scale-110 transition-transform" />
                 <p className="text-[11px] font-bold text-slate-400 mb-8 uppercase tracking-widest relative z-10 opacity-90">Exam time</p>
                 <div className="text-5xl font-light mb-2 relative z-10 text-teal-400">72<span className="text-xl ml-1 font-medium text-white">Min</span></div>
                 <p className="text-xs font-medium text-slate-400 relative z-10">Average 5.5 minutes per fast class</p>
              </div>

              <div className="bg-teal-50 dark:bg-teal-900/40 rounded-[28px] p-8 text-slate-800 dark:text-slate-100 shadow-sm relative overflow-hidden group border border-teal-100 dark:border-teal-800/50 hover:-translate-y-1 transition-transform cursor-pointer">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-teal-100/50 dark:bg-teal-500/10 rounded-full blur-[40px] pointer-events-none group-hover:scale-110 transition-transform" />
                 <p className="text-[11px] font-bold text-teal-700 dark:text-teal-400 mb-8 uppercase tracking-widest relative z-10 opacity-90">Knowledge points mastery</p>
                 <div className="text-5xl font-bold mb-2 relative z-10 text-slate-900 dark:text-slate-100">15</div>
                 <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 relative z-10">12.6 per capita</p>
              </div>

           </div>
        </motion.div>

        {/* Fourth Row - Performance Heatmap */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-white/10 transition-colors"
        >
           <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg mb-6">Performance Heatmap</h3>
           
           <div className="flex gap-4">
              {/* Day Labels */}
              <div className="flex flex-col gap-1.5 justify-between py-1 text-[10px] font-bold text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <div key={i} className={`h-3 md:h-4 flex items-center ${i % 2 !== 0 ? 'invisible hidden sm:flex' : ''}`}>{day}</div>
                ))}
              </div>
              
              {/* Grid */}
              <div className="flex gap-1.5 flex-1 overflow-x-auto custom-scrollbar pb-2">
                 {heatmapData.map((week, wIndex) => (
                    <div key={wIndex} className="flex flex-col gap-1.5 shrink-0">
                       {week.map((day, dIndex) => {
                          let bgColor = "bg-slate-100 dark:bg-white/5";
                          if(day.intensity === 1) bgColor = "bg-teal-100 dark:bg-teal-900/40";
                          if(day.intensity === 2) bgColor = "bg-teal-300 dark:bg-teal-700/60";
                          if(day.intensity === 3) bgColor = "bg-teal-500 dark:bg-teal-500";
                          if(day.intensity === 4) bgColor = "bg-teal-700 dark:bg-teal-400";
                          
                          return (
                             <div 
                               key={dIndex} 
                               className={`w-3 h-3 md:w-4 md:h-4 rounded-[4px] ${bgColor} cursor-pointer hover:ring-2 ring-slate-300 dark:ring-slate-600 ring-offset-1 dark:ring-offset-[#1f1f1f] transition-all`}
                               title={`Intensity: ${day.intensity}`}
                             />
                          );
                       })}
                    </div>
                 ))}
              </div>
           </div>

           {/* Legend */}
           <div className="flex items-center justify-end gap-2 mt-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-[4px] bg-slate-100 dark:bg-white/5" />
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-[4px] bg-teal-100 dark:bg-teal-900/40" />
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-[4px] bg-teal-300 dark:bg-teal-700/60" />
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-[4px] bg-teal-500 dark:bg-teal-500" />
                <div className="w-3 h-3 md:w-4 md:h-4 rounded-[4px] bg-teal-700 dark:bg-teal-400" />
              </div>
              <span>More</span>
           </div>
        </motion.div>

         {/* Peer Comparison Chart */}
         <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.7 }}
             className="bg-white dark:bg-[#1f1f1f] rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 dark:border-white/10 transition-colors"
         >
            <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-wide text-lg mb-6">Peer Comparison</h3>
            <PeerComparisonChart />
         </motion.div>

      </div>
    </div>
  );
}
