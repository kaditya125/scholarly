import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function ModernCalendarFilter() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5)); // June 2026
  const [selectedRange, setSelectedRange] = useState('This Month');
  const [selectedDate, setSelectedDate] = useState<number | null>(null);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

  const quickFilters = ['Today', 'This Week', 'This Month', 'Last 3 Months', 'All Time'];

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="w-8 h-8" />);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const isSelected = selectedDate === i;
    days.push(
      <button 
        key={i}
        onClick={() => { setSelectedDate(i); setSelectedRange('Custom'); }}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium transition-colors cursor-pointer outline-none",
          isSelected 
            ? "bg-teal-600 dark:bg-teal-500 text-white shadow-sm" 
            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
        )}
      >
        {i}
      </button>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 bg-white dark:bg-[#1a1a1a] px-4 py-2.5 rounded-full border shadow-sm text-sm font-medium transition-all",
          isOpen ? "border-teal-500/50 dark:border-teal-400/50 ring-2 ring-teal-500/20 text-teal-700 dark:text-teal-400" : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-300"
        )}
      >
        <CalendarIcon className={cn("w-4 h-4", isOpen ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400")} />
        {selectedRange}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full left-0 mt-2 z-50 flex flex-col md:flex-row bg-white dark:bg-[#212121] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden w-[280px] md:w-[460px]"
            >
              <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-slate-100 dark:border-white/5 p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-hidden bg-slate-50/50 dark:bg-[#1a1a1a]/50 shrink-0 custom-scrollbar">
                {quickFilters.map((filter) => (
                  <button 
                    key={filter}
                    onClick={() => setSelectedRange(filter)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[13px] font-bold text-left whitespace-nowrap transition-colors flex items-center justify-between",
                      selectedRange === filter 
                        ? "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                    )}
                  >
                    {filter}
                    {selectedRange === filter && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              <div className="p-4 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-[14px]">
                    {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={prevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={nextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-500 dark:text-slate-400">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAYS.map(d => (
                    <div key={d} className="text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 w-8 h-8 flex items-center justify-center">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {days}
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex justify-end">
                   <button 
                     onClick={() => setIsOpen(false)}
                     className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-bold rounded-xl transition-colors shadow-sm"
                   >
                     Apply Filter
                   </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
