import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { ttsService } from '../../../services/ai/tts.service';
import { getStorage } from 'firebase-admin/storage';
import { PodcastPlan, TranscriptSegment, PodcastChapter, ComposedAudio, ComposedChunks } from './types';
import type { GeneratedScript } from './ConversationGenerator';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

// ffprobe gives accurate per-segment durations. It's OPTIONAL: if the binary isn't available
// we fall back to a word-count estimate, so timings degrade gracefully but never block audio.
let ffprobeReady = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic?.path) {
    ffmpeg.setFfprobePath(ffprobeStatic.path);
    ffprobeReady = true;
  }
} catch {
  ffprobeReady = false;
}

const WORDS_PER_SEC = 2.5;

/**
 * AudioComposer — the "TTS + stitching + transcript sync" stage.
 * For each script line it synthesizes speech (reusing the existing ttsService, whose voiceMap
 * keys are speaker ROLES), probes the real clip duration (ffprobe, word-count fallback),
 * accumulates precise start/end timings, then stitches everything into one MP3 with ffmpeg.
 * Returns the audio path, a time-synced transcript (click-to-seek), and chapter markers.
 *
 * Phase 1 uses ttsService directly; Phase 2 swaps it for the multi-vendor TTSProviderRegistry.
 */
export class AudioComposer {
  private estimateMs(text: string): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(800, Math.round((words / WORDS_PER_SEC) * 1000));
  }

  private probeMs(file: string, fallbackText: string): Promise<number> {
    if (!ffprobeReady) return Promise.resolve(this.estimateMs(fallbackText));
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.warn(`[AudioComposer] ffprobe timed out for ${file}, falling back to estimate`);
          resolve(this.estimateMs(fallbackText));
        }
      }, 5000);

      ffmpeg.ffprobe(file, (err: any, data: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const dur = data?.format?.duration;
        if (err || !dur || !isFinite(dur)) return resolve(this.estimateMs(fallbackText));
        resolve(Math.round(dur * 1000));
      });
    });
  }

  private stitch(inputs: string[], out: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      inputs.forEach((f) => command.input(f));
      command
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .mergeToFile(out, path.dirname(out));
    });
  }

  async composeChunks(
    userId: string,
    podcastId: string,
    notebookScope: string,
    plan: PodcastPlan,
    script: GeneratedScript,
    tempDir: string,
    existingTtsSegments: Record<number, { durMs: number; storagePath: string }> = {},
    opts?: { onProgress?: (done: number, total: number) => void },
  ): Promise<ComposedChunks> {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const roleByName = new Map(plan.speakers.map((s) => [s.name, s.role]));

    const transcript: TranscriptSegment[] = [];
    let cursorMs = 0;

    const batchSize = 10;
    const ttsSegments: Record<number, { durMs: number; storagePath: string }> = { ...existingTtsSegments };
    const bucket = getStorage().bucket();
    const basePath = `podcasts/${userId}/${notebookScope}/${podcastId}/chunks`;

    // Parallelize TTS generation in batches to prevent overwhelming the provider while reducing total latency
    for (let i = 0; i < script.lines.length; i += batchSize) {
      const batch = script.lines.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (line, batchIdx) => {
          const globalIdx = i + batchIdx;
          if (ttsSegments[globalIdx]) {
            return; // Skip already synthesized chunk
          }
          const role = roleByName.get(line.speaker) || line.speaker;
          const segPath = path.join(tempDir, `seg_${globalIdx}.mp3`);
          
          await ttsService.synthesize({ 
            text: line.text, 
            speaker: role,
            language: plan.language,  // Pass language from plan
            userId,      // For cost tracking
            podcastId    // For cost tracking
          }, segPath);
          const durMs = await this.probeMs(segPath, line.text);
          
          const destPath = `${basePath}/seg_${globalIdx}.mp3`;
          await bucket.upload(segPath, { destination: destPath, metadata: { contentType: 'audio/mpeg' } });
          
          ttsSegments[globalIdx] = { durMs, storagePath: destPath };
        })
      );
      opts?.onProgress?.(Math.min(i + batchSize, script.lines.length), script.lines.length);
    }

    // Reconstruct linear timings for the transcript
    for (let i = 0; i < script.lines.length; i++) {
      const line = script.lines[i];
      const { durMs } = ttsSegments[i];

      const startMs = cursorMs;
      const endMs = cursorMs + durMs;
      cursorMs = endMs;

      transcript.push({
        segmentId: i,
        chapterIndex: line.chapterIndex,
        speaker: line.speaker,
        text: line.text,
        startMs,
        endMs,
        citations: line.citations || [],
      });
    }

    // Chapter markers from chapterIndex boundaries, using real line timings.
    const chapters: PodcastChapter[] = plan.segments.map((seg) => {
      const segLines = transcript.filter((t) => t.chapterIndex === seg.index);
      const startMs = segLines.length ? segLines[0].startMs : 0;
      const endMs = segLines.length ? segLines[segLines.length - 1].endMs : startMs;
      return { index: seg.index, title: seg.title, startMs, endMs };
    });

    const totalCharacters = script.lines.reduce((a, l) => a + l.text.length, 0);
    return {
      ttsSegments,
      transcript,
      chapters,
      durationMs: cursorMs,
      totalWords: script.totalWords,
      totalCharacters,
    };
  }

  async stitchChunks(
    chunks: ComposedChunks,
    tempDir: string
  ): Promise<ComposedAudio> {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const bucket = getStorage().bucket();
    const segmentPaths: string[] = [];
    
    // Download all chunks in parallel
    const downloadPromises = Object.entries(chunks.ttsSegments).map(async ([idxStr, seg]) => {
      const idx = parseInt(idxStr, 10);
      const localPath = path.join(tempDir, `seg_${idx}.mp3`);
      await bucket.file(seg.storagePath).download({ destination: localPath });
      return { idx, localPath };
    });
    
    const downloaded = await Promise.all(downloadPromises);
    downloaded.sort((a, b) => a.idx - b.idx);
    downloaded.forEach(d => segmentPaths.push(d.localPath));

    const outputPath = path.join(tempDir, 'final.mp3');
    await this.stitch(segmentPaths, outputPath);

    return {
      ...chunks,
      audioLocalPath: outputPath,
    };
  }
}

export const audioComposer = new AudioComposer();
