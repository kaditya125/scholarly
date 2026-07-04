import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export function Breadcrumb() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  const getPageTitle = (path: string) => {
    switch (path) {
      case 'dashboard': return 'Dashboard';
      case 'tests': return 'Test Series';
      case 'leaderboard': return 'Leaderboard';
      case 'planner': return 'Tasks Report';
      case 'discussions': return 'General Chats';
      case 'report': return 'Detailed Report';
      default: return path.charAt(0).toUpperCase() + path.slice(1);
    }
  };

  return (
    <nav className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-500 mb-0.5">
      <Link to="/" className="hover:text-slate-800 dark:hover:text-white transition-colors">
        Home
      </Link>
      
      {pathnames.length > 0 && (
        <>
          <span className="text-slate-300 dark:text-gray-600">/</span>
          {pathnames.map((value, index) => {
            const last = index === pathnames.length - 1;
            const to = `/${pathnames.slice(0, index + 1).join('/')}`;

            return (
              <React.Fragment key={to}>
                {last ? (
                  <span className="text-slate-800 dark:text-gray-300">
                    {getPageTitle(value)}
                  </span>
                ) : (
                  <>
                    <Link to={to} className="hover:text-slate-800 dark:hover:text-white transition-colors">
                      {getPageTitle(value)}
                    </Link>
                    <span className="text-slate-300 dark:text-gray-600">/</span>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
      {pathnames.length === 0 && (
        <>
          <span className="text-slate-300 dark:text-gray-600">/</span>
          <span className="text-slate-800 dark:text-gray-300">Overview</span>
        </>
      )}
    </nav>
  );
}
