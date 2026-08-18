import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Film, Image as ImageIcon, Sparkles, Loader2, CheckCircle2,
  AlertCircle, Clock, Play, Download, Wand2, ArrowRight,
} from "lucide-react";
import { api } from "../lib/api/client";
import { cn } from "../lib/utils";

interface Scene { prompt: string; narration: string; status: "pending" | "generating" | "done" | "failed"; videoUri?: string; }
interface Lesson {
  id: string; topic: string; status: "PENDING" | "STORYBOARD" | "RENDERING" | "MERGING" | "READY" | "FAILED";
  scenes: Scene[]; finalVideoUri?: string; error?: string; cached?: boolean;
}

const STAGE_LABEL: Record<Lesson["status"], string> = {
  PENDING: "Queued\u2026",
  STORYBOARD: "Writing the storyboard\u2026",
  RENDERING: "Generating each scene\u2026",
  MERGING: "Stitching the scenes together\u2026",
  READY: "Your video is ready",
  FAILED: "Something went wrong",
};
const isTerminal = (s?: Lesson["status"]) => s === "READY" || s === "FAILED";

const ASPECTS = [
  { id: "1:1", label: "Square", box: "aspect-square" },
  { id: "16:9", label: "Wide", box: "aspect-video" },
  { id: "9:16", label: "Portrait", box: "aspect-[9/16]" },
  { id: "4:3", label: "Classic", box: "aspect-[4/3]" },
];

const IMAGE_IDEAS = [
  "A serene Japanese temple on a misty mountain, cinematic",
  "Diagram-style illustration of the human heart, labeled, educational",
  "A cozy study desk with books and warm lamp light, isometric",
];
const VIDEO_IDEAS = [
  "How photosynthesis works",
  "Newton's three laws of motion",
  "The water cycle explained",
];

export default function AIStudio() {
  const [tab, setTab] = useState<"video" | "image">("video");

  // ── Video state ──────────────────────────────────────────────
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Image state ──────────────────────────────────────────────
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgAspect, setImgAspect] = useState("1:1");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgCaption, setImgCaption] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPolling, []);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const createVideo = async () => {
    if (!topic.trim() || submitting) return;
    setSubmitting(true); setError(null); setLesson(null); setVideoUrl(null);
    try {
      const { data } = await api.post<Lesson>("/video-lessons", { topic: topic.trim() });
      setLesson(data);
      if (!isTerminal(data.status)) startPolling(data.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Failed to start the video.");
    } finally {
      setSubmitting(false);
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<Lesson>(`/video-lessons/${id}`);
        setLesson(data);
        if (isTerminal(data.status)) { stopPolling(); if (data.status === "READY") loadVideo(id); }
      } catch { /* transient */ }
    }, 5000);
  };

  const loadVideo = async (id: string) => {
    try {
      const res = await api.get(`/video-lessons/${id}/video`, { responseType: "blob" });
      setVideoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(res.data); });
    } catch {
      setError("The video is ready but couldn't be loaded. Try refreshing.");
    }
  };

  const generateImage = async () => {
    if (!imgPrompt.trim() || imgLoading) return;
    setImgLoading(true); setImgError(null); setImgUrl(null); setImgCaption(null);
    try {
      const { data } = await api.post("/media/image", { prompt: imgPrompt.trim(), aspectRatio: imgAspect });
      setImgUrl(data.dataUrl); setImgCaption(data.caption || null);
    } catch (e: any) {
      setImgError(e?.response?.data?.error || "Failed to generate the image.");
    } finally {
      setImgLoading(false);
    }
  };

  const downloadImage = () => {
    if (!imgUrl) return;
    const a = document.createElement("a");
    a.href = imgUrl; a.download = `sadhya-image-${Date.now()}.png`; a.click();
  };

  const busy = lesson ? !isTerminal(lesson.status) : false;
  const doneCount = lesson?.scenes.filter((s) => s.status === "done").length || 0;
  const totalScenes = lesson?.scenes.length || 0;
  const aspectBox = ASPECTS.find((a) => a.id === imgAspect)?.box || "aspect-square";

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 border border-indigo-500/15 text-[12px] font-medium text-indigo-600 dark:text-indigo-300 mb-4">
          <Sparkles className="w-3.5 h-3.5" /> AI Studio
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
          Bring your ideas to life
        </h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
          Turn any concept into a short explainer video, or generate a striking image from a prompt.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex p-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          {([["video", Film, "Video"], ["image", ImageIcon, "Image"]] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                tab === id
                  ? "bg-white dark:bg-[#1f1f1f] text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tab === "video" ? (
          <motion.div key="video" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {/* Prompt card */}
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] p-5 shadow-sm">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">What concept should we explain?</label>
              <div className="mt-2.5 flex flex-col sm:flex-row gap-2.5">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createVideo()}
                  placeholder="e.g. How photosynthesis works"
                  disabled={busy || submitting}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1b] text-slate-800 dark:text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60"
                />
                <button
                  onClick={createVideo}
                  disabled={busy || submitting || !topic.trim()}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                >
                  {submitting || busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {VIDEO_IDEAS.map((idea) => (
                  <button key={idea} onClick={() => setTopic(idea)} disabled={busy || submitting}
                    className="text-[12px] px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-indigo-400/50 hover:text-indigo-500 transition-colors disabled:opacity-50">
                    {idea}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">A new video takes a few minutes. Popular concepts are cached and appear instantly.</p>
            </div>

            {error && <ErrorBox msg={error} />}

            {lesson && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                <div className="flex items-center gap-2 mb-3">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    : lesson.status === "READY" ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <AlertCircle className="w-4 h-4 text-red-500" />}
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{STAGE_LABEL[lesson.status]}</span>
                  {lesson.cached && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">cached &middot; instant</span>}
                  {totalScenes > 0 && lesson.status === "RENDERING" && <span className="text-xs text-slate-400">{doneCount}/{totalScenes} scenes</span>}
                </div>

                {lesson.status === "FAILED" && lesson.error && <p className="text-sm text-red-500 mb-3">{lesson.error}</p>}

                {totalScenes > 0 && lesson.status !== "READY" && (
                  <div className="space-y-2">
                    {lesson.scenes.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] p-3">
                        <div className="mt-0.5">
                          {s.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                            : s.status === "generating" ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                            : s.status === "failed" ? <AlertCircle className="w-4 h-4 text-red-500" />
                            : <Clock className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scene {i + 1}</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{s.narration || s.prompt}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {lesson.status === "READY" && (
                  <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 bg-black shadow-lg">
                    {videoUrl ? <video src={videoUrl} controls autoPlay className="w-full aspect-video bg-black" />
                      : <div className="w-full aspect-video flex items-center justify-center text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading video&hellip;</div>}
                    <div className="p-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Play className="w-4 h-4 text-indigo-500" /> {lesson.topic}</div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div key="image" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {/* Prompt card */}
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141415] p-5 shadow-sm">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Describe the image</label>
              <textarea
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="e.g. A labeled diagram of a plant cell, clean educational illustration"
                rows={3}
                disabled={imgLoading}
                className="mt-2.5 w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1a1a1b] text-slate-800 dark:text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none disabled:opacity-60"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {ASPECTS.map((a) => (
                    <button key={a.id} onClick={() => setImgAspect(a.id)} disabled={imgLoading}
                      className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50",
                        imgAspect === a.id ? "border-indigo-500 text-indigo-600 dark:text-indigo-300 bg-indigo-500/10" : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200")}>
                      {a.label} <span className="opacity-60">{a.id}</span>
                    </button>
                  ))}
                </div>
                <button onClick={generateImage} disabled={imgLoading || !imgPrompt.trim()}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-opacity">
                  {imgLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {IMAGE_IDEAS.map((idea) => (
                  <button key={idea} onClick={() => setImgPrompt(idea)} disabled={imgLoading}
                    className="text-[12px] px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-indigo-400/50 hover:text-indigo-500 transition-colors disabled:opacity-50 max-w-full truncate">
                    {idea}
                  </button>
                ))}
              </div>
            </div>

            {imgError && <ErrorBox msg={imgError} />}

            <div className="mt-5">
              {imgLoading ? (
                <div className={cn("rounded-3xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141415] flex flex-col items-center justify-center gap-3 text-slate-400 max-w-lg mx-auto", aspectBox)}>
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-sm">Painting your image&hellip;</span>
                </div>
              ) : imgUrl ? (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg mx-auto">
                  <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg bg-white dark:bg-black">
                    <img src={imgUrl} alt={imgPrompt} className="w-full object-contain" />
                  </div>
                  {imgCaption && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center italic">{imgCaption}</p>}
                  <button onClick={downloadImage} className="mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <Download className="w-4 h-4" /> Download
                  </button>
                </motion.div>
              ) : (
                <div className={cn("rounded-3xl border border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-2 text-slate-400 max-w-lg mx-auto", aspectBox)}>
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <span className="text-sm">Your generated image appears here</span>
                  <span className="text-[11px] flex items-center gap-1 opacity-70">Describe it above <ArrowRight className="w-3 h-3" /> Generate</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{msg}</span>
    </div>
  );
}
