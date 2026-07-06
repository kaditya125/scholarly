import React, { useState, useEffect, useRef } from 'react';
import { User, Trophy, Flame, Target, BookOpen, Star, Crown, ChevronRight, Settings, Camera, Upload, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api/client';
import { uploadAvatar, UploadProgress } from '../lib/api/avatar';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadProgress | null>(null);
  const [stats, setStats] = useState({
    streak: 12,
    mastery: 78,
    notebooks: 5,
    publicAssets: 3,
    reputation: 450
  });

  const badges = [
    { id: 1, name: '7-Day Streak', icon: <Flame className="w-5 h-5 text-orange-500" />, color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' },
    { id: 2, name: 'Master of Physics', icon: <Crown className="w-5 h-5 text-amber-500" />, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
    { id: 3, name: 'Early Adopter', icon: <Star className="w-5 h-5 text-indigo-500" />, color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' }
  ];

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadState({ progress: 0, status: 'error', error: 'Please select an image file.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadState({ progress: 0, status: 'error', error: 'File size must be less than 5MB.' });
      return;
    }

    try {
      await uploadAvatar(file, (progress) => {
        setUploadState(progress);
      });
      // Small delay to let Firebase settle, then refresh auth context state
      setTimeout(() => {
        refreshUser();
        setUploadState(null);
      }, 1500);
    } catch (error) {
      console.error('Avatar upload failed:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#131314] overflow-y-auto">
      {/* Header Profile Section */}
      <div className="relative">
        <div className="h-48 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400"></div>
        <div className="px-8 flex items-end -mt-16 sm:-mt-20 mb-8">
          <div className="relative">
            <div 
              className="group relative w-32 h-32 sm:w-40 sm:h-40 bg-white dark:bg-slate-800 rounded-full border-4 border-slate-50 dark:border-[#131314] flex items-center justify-center text-4xl sm:text-5xl font-bold text-indigo-500 shadow-xl overflow-hidden cursor-pointer"
              onClick={handleAvatarClick}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'
              )}

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                <Camera className="w-8 h-8 mb-1" />
                <span className="text-xs font-medium">Update Photo</span>
              </div>

              {/* Upload Progress Overlay */}
              {uploadState && uploadState.status !== 'done' && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white z-10">
                  {uploadState.status === 'processing' && (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <span className="text-xs">Processing...</span>
                    </>
                  )}
                  {uploadState.status === 'uploading' && (
                    <>
                      <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-indigo-500 animate-spin absolute" />
                      <span className="text-sm font-bold z-10">{Math.round(uploadState.progress)}%</span>
                    </>
                  )}
                  {uploadState.status === 'error' && (
                    <>
                      <AlertCircle className="w-8 h-8 text-red-500 mb-1" />
                      <span className="text-xs text-center px-2">{uploadState.error || 'Failed'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
            <button className="absolute bottom-2 right-2 w-10 h-10 bg-white dark:bg-slate-700 rounded-full shadow-lg border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-slate-50 transition-colors z-20">
              <Settings className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
          <div className="ml-6 mb-4 flex-1">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{user?.displayName || 'Student'}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="px-8 pb-12 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Stats & Badges */}
        <div className="lg:col-span-1 space-y-6">
          {/* Stats Card */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500" />
              Learning Overview
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Study Streak</span>
                </div>
                <span className="font-bold text-lg">{stats.streak} Days</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Mastery</span>
                </div>
                <span className="font-bold text-lg">{stats.mastery}%</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-teal-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Notebooks</span>
                </div>
                <span className="font-bold text-lg">{stats.notebooks}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-purple-500" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Reputation</span>
                </div>
                <span className="font-bold text-lg">{stats.reputation}</span>
              </div>
            </div>
          </div>

          {/* Badges Card */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Achievements
            </h2>
            <div className="flex flex-wrap gap-3">
              {badges.map(badge => (
                <div key={badge.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${badge.color}`}>
                  {badge.icon}
                  <span className="font-medium text-sm">{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Public Assets */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm h-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-teal-500" />
                My Published Assets
              </h2>
              <button className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium text-sm flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            {stats.publicAssets === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">No Published Assets</h3>
                <p className="text-slate-500 max-w-sm mt-2">Share your flashcards, quizzes, and notes with the community to build reputation.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border border-slate-100 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Complete Biology Notes</h4>
                        <p className="text-sm text-slate-500">Published {i + 1} days ago • 120 Downloads</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">4.{9-i}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
// Temporary mock import for Award
import { Award } from 'lucide-react';
