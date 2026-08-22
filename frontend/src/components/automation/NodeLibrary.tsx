/**
 * @file NodeLibrary.tsx
 * @description Left sidebar catalog for dragging and dropping nodes into the workflow canvas.
 */

import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { NodeCatalogItem } from '../../lib/api/automations';

interface NodeLibraryProps {
  catalog: NodeCatalogItem[];
  onAddNode: (item: NodeCatalogItem) => void;
}

export const NodeLibrary: React.FC<NodeLibraryProps> = ({ catalog, onAddNode }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const categories = ['ALL', ...Array.from(new Set(catalog.map(item => item.category)))];

  const filtered = catalog.filter(item => {
    const matchesSearch =
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="w-80 border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#18191A] flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
          Node Library
        </h2>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search automation nodes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Node Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map(item => (
          <div
            key={item.type}
            onClick={() => onAddNode(item)}
            className="group p-3 rounded-xl bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 hover:border-indigo-500/50 hover:shadow-md cursor-pointer transition-all flex items-start justify-between gap-2"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.label}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-100 dark:bg-white/5 text-slate-500">
                  {item.category}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                {item.description}
              </p>
            </div>
            <button className="p-1 rounded-lg bg-slate-50 dark:bg-white/5 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-xs">
            No matching nodes found.
          </div>
        )}
      </div>
    </div>
  );
};
