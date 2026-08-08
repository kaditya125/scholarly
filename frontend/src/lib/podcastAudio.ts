/**
 * Shared podcast audio controller.
 *
 * A single `HTMLAudioElement` owned outside React, so every surface that can
 * play a podcast — the result card in the conversation and the player docked
 * under the transcript — drives the same stream. Without this, each component
 * would mount its own `<audio>` and you'd get two overlapping playbacks.
 *
 * It also makes transcript sync possible: the transcript panel reads
 * `currentTime` from here to highlight the line being spoken, and writes to it
 * when the user clicks a segment.
 *
 * Signed audio URLs are short-lived, so they're resolved on demand per podcast
 * and cached only for the duration of the loaded track.
 */

import { podcastsApi } from './api/podcasts';

export interface PodcastAudioState {
  /** Podcast currently loaded into the element, if any. */
  podcastId: string | null;
  isPlaying: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds. 0 until metadata loads. */
  duration: number;
  playbackRate: number;
  muted: boolean;
  /** True while a signed URL is being resolved. */
  loading: boolean;
  error: string | null;
}

const INITIAL: PodcastAudioState = {
  podcastId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  muted: false,
  loading: false,
  error: null,
};

/** Speeds cycled by `cycleRate`, matching common podcast players. */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

let state: PodcastAudioState = { ...INITIAL };
let element: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<PodcastAudioState>): void {
  state = { ...state, ...patch };
  emit();
}

/** Create the singleton element on first use and wire its events once. */
function ensureElement(): HTMLAudioElement {
  if (element) return element;

  const el = new Audio();
  el.preload = 'metadata';

  el.addEventListener('play', () => setState({ isPlaying: true }));
  el.addEventListener('pause', () => setState({ isPlaying: false }));
  el.addEventListener('ended', () => setState({ isPlaying: false, currentTime: 0 }));
  el.addEventListener('timeupdate', () => setState({ currentTime: el.currentTime }));
  el.addEventListener('loadedmetadata', () => {
    if (isFinite(el.duration) && el.duration > 0) setState({ duration: el.duration });
  });
  el.addEventListener('error', () =>
    setState({
      isPlaying: false,
      loading: false,
      error: 'The audio file could not be played.',
    })
  );

  element = el;
  return el;
}

/**
 * Point the element at a podcast, resolving its signed URL if needed. Returns
 * false when no audio is available. A no-op when the podcast is already loaded.
 */
async function load(podcastId: string, knownUrl?: string): Promise<boolean> {
  if (state.podcastId === podcastId && element?.src) return true;

  const el = ensureElement();
  setState({ loading: true, error: null });

  try {
    const url = knownUrl || (await podcastsApi.getAudioUrl(podcastId));
    if (!url) {
      setState({ loading: false, error: 'Audio is not available for this podcast yet.' });
      return false;
    }

    el.pause();
    el.src = url;
    // Clear duration so consumers fall back to the new podcast's stored length
    // until real metadata lands. Keeping the previous track's duration would
    // briefly show the wrong total and a mis-scaled progress bar.
    setState({
      podcastId,
      loading: false,
      error: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
    });
    el.playbackRate = state.playbackRate;
    el.muted = state.muted;
    return true;
  } catch (err: any) {
    console.error('[podcastAudio] Failed to resolve audio URL:', err);
    setState({
      loading: false,
      error:
        err?.response?.data?.error || err?.message || 'Could not load the audio.',
    });
    return false;
  }
}

export const podcastAudio = {
  getState(): PodcastAudioState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Play (loading first if necessary). */
  async play(podcastId: string, knownUrl?: string): Promise<void> {
    const ok = await load(podcastId, knownUrl);
    if (!ok || !element) return;
    try {
      await element.play();
    } catch (err) {
      console.warn('[podcastAudio] play() rejected:', err);
    }
  },

  pause(): void {
    element?.pause();
  },

  /** Play/pause the given podcast, switching tracks if a different one is up. */
  async toggle(podcastId: string, knownUrl?: string): Promise<void> {
    if (state.podcastId === podcastId && element && !element.paused) {
      element.pause();
      return;
    }
    await this.play(podcastId, knownUrl);
  },

  /** Seek to an absolute position in seconds. */
  seek(seconds: number): void {
    if (!element || !isFinite(seconds)) return;
    const max = element.duration || state.duration || seconds;
    element.currentTime = Math.max(0, Math.min(seconds, max));
    setState({ currentTime: element.currentTime });
  },

  /** Seek relative to the current position. */
  skip(delta: number): void {
    if (!element) return;
    this.seek(element.currentTime + delta);
  },

  /**
   * Seek to a millisecond offset, loading and starting playback first if this
   * podcast isn't the one currently loaded. Used when clicking a transcript
   * segment or a chapter.
   */
  async seekTo(podcastId: string, ms: number, knownUrl?: string): Promise<void> {
    const seconds = ms / 1000;
    if (state.podcastId !== podcastId) {
      const ok = await load(podcastId, knownUrl);
      if (!ok || !element) return;
      // Metadata may not be in yet; setting currentTime before it lands is
      // ignored by browsers, so wait for the one-shot metadata event.
      const el = element;
      if (el.readyState >= 1) {
        this.seek(seconds);
      } else {
        el.addEventListener('loadedmetadata', () => this.seek(seconds), { once: true });
      }
      try {
        await el.play();
      } catch {
        /* autoplay may be blocked; the user can press play */
      }
      return;
    }
    this.seek(seconds);
  },

  setRate(rate: number): void {
    if (element) element.playbackRate = rate;
    setState({ playbackRate: rate });
  },

  /** Step to the next rate in `PLAYBACK_RATES`. */
  cycleRate(): void {
    const idx = PLAYBACK_RATES.indexOf(state.playbackRate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    this.setRate(next);
  },

  toggleMuted(): void {
    const muted = !state.muted;
    if (element) element.muted = muted;
    setState({ muted });
  },

  /** Release the element. Call when leaving the workspace entirely. */
  reset(): void {
    element?.pause();
    if (element) element.src = '';
    state = { ...INITIAL, playbackRate: state.playbackRate, muted: state.muted };
    emit();
  },
};

/** Format seconds as `m:ss`, or `h:mm:ss` once past an hour. */
export function formatAudioTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
