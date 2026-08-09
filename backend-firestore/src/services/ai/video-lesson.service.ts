import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import ffmpegPath from 'ffmpeg-static';
import { db } from '../../config/firebase';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { GeminiProvider } from './gemini.provider';
import { veoVideoService } from './veo-video.service';

/**
 * VideoLessonService — turns a concept into a ~1-minute explainer video by:
 *   1. LLM storyboard: split the concept into N ~8s scenes (Gemini, ~free).
 *   2. Generate a veo-3.1-lite clip per scene (2 concurrent = Veo limit).
 *   3. ffmpeg-concat the clips into one final mp4, upload to GCS.
 *
 * Cost controls: results are CACHED per concept (generate once, serve forever),
 * and NEW generations are capped per user per day. Runs as a background job whose
 * progress is persisted in Firestore (collection `video_lessons`) and polled by
 * the client.
 */
export interface LessonScene { prompt: string; narration: string; status: 'pending' | 'generating' | 'done' | 'failed'; videoUri?: string; }
export interface VideoLesson {
  id: string; topic: string; topicKey: string; userId: string;
  status: 'PENDING' | 'STORYBOARD' | 'RENDERING' | 'MERGING' | 'READY' | 'FAILED';
  scenes: LessonScene[]; finalVideoUri?: string; error?: string;
  cached?: boolean; createdAt: number; updatedAt: number;
}

const SCENE_COUNT = Math.max(3, Math.min(parseInt(env.VIDEO_LESSON_SCENES || '6', 10) || 6, 8));
const DAILY_LIMIT = Math.max(1, parseInt(env.VIDEO_LESSON_DAILY_LIMIT || '2', 10) || 2);
const CONCURRENCY = 2; // Veo tier-1 concurrent long-running requests

const COL = 'video_lessons';
const normalizeTopic = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);

export class VideoLessonService {
  private auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...(env.GROK_SA_KEY_FILE ? { keyFile: env.GROK_SA_KEY_FILE } : {}),
  });

  private async token(): Promise<string> {
    const t = await (await this.auth.getClient()).getAccessToken();
    if (!t?.token) throw new Error('Failed to obtain OAuth token for video lesson.');
    return t.token;
  }

  /** LLM: break the concept into consistent, sequential ~8s scene prompts. */
  private async buildStoryboard(topic: string): Promise<LessonScene[]> {
    const gemini = new GeminiProvider();
    const prompt = `You are an educational video director. Break the concept "${topic}" into exactly ${SCENE_COUNT} sequential scenes that together form one coherent ~${SCENE_COUNT * 8}-second explainer for a student.
For EACH scene write a detailed Veo video prompt describing ONE continuous ~8-second shot: visuals, camera movement, and a keep-it-consistent style ("clean modern 3D educational animation, vibrant colors, soft cinematic lighting, no on-screen text"). Also give a single spoken narration sentence for that scene.
The scenes must build on each other logically (intro -> mechanism -> conclusion).
Output ONLY a raw JSON array, no markdown: [{"prompt":"...","narration":"..."}]`;
    const res = await gemini.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() } as any], 'You output only strict JSON arrays.');
    let jsonStr = (res.reply || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const start = jsonStr.indexOf('['); const end = jsonStr.lastIndexOf(']');
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Storyboard generation returned no scenes.');
    return parsed.slice(0, SCENE_COUNT).map((s: any) => ({
      prompt: String(s.prompt || '').trim(),
      narration: String(s.narration || '').trim(),
      status: 'pending' as const,
    })).filter((s: LessonScene) => s.prompt.length > 0);
  }

  private parseGs(uri: string): { bucket: string; object: string } {
    const w = uri.slice('gs://'.length);
    const i = w.indexOf('/');
    return { bucket: w.slice(0, i), object: w.slice(i + 1) };
  }

  private async downloadToFile(gsUri: string, dest: string): Promise<void> {
    const { bucket, object } = this.parseGs(gsUri);
    const token = await this.token();
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`GCS download ${r.status} for ${gsUri}`);
    await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  }

  private async uploadFile(localPath: string, objectName: string): Promise<string> {
    const bucket = (env.VEO_OUTPUT_BUCKET || '').replace(/^gs:\/\//, '').replace(/\/+$/, '');
    const token = await this.token();
    const data = await fs.readFile(localPath);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' }, body: data });
    if (!r.ok) throw new Error(`GCS upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return `gs://${bucket}/${objectName}`;
  }

  /** ffmpeg concat (re-encode for robustness across clips) into one mp4. */
  private ffmpegConcat(listFile: string, outFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const bin = (ffmpegPath as unknown as string) || 'ffmpeg';
      const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-movflags', '+faststart', outFile];
      const p = spawn(bin, args);
      let err = '';
      p.stderr.on('data', (d) => { err += d.toString(); });
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-300)}`)));
      p.on('error', reject);
    });
  }

  private async patch(id: string, data: Partial<VideoLesson>): Promise<void> {
    await db.collection(COL).doc(id).set({ ...data, updatedAt: Date.now() }, { merge: true });
  }

  /** Background pipeline: storyboard -> per-scene render -> merge -> upload. */
  private async runJob(id: string): Promise<void> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `lesson-${id}-`));
    try {
      const snap = await db.collection(COL).doc(id).get();
      const lesson = snap.data() as VideoLesson;
      await this.patch(id, { status: 'STORYBOARD' });
      const scenes = await this.buildStoryboard(lesson.topic);
      await this.patch(id, { scenes, status: 'RENDERING' });

      // Render scenes with bounded concurrency; update each scene's status as it finishes.
      let cursor = 0;
      const worker = async () => {
        while (cursor < scenes.length) {
          const i = cursor++;
          scenes[i].status = 'generating';
          await this.patch(id, { scenes });
          try {
            const r = await veoVideoService.generateVideo(scenes[i].prompt, { sampleCount: 1 });
            scenes[i].videoUri = r.videoUris[0];
            scenes[i].status = r.videoUris[0] ? 'done' : 'failed';
          } catch (e: any) {
            scenes[i].status = 'failed';
            logger.warn('[VideoLesson] scene failed', { id, scene: i, error: String(e?.message || e).slice(0, 160) });
          }
          await this.patch(id, { scenes });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));

      const done = scenes.filter((s) => s.status === 'done' && s.videoUri);
      if (done.length === 0) throw new Error('All scenes failed to render.');

      // Download clips in order + build the concat list.
      await this.patch(id, { status: 'MERGING' });
      const listLines: string[] = [];
      for (let i = 0; i < done.length; i++) {
        const clip = path.join(tmp, `clip${i}.mp4`);
        await this.downloadToFile(done[i].videoUri!, clip);
        listLines.push(`file '${clip.replace(/'/g, "'\\''")}'`);
      }
      const listFile = path.join(tmp, 'list.txt');
      await fs.writeFile(listFile, listLines.join('\n'));
      const outFile = path.join(tmp, 'final.mp4');
      await this.ffmpegConcat(listFile, outFile);

      const finalVideoUri = await this.uploadFile(outFile, `lessons/${id}/final.mp4`);
      await this.patch(id, { status: 'READY', finalVideoUri });
      logger.info('[VideoLesson] ready', { id, scenes: done.length });
    } catch (e: any) {
      await this.patch(id, { status: 'FAILED', error: String(e?.message || e).slice(0, 300) });
      logger.error('[VideoLesson] job failed', { id, error: String(e?.message || e).slice(0, 200) });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Cache-first create: returns an existing READY lesson for the concept, else
   *  starts a new background job (subject to the per-user daily limit). */
  async createLesson(topic: string, userId: string): Promise<VideoLesson> {
    if (env.VEO_ENABLED !== 'true') throw new Error('Video lessons are disabled.');
    const clean = topic.trim();
    if (clean.length < 3) throw new Error('Please enter a concept to explain.');
    const topicKey = normalizeTopic(clean);

    // 1) Cache hit — reuse a previously generated lesson (free, instant).
    const cached = await db.collection(COL).where('topicKey', '==', topicKey).where('status', '==', 'READY').limit(1).get();
    if (!cached.empty) return { ...(cached.docs[0].data() as VideoLesson), cached: true };

    // 2) Per-user daily limit on NEW generations (cost control).
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const todays = await db.collection(COL).where('userId', '==', userId).where('createdAt', '>=', startOfDay.getTime()).get();
    if (todays.size >= DAILY_LIMIT) {
      throw new Error(`Daily limit reached (${DAILY_LIMIT} new video lessons/day). Try a concept that's already been generated, or come back tomorrow.`);
    }

    // 3) Create the job + kick off the background pipeline.
    const ref = db.collection(COL).doc();
    const now = Date.now();
    const lesson: VideoLesson = {
      id: ref.id, topic: clean, topicKey, userId, status: 'PENDING', scenes: [], createdAt: now, updatedAt: now,
    };
    await ref.set(lesson);
    this.runJob(ref.id).catch((e) => logger.error('[VideoLesson] runJob crashed', { id: ref.id, error: String(e?.message || e) }));
    return lesson;
  }

  async getLesson(id: string): Promise<VideoLesson | null> {
    const snap = await db.collection(COL).doc(id).get();
    return snap.exists ? (snap.data() as VideoLesson) : null;
  }

  /** Recovery: if a job was interrupted (e.g. server restart) but already rendered
   *  some scenes, merge whatever is done into the final video. No new Veo spend. */
  async resumeMerge(id: string): Promise<VideoLesson> {
    const lesson = await this.getLesson(id);
    if (!lesson) throw new Error('Lesson not found.');
    if (lesson.status === 'READY') return lesson;
    const done = lesson.scenes.filter((s) => s.status === 'done' && s.videoUri);
    if (done.length === 0) throw new Error('No completed scenes to merge.');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `resume-${id}-`));
    try {
      await this.patch(id, { status: 'MERGING' });
      const listLines: string[] = [];
      for (let i = 0; i < done.length; i++) {
        const clip = path.join(tmp, `clip${i}.mp4`);
        await this.downloadToFile(done[i].videoUri!, clip);
        listLines.push(`file '${clip.replace(/'/g, "'\\''")}'`);
      }
      const listFile = path.join(tmp, 'list.txt');
      await fs.writeFile(listFile, listLines.join('\n'));
      const outFile = path.join(tmp, 'final.mp4');
      await this.ffmpegConcat(listFile, outFile);
      const finalVideoUri = await this.uploadFile(outFile, `lessons/${id}/final.mp4`);
      await this.patch(id, { status: 'READY', finalVideoUri });
      logger.info('[VideoLesson] resumed + merged', { id, scenes: done.length });
      return (await this.getLesson(id))!;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Returns a fetch Response for a gs:// object (for the controller to pipe to the client). */
  async openObject(gsUri: string): Promise<Response> {
    const { bucket, object } = this.parseGs(gsUri);
    const token = await this.token();
    return fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export const videoLessonService = new VideoLessonService();
