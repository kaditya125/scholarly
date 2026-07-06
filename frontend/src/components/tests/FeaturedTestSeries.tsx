import { Users, Clock, Award, Bookmark } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useNavigate } from 'react-router-dom';

interface FeaturedTestSeriesProps {
  selectedExam: string;
}

const mockSeries = [
  {
    id: 'ts-1',
    title: 'SSC CGL Tier 1 Full Mock Series 2026',
    description: 'Based on latest TCS pattern. Includes 50 Full Mocks + 20 Previous Year Papers.',
    totalTests: 70,
    enrollment: '124k',
    difficulty: 'Medium-Hard',
    tags: ['Latest Pattern', 'AI Recommended']
  },
  {
    id: 'ts-2',
    title: 'SSC CGL Mathematics Booster',
    description: 'Chapter-wise advanced mathematics tests focusing on Geometry and Algebra.',
    totalTests: 25,
    enrollment: '89k',
    difficulty: 'Hard',
    tags: ['Subjective']
  }
];

export function FeaturedTestSeries({ selectedExam }: FeaturedTestSeriesProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          Featured Test Series <span className="text-sm font-medium px-2 py-1 bg-indigo-500/10 text-indigo-500 rounded-full">{selectedExam}</span>
        </h2>
        <button className="text-indigo-500 font-bold text-sm hover:underline">View All</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockSeries.map((series) => (
          <div 
            key={series.id}
            className={cn(
              "p-6 rounded-[24px] border transition-all duration-300 hover:shadow-xl group flex flex-col justify-between",
              isDarkMode ? "bg-slate-900 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            )}
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-wrap gap-2">
                  {series.tags.map(tag => (
                    <span key={tag} className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded",
                      tag === 'AI Recommended' 
                        ? (isDarkMode ? "bg-teal-500/20 text-teal-400" : "bg-teal-50 text-teal-600")
                        : (isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600")
                    )}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button className={cn("p-2 rounded-full transition-colors", isDarkMode ? "hover:bg-slate-800 text-slate-500" : "hover:bg-slate-100 text-slate-400")}>
                  <Bookmark className="w-5 h-5" />
                </button>
              </div>

              <h3 className={cn("text-lg font-bold mb-2 leading-tight", isDarkMode ? "text-white" : "text-slate-900")}>
                {series.title}
              </h3>
              <p className={cn("text-sm mb-6", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                {series.description}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-4 text-xs font-semibold mb-6">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Award className="w-4 h-4 text-amber-500" />
                  {series.totalTests} Tests
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Users className="w-4 h-4 text-blue-500" />
                  {series.enrollment} Enrolled
                </div>
              </div>

              <button 
                onClick={() => navigate('/test', { state: { mode: 'exam' } })}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors"
              >
                View Series
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
