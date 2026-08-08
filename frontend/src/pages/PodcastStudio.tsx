import { useState } from 'react';
import { motion } from 'motion/react';
import { Headphones, Sparkles, Loader2, X, Mic, Clock, Type, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { useGeneratePodcast } from '../hooks/api/usePodcasts';
import type { PodcastType, SpeakerStyle, VoiceStyle } from '../lib/api/podcasts';

const TYPES: { id: PodcastType; label: string; desc: string }[] = [
  { id: 'custom', label: 'Custom', desc: 'Any topic you want to learn' },
  { id: 'chapter', label: 'Chapter Summary', desc: 'Summary of a specific chapter' },
  { id: 'crash_course', label: 'Crash Course', desc: 'Quick overview of a subject' },
  { id: 'weak_topic', label: 'Weak Topics', desc: 'Focus on your weakest areas' },
];

const DURATIONS = [5, 10, 20, 30, 60];

const STYLES: { id: SpeakerStyle; label: string }[] = [
  { id: 'teacher_student', label: 'Teacher & Student' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'interview', label: 'Interview' },
  { id: 'solo_narrator', label: 'Solo Narrator' },
];

const VOICES: { id: VoiceStyle; label: string }[] = [
  { id: 'warm_teacher', label: 'Warm Teacher' },
  { id: 'professional_lecturer', label: 'Professional' },
  { id: 'friendly_mentor', label: 'Friendly Mentor' },
  { id: 'energetic_coach', label: 'Energetic Coach' },
];

export default function PodcastStudio({ onClose }: { onClose: () => void }) {
  const { generate, isGenerating } = useGeneratePodcast();
  const [type, setType] = useState<PodcastType>('custom');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [style, setStyle] = useState<SpeakerStyle>('teacher_student');
  const [voice, setVoice] = useState<VoiceStyle>('warm_teacher');
  const [language, setLanguage] = useState('English');
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
        voiceStyle: voice,
        language,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to start generation');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-[#111112]">
      <div className="w-full h-full flex flex-col max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Headphones className="w-8 h-8 text-orange-500" /> AI Podcast Studio
            </h1>
            <p className="text-slate-500 dark:text-gray-400 mt-2 text-[15px]">
              Design and generate your personalized educational audio episode.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col md:flex-row gap-8">
          {/* Left Column: Configuration */}
          <div className="flex-1 space-y-8">
            <Section icon={<Type className="w-5 h-5 text-orange-500" />} title="What do you want to learn?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={cn(
                      'p-4 rounded-xl text-left border transition-all',
                      type === t.id
                        ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-500 text-orange-900 dark:text-orange-100'
                        : 'bg-white dark:bg-[#1a1a1b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:border-orange-300'
                    )}
                  >
                    <div className="font-bold text-[14px]">{t.label}</div>
                    <div className="text-[12px] opacity-80 mt-1">{t.desc}</div>
                  </button>
                ))}
              </div>
              
              {needsPrompt ? (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="e.g. Explain quantum physics in simple terms..."
                  className="w-full p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141415] text-[15px] outline-none resize-none focus:border-orange-400 dark:text-white"
                />
              ) : (
                <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 text-orange-800 dark:text-orange-200 text-[14px]">
                  This episode will automatically focus on your identified weak topics from previous quizzes and assessments.
                </div>
              )}
            </Section>

            <Section icon={<Clock className="w-5 h-5 text-orange-500" />} title="Episode Length">
              <div className="flex flex-wrap gap-3">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      'px-5 py-2.5 rounded-full text-[14px] font-semibold border transition-all',
                      duration === d
                        ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20'
                        : 'bg-white dark:bg-[#1a1a1b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-orange-300'
                    )}
                  >
                    {d} minutes
                  </button>
                ))}
              </div>
            </Section>
          </div>

          {/* Right Column: Style & Voice */}
          <div className="flex-1 space-y-8">
            <Section icon={<Mic className="w-5 h-5 text-orange-500" />} title="Voice & Style">
              <div className="space-y-3 mb-6">
                <div className="text-[13px] font-bold uppercase tracking-wider text-slate-400 mb-2">Conversation Style</div>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-[13.5px] font-medium border transition-colors',
                        style === s.id
                          ? 'bg-slate-800 border-slate-800 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-slate-300'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[13px] font-bold uppercase tracking-wider text-slate-400 mb-2">Primary Voice</div>
                <div className="grid grid-cols-2 gap-3">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVoice(v.id)}
                      className={cn(
                        'p-3 rounded-xl text-left border transition-all',
                        voice === v.id
                          ? 'bg-orange-50 border-orange-500 text-orange-900 dark:bg-orange-500/10 dark:text-orange-100'
                          : 'bg-white dark:bg-[#1a1a1b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:border-orange-300'
                      )}
                    >
                      <div className="font-semibold text-[13.5px]">{v.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section icon={<Globe className="w-5 h-5 text-orange-500" />} title="Language">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141415] text-[15px] outline-none focus:border-orange-400 dark:text-white"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="Hindi">Hindi</option>
              </select>
            </Section>

            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[14px] font-medium">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-6 mt-4 border-t border-slate-100 dark:border-white/10 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all',
              canGenerate ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/30' : 'bg-orange-500/50 cursor-not-allowed shadow-none'
            )}
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />} Generate Podcast
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1b] p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        {icon}
        <h2 className="text-[17px] font-bold text-slate-800 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}
