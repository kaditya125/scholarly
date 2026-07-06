import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { PodcastMetadata } from '../../types';

export default function PodcastPlayer({ metadata, onTimeUpdate }: { metadata: PodcastMetadata, onTimeUpdate?: (time: number) => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (onTimeUpdate) onTimeUpdate(audio.currentTime);
    };
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
    };
  }, [onTimeUpdate]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const changeSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
      setPlaybackRate(nextSpeed);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!metadata.audioUrl) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500 mb-4" />
        <p className="text-slate-500">Audio is currently {metadata.status.toLowerCase().replace('_', ' ')}...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
      <audio ref={audioRef} src={metadata.audioUrl} preload="metadata" />
      
      <div className="flex flex-col gap-4">
        {/* Progress Bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 font-medium w-10 text-right">{formatTime(currentTime)}</span>
          <input 
            type="range" 
            min="0" 
            max={duration || 100} 
            value={currentTime} 
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500"
          />
          <span className="text-xs text-slate-500 font-medium w-10">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <button 
            onClick={changeSpeed}
            className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {playbackRate}x
          </button>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 15; }}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <SkipBack className="w-6 h-6" />
            </button>

            <button 
              onClick={togglePlay}
              className="w-12 h-12 flex items-center justify-center bg-teal-500 hover:bg-teal-600 text-white rounded-full transition-transform active:scale-95 shadow-md shadow-teal-500/20"
            >
              {isBuffering ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6" fill="currentColor" />
              ) : (
                <Play className="w-6 h-6 ml-1" fill="currentColor" />
              )}
            </button>

            <button 
              onClick={() => { if (audioRef.current) audioRef.current.currentTime += 15; }}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={toggleMute}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={isMuted ? 0 : volume} 
              onChange={(e) => {
                const vol = Number(e.target.value);
                setVolume(vol);
                if (audioRef.current) audioRef.current.volume = vol;
                if (vol > 0 && isMuted) setIsMuted(false);
              }}
              className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer hidden sm:block [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
