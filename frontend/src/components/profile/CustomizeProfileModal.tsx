import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Check, Loader2, Target, BookOpen, Layers, Award } from 'lucide-react';
import { useProfile } from '../../hooks/api/useProfile';
import {
  LearningProfile,
  GOALS,
  BOARDS,
  STREAMS,
  SUBJECTS,
  LEVELS,
  profileCompletion,
  PreparationLevel,
} from '../../lib/onboardingOptions';

interface CustomizeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomizeProfileModal({ isOpen, onClose }: CustomizeProfileModalProps) {
  const { profile, updateProfile, isUpdating } = useProfile();
  const [form, setForm] = useState<LearningProfile>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm(profile);
    }
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const set = (patch: Partial<LearningProfile>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const toggleSubject = (sub: string) => {
    const cur = new Set(form.subjects || []);
    if (cur.has(sub)) cur.delete(sub);
    else cur.add(sub);
    set({ subjects: Array.from(cur) });
  };

  const handleSave = async () => {
    try {
      const goalVal = form.goal || form.targetExam || 'Class 10';
      await updateProfile({
        ...form,
        goal: goalVal,
        targetExam: goalVal,
        markComplete: true,
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (e) {
      console.error('Failed to update profile:', e);
    }
  };

  const pct = profileCompletion(form);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 p-6 md:p-8 text-white shadow-2xl backdrop-blur-2xl my-8"
        >
          {/* Top ambient glow */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-amber-500/15 blur-[90px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-indigo-500/15 blur-[90px]" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400/20 via-orange-500/20 to-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Customize AI Profile
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {pct}% Complete
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Personalize your target exam, board, and learning preferences so your AI tutor adapts to you.
              </p>
            </div>
          </div>

          {/* Form Content */}
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            {/* Goal / Target Exam */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-400" /> What are you preparing for? (Goal / Exam)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {GOALS.slice(0, 12).map((g) => {
                  const selected = form.goal === g || form.targetExam === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set({ goal: g, targetExam: g })}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left truncate border ${
                        selected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Board & Class Level */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Education Board
                </label>
                <select
                  value={form.board || ''}
                  onChange={(e) => set({ board: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  <option value="" className="bg-slate-900">Select Board</option>
                  {BOARDS.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" /> Class / Grade
                </label>
                <input
                  type="text"
                  placeholder="e.g. Class 10 or Class 12"
                  value={form.classLevel || ''}
                  onChange={(e) => set({ classLevel: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Stream & Target Aspiration */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                  Stream (for Class 11+)
                </label>
                <select
                  value={form.stream || ''}
                  onChange={(e) => set({ stream: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                >
                  <option value="" className="bg-slate-900">Select Stream</option>
                  {STREAMS.map((s) => (
                    <option key={s} value={s} className="bg-slate-900 text-white">
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-rose-400" /> Target Goal / Score
                </label>
                <input
                  type="text"
                  placeholder="e.g. 95% Marks, Top 1000 rank"
                  value={form.target || ''}
                  onChange={(e) => set({ target: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Preparation Level */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Preparation Level</label>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((lvl) => {
                  const selected = form.preparationLevel === lvl.value;
                  return (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => set({ preparationLevel: lvl.value as PreparationLevel })}
                      className={`p-2.5 rounded-xl text-left border transition-all ${
                        selected
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{lvl.label}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{lvl.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Focus Subjects */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Focus Subjects</label>
              <div className="flex flex-wrap gap-1.5">
                {SUBJECTS.map((s) => {
                  const selected = (form.subjects || []).includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSubject(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        selected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {selected ? `✓ ${s}` : `+ ${s}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-semibold text-xs shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-slate-950" /> Saved & Personalizing AI!
                </>
              ) : (
                'Save & Apply to AI Tutor'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
