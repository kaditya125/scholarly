import { useState, useRef, useEffect } from 'react';
import { Film, Sparkles, AlertTriangle, Loader2, Info } from 'lucide-react';
import { PageHeader, Panel, Button } from '../ui';
import { apiClient } from '../../lib/api/client';
import { apiErrorMessage } from '../../lib/api/client';

type Status = 'idle' | 'generating' | 'done' | 'error';

const DEFAULT_PROMPT =
  "A clear 3D educational animation of Newton's cradle demonstrating conservation of momentum, clean studio background, slow motion";

export function VideoGeneration() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [status, setStatus] = useState<Status>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Revoke the object URL when it changes/unmounts to avoid memory leaks.
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  async function generate() {
    if (!prompt.trim() || status === 'generating') return;
    setStatus('generating'); setError(null); setElapsed(0);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const { data } = await apiClient.post('/admin/video/generate', { prompt });
      const op = data.operationName as string;

      let done = false; let uris: string[] = [];
      const start = Date.now();
      while (!done && Date.now() - start < 300000) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await apiClient.get('/admin/video/status', { params: { operation: op } });
        done = !!s.data.done; uris = s.data.videoUris || [];
      }
      if (!done || !uris.length) throw new Error('Generation timed out or produced no video.');

      const vid = await apiClient.get('/admin/video/stream', { params: { uri: uris[0] }, responseType: 'blob' });
      setVideoUrl(URL.createObjectURL(vid.data as Blob));
      setStatus('done');
    } catch (e) {
      setError(apiErrorMessage(e)); setStatus('error');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Generation"
        subtitle="Generate educational clips with Veo 3 (xAI/Google on Vertex)"
        icon={Film}
      />

      {/* Cost warning */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Each generation is a premium Veo 3 call (~$4–6, billed to Vertex). Use sparingly — this is a demo/admin tool, not an end-user feature yet.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Prompt" icon={<Sparkles className="w-4 h-4" />}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            disabled={status === 'generating'}
            placeholder="Describe the video to generate…"
            className="w-full resize-none rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-3 py-2.5 text-sm text-slate-700 dark:text-gray-200 outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
          />
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={generate} loading={status === 'generating'} icon={<Film className="w-4 h-4" />}>
              {status === 'generating' ? `Generating… ${elapsed}s` : 'Generate Video'}
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5" /> ~60–90s per clip
            </span>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </Panel>

        <Panel title="Result" icon={<Film className="w-4 h-4" />} bodyClassName="flex items-center justify-center min-h-[280px]">
          {status === 'generating' && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm">Rendering with Veo 3… {elapsed}s</p>
              <p className="text-xs">This usually takes 60–90 seconds.</p>
            </div>
          )}
          {status === 'done' && videoUrl && (
            <video src={videoUrl} controls autoPlay loop className="w-full rounded-lg border border-slate-200 dark:border-white/10" />
          )}
          {(status === 'idle' || status === 'error') && (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Film className="w-10 h-10 opacity-40" />
              <p className="text-sm">Your generated video will appear here.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
