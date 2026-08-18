import { GoogleAuth } from 'google-auth-library';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * VeoVideoService — Veo 3 text-to-video on Vertex AI.
 *
 * PREMIUM + EXPENSIVE (~$4-6 per clip). Async long-running:
 *   submit :predictLongRunning -> poll :fetchPredictOperation -> video written to GCS.
 *
 * Auth: OAuth2 via the sadhya-grok service account (reuses GROK_SA_KEY_FILE /
 * GROK_VERTEX_PROJECT). Output goes to VEO_OUTPUT_BUCKET (must be writable by the SA).
 *
 * Cost guardrails (caller's responsibility): on-demand only, cache results, cap usage.
 */
export interface VeoResult {
  operationName: string;
  done: boolean;
  videoUris: string[];   // gs:// URIs of generated video(s)
  raw?: any;
}

export interface VeoOptions {
  sampleCount?: number;      // default 1 (each sample bills)
  durationSeconds?: number;  // Veo 3 supports a fixed/limited range
  aspectRatio?: string;      // e.g. "16:9"
  generateAudio?: boolean;
  negativePrompt?: string;
}

export class VeoVideoService {
  private auth: GoogleAuth;
  private project: string;
  private location: string;
  private model: string;
  private bucket: string;

  constructor() {
    this.project = (env.GROK_VERTEX_PROJECT || '').trim();
    this.location = (env.VEO_LOCATION || 'us-central1').trim();
    this.model = (env.VEO_MODEL || 'veo-3.0-generate-001').trim();
    this.bucket = (env.VEO_OUTPUT_BUCKET || '').trim();
    if (!this.project) throw new Error('GROK_VERTEX_PROJECT is not set (needed for Veo).');
    if (!this.bucket) throw new Error('VEO_OUTPUT_BUCKET is not set.');
    const keyFile = (env.GROK_SA_KEY_FILE || '').trim();
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...(keyFile ? { keyFile } : {}),
    });
  }

  private base(): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${this.model}`;
  }

  private async token(): Promise<string> {
    const client = await this.auth.getClient();
    const t = await client.getAccessToken();
    if (!t || !t.token) throw new Error('Failed to obtain OAuth token for Veo (Vertex).');
    return t.token;
  }

  /** Submit a generation job. Returns the long-running operation name. */
  async submit(prompt: string, opts: VeoOptions = {}): Promise<string> {
    const token = await this.token();
    const body = {
      instances: [{ prompt }],
      parameters: {
        storageUri: this.bucket,
        sampleCount: opts.sampleCount ?? 1,
        ...(opts.durationSeconds ? { durationSeconds: opts.durationSeconds } : {}),
        ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
        ...(opts.generateAudio !== undefined ? { generateAudio: opts.generateAudio } : {}),
        ...(opts.negativePrompt ? { negativePrompt: opts.negativePrompt } : {}),
      },
    };
    const res = await fetch(`${this.base()}:predictLongRunning`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Veo submit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    if (!data.name) throw new Error(`Veo submit: no operation name in response: ${JSON.stringify(data).slice(0, 200)}`);
    logger.info('[Veo] submitted generation', { operation: data.name });
    return data.name;
  }

  /** Poll a single time for operation status. */
  async fetchOperation(operationName: string): Promise<VeoResult> {
    const token = await this.token();
    const res = await fetch(`${this.base()}:fetchPredictOperation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName }),
    });
    if (!res.ok) throw new Error(`Veo fetchOperation HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const videos = data?.response?.videos || data?.response?.generatedSamples || [];
    const videoUris: string[] = [];
    for (const v of videos) {
      const uri = v?.gcsUri || v?.video?.uri || v?.uri;
      if (uri) videoUris.push(uri);
    }
    return { operationName, done: !!data.done, videoUris, raw: data };
  }

  /** Submit + poll until done (or timeout). Returns the finished result with video URIs. */
  async generateVideo(prompt: string, opts: VeoOptions = {}, timeoutMs = 300000): Promise<VeoResult> {
    const operationName = await this.submit(prompt, opts);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 10000)); // poll every 10s
      const status = await this.fetchOperation(operationName);
      if (status.done) {
        logger.info('[Veo] generation complete', { videos: status.videoUris.length });
        return status;
      }
    }
    throw new Error(`Veo generation timed out after ${timeoutMs}ms (operation: ${operationName})`);
  }
}

export const veoVideoService = new VeoVideoService();
