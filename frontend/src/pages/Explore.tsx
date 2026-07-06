import React, { useState, useEffect } from 'react';
import { Search, Star, Download, BookOpen, Brain, Filter, Sparkles, Award, ArrowRight, Heart, Notebook } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api/client';

export interface PublishedAsset {
  id: string;
  notebookId: string;
  userId: string;
  type: string;
  title: string;
  content: any;
  sourceDocIds: string[];
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  authorId: string;
  authorName: string;
  subject?: string;
  exam?: string;
  aiModel?: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  bookmarks: number;
  reports: number;
  publishedAt: number;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode, color: string, bg: string }> = {
  'FLASHCARDS': { icon: <BookOpen className="w-4 h-4" />, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  'QUIZ': { icon: <Brain className="w-4 h-4" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  'MIND_MAP': { icon: <Sparkles className="w-4 h-4" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  'NOTES': { icon: <Notebook className="w-4 h-4" />, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/30' },
  'SUMMARY': { icon: <Award className="w-4 h-4" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30' }
};

export default function Explore() {
  const [assets, setAssets] = useState<PublishedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // In a real implementation we would fetch from the backend
    // Since we are mocking for now as per instructions
    const mockAssets: PublishedAsset[] = [
      {
        id: '1', notebookId: 'n1', userId: 'u1', type: 'FLASHCARDS', title: 'NCERT Biology Class 11 - Cell Biology',
        content: {}, sourceDocIds: [], createdAt: Date.now(), updatedAt: Date.now(), isPublic: true,
        authorId: 'u1', authorName: 'Dr. Sharma', subject: 'Biology', exam: 'NEET', rating: 4.8, ratingCount: 124, downloads: 450, bookmarks: 0, reports: 0, publishedAt: Date.now()
      },
      {
        id: '2', notebookId: 'n2', userId: 'u2', type: 'QUIZ', title: 'JEE Advanced Physics - Mechanics Mega Quiz',
        content: {}, sourceDocIds: [], createdAt: Date.now(), updatedAt: Date.now(), isPublic: true,
        authorId: 'u2', authorName: 'IITian Prep', subject: 'Physics', exam: 'JEE', rating: 4.9, ratingCount: 312, downloads: 1200, bookmarks: 0, reports: 0, publishedAt: Date.now()
      },
      {
        id: '3', notebookId: 'n3', userId: 'u3', type: 'MIND_MAP', title: 'UPSC History - Indian National Movement',
        content: {}, sourceDocIds: [], createdAt: Date.now(), updatedAt: Date.now(), isPublic: true,
        authorId: 'u3', authorName: 'IAS Aspirant', subject: 'History', exam: 'UPSC', rating: 4.7, ratingCount: 89, downloads: 320, bookmarks: 0, reports: 0, publishedAt: Date.now()
      },
      {
        id: '4', notebookId: 'n4', userId: 'u4', type: 'NOTES', title: 'Organic Chemistry Reactions Summary',
        content: {}, sourceDocIds: [], createdAt: Date.now(), updatedAt: Date.now(), isPublic: true,
        authorId: 'u4', authorName: 'ChemMaster', subject: 'Chemistry', exam: 'JEE', rating: 4.6, ratingCount: 156, downloads: 890, bookmarks: 0, reports: 0, publishedAt: Date.now()
      },
      {
        id: '5', notebookId: 'n5', userId: 'u5', type: 'SUMMARY', title: 'SSC CGL Quant Formulas Cheat Sheet',
        content: {}, sourceDocIds: [], createdAt: Date.now(), updatedAt: Date.now(), isPublic: true,
        authorId: 'u5', authorName: 'QuantGuru', subject: 'Maths', exam: 'SSC', rating: 4.9, ratingCount: 450, downloads: 2100, bookmarks: 0, reports: 0, publishedAt: Date.now()
      }
    ];
    setAssets(mockAssets);
    setLoading(false);
  }, []);

  const filteredAssets = assets.filter(a => {
    if (filterType !== 'All' && a.type !== filterType) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#131314] overflow-y-auto">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-transparent">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-indigo-500" />
          Explore
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
          Discover high-quality, AI-generated learning assets shared by the community.
        </p>

        {/* Search & Filters */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by subject, exam, or topic..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Filter className="w-4 h-4" />
            More Filters
          </button>
        </div>

        {/* Type Pills */}
        <div className="mt-6 flex flex-wrap gap-2">
          {['All', 'FLASHCARDS', 'QUIZ', 'MIND_MAP', 'NOTES', 'SUMMARY'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filterType === type 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {type === 'All' ? 'All Types' : type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-8 py-8 flex-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Featured Assets</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Search className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No assets found</h3>
            <p className="text-slate-500 max-w-md mt-2">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredAssets.map((asset, index) => {
              const config = TYPE_CONFIG[asset.type] || TYPE_CONFIG['NOTES'];
              
              return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group flex flex-col"
                >
                  {/* Card Header Gradient */}
                  <div className="h-24 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 relative p-4 flex items-start justify-between">
                    <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-bold ${config.bg} ${config.color} backdrop-blur-sm`}>
                      {config.icon}
                      {asset.type.replace('_', ' ')}
                    </div>
                    <button className="w-8 h-8 rounded-full bg-white/50 dark:bg-black/20 flex items-center justify-center hover:bg-white dark:hover:bg-black/40 transition-colors text-slate-500">
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="font-bold text-lg leading-tight mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                      {asset.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1">
                      By <span className="font-medium text-slate-700 dark:text-slate-300">{asset.authorName}</span>
                    </p>
                    
                    {/* Tags */}
                    <div className="flex gap-2 mb-4">
                      {asset.exam && (
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs rounded-md font-medium">
                          {asset.exam}
                        </span>
                      )}
                      {asset.subject && (
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs rounded-md font-medium">
                          {asset.subject}
                        </span>
                      )}
                    </div>
                    
                    {/* Footer Stats */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                          <span>{asset.rating.toFixed(1)}</span>
                          <span className="text-slate-400 font-normal">({asset.ratingCount})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Download className="w-4 h-4" />
                          <span>{asset.downloads}</span>
                        </div>
                      </div>
                      
                      <button className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
