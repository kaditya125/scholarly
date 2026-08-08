import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Monitor, Sun, Moon, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useTheme,
  BACKGROUND_PRESETS,
  CHAT_COLOR_PRESETS,
} from '../lib/ThemeContext';

type Pref = 'system' | 'light' | 'dark';

/** Mini window mock used inside each theme preview card. */
function ThemePreview({ variant }: { variant: Pref }) {
  const isDark = variant === 'dark';
  const isSplit = variant === 'system';
  return (
    <div className={cn('w-full h-full rounded-md overflow-hidden flex', isDark ? 'bg-[#1e1e20]' : 'bg-white')}>
      {/* left rail */}
      <div className={cn('w-1/3 p-1.5 space-y-1', isSplit ? 'bg-[#1e1e20]' : isDark ? 'bg-[#151517]' : 'bg-slate-100')}>
        <div className={cn('h-1.5 w-3/4 rounded-full', isSplit || isDark ? 'bg-white/25' : 'bg-slate-300')} />
        <div className={cn('h-1.5 w-1/2 rounded-full', isSplit || isDark ? 'bg-white/15' : 'bg-slate-200')} />
        <div className={cn('h-1.5 w-2/3 rounded-full', isSplit || isDark ? 'bg-white/15' : 'bg-slate-200')} />
      </div>
      {/* main */}
      <div className="flex-1 p-1.5 space-y-1">
        <div className={cn('h-1.5 w-1/2 rounded-full', isDark ? 'bg-white/30' : 'bg-slate-300')} />
        <div className={cn('h-4 w-full rounded', isDark ? 'bg-white/10' : 'bg-slate-100')} />
        <div className={cn('h-4 w-5/6 rounded', isDark ? 'bg-white/10' : 'bg-slate-100')} />
      </div>
    </div>
  );
}

const THEME_OPTIONS: { id: Pref; label: string; icon: typeof Monitor }[] = [
  { id: 'system', label: 'System preference', icon: Monitor },
  { id: 'light', label: 'Light mode', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

export function AppearanceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { themePreference, setThemePreference, background, setBackground, chatColor, setChatColor } = useTheme();

  // Draft state so Cancel discards and Save commits (matches the template's buttons).
  const [draftPref, setDraftPref] = useState<Pref>(themePreference);
  const [draftBg, setDraftBg] = useState(background);
  const [draftChat, setDraftChat] = useState(chatColor);

  // Re-sync the draft each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDraftPref(themePreference);
      setDraftBg(background);
      setDraftChat(chatColor);
    }
  }, [isOpen, themePreference, background, chatColor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const bgEnabled = draftBg !== 'none';
  const chatEnabled = draftChat !== 'none';

  const save = () => {
    setThemePreference(draftPref);
    setBackground(draftBg);
    setChatColor(draftChat);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-[#1a1a1b] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Palette className="w-[18px] h-[18px] text-slate-700 dark:text-slate-200" />
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Appearance</h2>
              </div>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Interface Theme */}
              <div className="mb-6">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Interface Theme</h3>
                <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mb-4">Select or customize your UI theme</p>

                <div className="grid grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((opt) => {
                    const selected = draftPref === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setDraftPref(opt.id)}
                        className="text-left group"
                      >
                        <div
                          className={cn(
                            'aspect-[4/3] rounded-xl p-2 border-2 transition-colors',
                            selected ? 'border-indigo-500' : 'border-slate-200 dark:border-white/10 group-hover:border-slate-300 dark:group-hover:border-white/20'
                          )}
                        >
                          <ThemePreview variant={opt.id} />
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mt-2">
                          <opt.icon className="w-3.5 h-3.5 text-slate-500 dark:text-gray-400" />
                          <span className={cn('text-[12.5px]', selected ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-500 dark:text-gray-400')}>
                            {opt.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background */}
              <div className="py-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Background</h3>
                    <p className="text-[12.5px] text-slate-500 dark:text-gray-400">Customize your background</p>
                  </div>
                  <Toggle on={bgEnabled} onClick={() => setDraftBg(bgEnabled ? 'none' : BACKGROUND_PRESETS[0].id)} />
                </div>
                <AnimatePresence>
                  {bgEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-3 pt-4">
                        {BACKGROUND_PRESETS.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setDraftBg(b.id)}
                            title={b.label}
                            className={cn(
                              'relative w-14 h-10 rounded-lg border-2 transition-transform hover:scale-105',
                              draftBg === b.id ? 'border-indigo-500' : 'border-transparent ring-1 ring-slate-200 dark:ring-white/10'
                            )}
                            style={{ backgroundImage: b.swatch }}
                          >
                            {draftBg === b.id && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white drop-shadow" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Chat Color */}
              <div className="py-4 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Chat Color</h3>
                    <p className="text-[12.5px] text-slate-500 dark:text-gray-400">Customize your chat</p>
                  </div>
                  <Toggle on={chatEnabled} onClick={() => setDraftChat(chatEnabled ? 'none' : CHAT_COLOR_PRESETS[0].color)} />
                </div>
                <AnimatePresence>
                  {chatEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-3 pt-4">
                        {CHAT_COLOR_PRESETS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setDraftChat(c.color)}
                            title={c.id}
                            className={cn(
                              'relative w-9 h-9 rounded-full border-2 transition-transform hover:scale-110',
                              draftChat === c.color ? 'border-slate-900 dark:border-white' : 'border-transparent'
                            )}
                            style={{ backgroundColor: c.color }}
                          >
                            {draftChat === c.color && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-semibold text-slate-700 dark:text-gray-200 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:opacity-90 transition-opacity"
              >
                Save changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors shrink-0',
        on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-white/15'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          on && 'translate-x-5'
        )}
      />
    </button>
  );
}
