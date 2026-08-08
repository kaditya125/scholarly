/**
 * React binding for the shared podcast audio controller.
 *
 * Subscribes to the singleton in `lib/podcastAudio` so any component can read
 * live playback state (position, duration, rate, playing) without owning an
 * `<audio>` element of its own.
 */

import { useEffect, useState } from 'react';
import { podcastAudio, type PodcastAudioState } from '../lib/podcastAudio';

export function usePodcastAudio(): PodcastAudioState {
  const [snapshot, setSnapshot] = useState<PodcastAudioState>(podcastAudio.getState);

  useEffect(() => {
    // Re-read on mount in case playback changed between render and effect.
    setSnapshot(podcastAudio.getState());
    return podcastAudio.subscribe(() => setSnapshot(podcastAudio.getState()));
  }, []);

  return snapshot;
}
