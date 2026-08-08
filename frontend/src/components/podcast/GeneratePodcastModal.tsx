import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Loader2, Headphones } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGeneratePodcast } from '../../hooks/api/usePodcasts';
import type { PodcastType, SpeakerStyle } from '../../lib/api/podcasts';

const TYPES: { id: PodcastType; label: string }[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'chapter', label: 'Chapter' },
  { id: 'revision', label: 'Revision' },
  { id: 'crash_course', label: 'Crash Course' },
  { id: 'exam_revision', label: 'Exam Revision' },
  { id: 'weak_topic', label: 'Weak Topics' },
];

const DURATIONS = [5, 10, 20, 30, 60];

const STYLES: { id: SpeakerStyle; label: string }[] = [
  { id: 'teacher_student', label: 'Teacher & Student' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'interview', label: 'Interview' },
  { id: 'solo_narrator', label: 'Solo Narrator' },
];

/**
 * Minimal but functional "Create a podcast" trigger (Phase 1). Picks a type, a topic/prompt
 * (or weak-topics), a length and a conversation style, then kicks off the durable generation
 * job. The full "AI Podcast Studio" (voice preview, personalization summary, estimate) is Phase 4.
 */
export default function GeneratePodcastModal({ onClose }: { onClose: () => void }) {
  const { generate, isGenerating } = useGeneratePodcast();
  const [type, setType] = useState<PodcastType>('custom');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [style, setStyle] = useState<SpeakerStyle>('teacher_student');
  const [error, setError] = useState<string | null>(null);

  const needsPrompt = type !== 'weak_topic';
  const canGenerate = !isGenerating && (!needsPrompt || prompt.trim().length > 0);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setError(null);
    try {
      await generate({
        type,
        source: needsPrompt ? { kind: 'prompt', prompt: prompt.trim() } : { kind: 'weak_topics' },
        durationMinutes: duration,
        speakerStyle: style,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to start generation');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-orange-500" />
            </div>
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">Create a podcast</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <Field label="Type">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>{t.label}</Chip>
              ))}
            </div>
          </Field>

          {needsPrompt ? (
            <Field label="What should this episode cover?">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Explain photosynthesis for a class 10 student, with analogies and exam tips."
                className="w-full px-3.5 py-2.5 rounded-xl border text-[14px] outline-none resize-none transition-colors bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-orange-400 dark:bg-[#141415] dark:border-white/10 dark:text-slate-100 dark:placeholder:text-gray-500"
              />
            </Field>
          ) : (
            <div className="text-[13px] text-slate-600 dark:text-gray-300 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 px-3.5 py-3">
              We'll build this episode from your weak topics automatically — no prompt needed.
            </div>
          )}

          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} min</Chip>
              ))}
            </div>
          </Field>

          <Field label="Conversation style">
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Chip key={s.id} active={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</Chip>
              ))}
            </div>
          </Field>

          {error && <div className="text-[13px] font-medium text-rose-600 dark:text-rose-400">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13.5px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'inline-flex items-center gap-2 px-5 py-2 rounded-lg text-[13.5px] font-bold text-white transition-colors',
              canGenerate ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-500/50 cursor-not-allowed',
            )}
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors',
        active
          ? 'bg-orange-500 border-orange-500 text-white'
          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-300 dark:bg-white/5 dark:border-white/10 dark:text-gray-300',
      )}
    >
      {children}
    </button>
  );
}
