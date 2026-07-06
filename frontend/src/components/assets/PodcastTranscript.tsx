import { useState, useEffect, useRef } from 'react';
import { PodcastMetadata } from '../../types';
import { Loader2 } from 'lucide-react';

interface TranscriptSegment {
  speaker: string;
  text: string;
  segmentId: number;
}

export default function PodcastTranscript({ metadata, currentTime }: { metadata: PodcastMetadata, currentTime: number }) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (metadata.transcriptUrl) {
      setLoading(true);
      fetch(metadata.transcriptUrl)
        .then(res => res.json())
        .then(data => {
          setTranscript(data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to load transcript", err);
          setLoading(false);
        });
    }
  }, [metadata.transcriptUrl]);

  // Rough estimation of active segment based on time, since actual timestamps aren't strictly generated yet.
  // We assume an average speaking rate of 150 words per minute (2.5 words per sec).
  const calculateActiveSegment = () => {
    let accumulatedTime = 0;
    for (let i = 0; i < transcript.length; i++) {
      const words = transcript[i].text.split(' ').length;
      const duration = words / 2.5; // seconds
      if (currentTime >= accumulatedTime && currentTime <= accumulatedTime + duration) {
        return i;
      }
      accumulatedTime += duration;
    }
    return transcript.length - 1;
  };

  const activeSegmentIndex = calculateActiveSegment();

  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector(`[data-segment-id="${activeSegmentIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex]);

  if (!metadata.transcriptUrl) {
    return null; // Not ready yet
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="max-h-[400px] overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-6"
    >
      {transcript.map((segment, index) => {
        const isActive = index === activeSegmentIndex;
        const isHost = segment.speaker.toLowerCase().includes('host');
        
        return (
          <div 
            key={index} 
            data-segment-id={index}
            className={`flex gap-4 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
          >
            <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${isHost ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'}`}>
              {segment.speaker.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-sm text-slate-500 mb-1">{segment.speaker}</div>
              <p className={`text-[15px] leading-relaxed ${isActive ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-300'}`}>
                {segment.text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
