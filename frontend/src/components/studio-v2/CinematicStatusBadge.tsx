/**
 * Cinematic Status Badge
 * 
 * Shows the current status of cinematic audio features in the Studio:
 * - Fully enabled (AI Director active + tracks enabled)
 * - Shadow mode (planning only, no audio mixing)
 * - Disabled (voice-only)
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clapperboard, Eye, Music, Volume2, Waves, Zap } from 'lucide-react';
import { podcastsApi } from '../../lib/api/podcasts';
import { cn } from '../../lib/utils';

interface CinematicStatus {
  enabled: boolean;
  shadowMode: boolean;
  tracks: ('music' | 'ambience' | 'sfx' | 'pause')[];
  intensity: 'subtle' | 'balanced' | 'dramatic';
  flags: {
    aiDirector: boolean;
    aiDirectorShadowMode: boolean;
    aiProducer: boolean;
    emotionVoices: boolean;
  };
}

const TRACK_ICONS: Record<string, React.ReactNode> = {
  music: <Music className="h-3 w-3" />,
  ambience: <Waves className="h-3 w-3" />,
  sfx: <Zap className="h-3 w-3" />,
  pause: <Volume2 className="h-3 w-3" />,
};

const TRACK_LABELS: Record<string, string> = {
  music: 'Music',
  ambience: 'Ambience',
  sfx: 'SFX',
  pause: 'Pauses',
};

export default function CinematicStatusBadge() {
  const [status, setStatus] = useState<CinematicStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setError(null);
        const data = await podcastsApi.getCinematicStatus();
        setStatus(data);
      } catch (err) {
        console.error('Failed to fetch cinematic status:', err);
        setError('Could not connect to backend');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    // Poll every 30s in case deployment config changes
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show loading state - always visible
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm">
        <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        <span>Loading cinematic status...</span>
      </div>
    );
  }

  // Show error state (backend not running) - always visible
  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 shadow-sm">
        <span>⚠️</span>
        <span>Backend offline</span>
      </div>
    );
  }

  // Show minimal indicator if no status data - always visible
  if (!status) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
        <span>❓</span>
        <span>No status data</span>
      </div>
    );
  }

  // Show a visible "AI Director OFF" badge if completely disabled
  if (!status.flags.aiDirector) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
        <Volume2 className="h-3.5 w-3.5" />
        <span>AI Director OFF</span>
      </div>
    );
  }

  const isActive = status.enabled;
  const isShadowMode = status.shadowMode;

  return (
    <div
      className="relative"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all',
          isActive && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
          isShadowMode && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
          !isActive && !isShadowMode && 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
        )}
      >
        {isActive ? (
          <Clapperboard className="h-3.5 w-3.5" />
        ) : isShadowMode ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
        
        <span>
          {isActive && 'Cinematic Mode'}
          {isShadowMode && 'Shadow Mode'}
          {!isActive && !isShadowMode && 'Voice Only'}
        </span>

        {isActive && status.tracks.length > 0 && (
          <span className="flex items-center gap-0.5 ml-1">
            {status.tracks.map((track) => (
              <span key={track} className="opacity-60">
                {TRACK_ICONS[track]}
              </span>
            ))}
          </span>
        )}
      </motion.div>

      {/* Expanded tooltip */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'p-2 rounded-lg',
                    isActive && 'bg-emerald-500/10',
                    isShadowMode && 'bg-amber-500/10',
                    !isActive && !isShadowMode && 'bg-slate-500/10'
                  )}
                >
                  {isActive ? (
                    <Clapperboard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : isShadowMode ? (
                    <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {isActive && 'Cinematic Audio Enabled'}
                    {isShadowMode && 'Shadow Mode Active'}
                    {!isActive && !isShadowMode && 'Voice-Only Mode'}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {isActive && 'AI Director selects background tracks automatically'}
                    {isShadowMode && 'Planning runs but audio remains voice-only'}
                    {!isActive && !isShadowMode && 'Standard podcast with voice narration'}
                  </p>
                </div>
              </div>

              {/* Active tracks */}
              {isActive && status.tracks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Active Layers
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {status.tracks.map((track) => (
                      <div
                        key={track}
                        className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded text-xs"
                      >
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {TRACK_ICONS[track]}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {TRACK_LABELS[track]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Intensity */}
              {isActive && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400">Intensity</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">
                    {status.intensity}
                  </span>
                </div>
              )}

              {/* Feature flags (for debugging) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Active Features
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">AI Director</span>
                    <span
                      className={cn(
                        'font-medium',
                        status.flags.aiDirector
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      )}
                    >
                      {status.flags.aiDirector ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">AI Producer</span>
                    <span
                      className={cn(
                        'font-medium',
                        status.flags.aiProducer
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      )}
                    >
                      {status.flags.aiProducer ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Shadow Mode</span>
                    <span
                      className={cn(
                        'font-medium',
                        status.flags.aiDirectorShadowMode
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-400'
                      )}
                    >
                      {status.flags.aiDirectorShadowMode ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Emotion TTS</span>
                    <span
                      className={cn(
                        'font-medium',
                        status.flags.emotionVoices
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-400'
                      )}
                    >
                      {status.flags.emotionVoices ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Help text */}
              {isShadowMode && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    💡 Shadow mode generates timelines with asset cues but keeps audio voice-only.
                    To hear cinematic audio, set{' '}
                    <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[10px]">
                      AI_DIRECTOR_SHADOW_MODE=false
                    </code>
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
