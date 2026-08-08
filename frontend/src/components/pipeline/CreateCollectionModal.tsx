/**
 * CreateCollectionModal Component
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import React, { useState } from 'react';
import { X, FolderPlus, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, color: string) => Promise<any>;
  isCreating: boolean;
}

const COLOR_OPTIONS = [
  { id: 'bg-indigo-500', label: 'Indigo', bgClass: 'bg-indigo-500' },
  { id: 'bg-emerald-500', label: 'Emerald', bgClass: 'bg-emerald-500' },
  { id: 'bg-rose-500', label: 'Rose', bgClass: 'bg-rose-500' },
  { id: 'bg-amber-500', label: 'Amber', bgClass: 'bg-amber-500' },
  { id: 'bg-blue-500', label: 'Blue', bgClass: 'bg-blue-500' },
  { id: 'bg-purple-500', label: 'Purple', bgClass: 'bg-purple-500' },
  { id: 'bg-teal-500', label: 'Teal', bgClass: 'bg-teal-500' },
];

export const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}) => {
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState('bg-indigo-500');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please provide a collection title');
      return;
    }

    try {
      setErrorMsg(null);
      await onCreate(title.trim(), selectedColor);
      setTitle('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create collection');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                New Knowledge Collection
              </h3>
              <p className="text-[11.5px] text-slate-400 dark:text-gray-500">
                Organize learning materials into a structured knowledge base.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
              Collection Title
            </label>
            <input
              type="text"
              placeholder="e.g. Class 10 Physics NCERT, JEE Organic Chemistry"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isCreating}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-gray-300 mb-2">
              Color Theme Accent
            </label>
            <div className="flex items-center gap-2.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedColor(c.id)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform',
                    c.bgClass,
                    selectedColor === c.id
                      ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {errorMsg && (
            <p className="text-[12px] text-rose-600 dark:text-rose-400 font-medium">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !title.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                </>
              ) : (
                'Create Collection'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
