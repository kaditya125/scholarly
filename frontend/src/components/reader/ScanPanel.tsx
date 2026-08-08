import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Loader2, ChevronDown, ChevronRight, BookOpen, RotateCcw, Bookmark, Check } from 'lucide-react';
import { useScanStream, ScanAction } from '../../hooks/ai/useScanStream';
import { doubtsApi } from '../../lib/api/doubts';
import { resizeDataUrl } from '../../lib/imageUtils';
import MarkdownMessage from '../chat/MarkdownMessage';

interface ScanPanelProps {
  notebookId: string;
  sourceId: string;
  page?: number;
  chapterTitle?: string;
  bookTitle?: string;
  subject?: string;
  /** The captured region as a data URL. A new value triggers a fresh solve. */
  cropDataUrl: string;
  onClose: () => void;
}

const ACTIONS: { id: ScanAction; label: string }[] = [
  { id: 'solve', label: 'Solve' },
  { id: 'explain', label: 'Explain step by step' },
  { id: 'teach', label: 'Teach the concept' },
  { id: 'similar', label: 'Similar questions' },
];

/**
 * Right-side AI panel for the Question Scanner: shows the captured crop + detected question, lets
 * the student pick an action, and streams the grounded answer (rendered with KaTeX via
 * MarkdownMessage). Re-running with a different action keeps the same crop.
 */
export function ScanPanel({ notebookId, sourceId, page, chapterTitle, bookTitle, subject, cropDataUrl, onClose }: ScanPanelProps) {
  const { start, isStreaming, progress, questionText, content, citations, error } = useScanStream();
  const [action, setAction] = useState<ScanAction>('solve');
  const [showQuestion, setShowQuestion] = useState(true);
  const [showCitations, setShowCitations] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const run = useCallback((a: ScanAction) => {
    setAction(a);
    setSaved('idle');
    start({ notebookId, sourceId, action: a, imageBase64: cropDataUrl, mimeType: 'image/png', page, chapterTitle, bookTitle, subject });
  }, [start, notebookId, sourceId, cropDataUrl, page, chapterTitle, bookTitle, subject]);

  const handleSave = useCallback(async () => {
    if (!content) return;
    setSaved('saving');
    try {
      // Downscale to compact JPEGs so the images fit comfortably inside the Firestore doc.
      const [full, thumb] = await Promise.all([
        resizeDataUrl(cropDataUrl, 900, 0.72),
        resizeDataUrl(cropDataUrl, 240, 0.6),
      ]);
      await doubtsApi.create({
        notebookId, sourceId, bookTitle, chapterTitle, subject, page,
        questionText, action, answer: content, imageDataUrl: full, thumbDataUrl: thumb,
      });
      setSaved('saved');
    } catch {
      setSaved('error');
    }
  }, [content, cropDataUrl, notebookId, sourceId, bookTitle, chapterTitle, subject, page, questionText, action]);

  // A new capture auto-runs "solve".
  useEffect(() => {
    if (cropDataUrl) run('solve');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropDataUrl]);

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.25 }}
      className="flex flex-col h-full w-full bg-white dark:bg-[#151516] border-l border-slate-200 dark:border-white/10"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-slate-900 dark:text-gray-100 leading-tight">AI Scanner</div>
          {(chapterTitle || bookTitle) && (
            <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
              {[bookTitle, chapterTitle].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Captured crop */}
        <div className="p-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
            <img src={cropDataUrl} alt="Captured question" className="w-full object-contain max-h-52" />
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pt-3 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => run(a.id)}
              disabled={isStreaming}
              className={[
                'px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors disabled:opacity-50',
                action === a.id
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
              ].join(' ')}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Detected question */}
        {questionText && (
          <div className="px-4 pt-3">
            <button onClick={() => setShowQuestion((v) => !v)} className="flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">
              {showQuestion ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Detected question
            </button>
            {showQuestion && (
              <div className="mt-1.5 text-[13px] text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-white/[0.03] rounded-lg p-3 border border-slate-100 dark:border-white/[0.06] whitespace-pre-wrap leading-relaxed">
                {questionText}
              </div>
            )}
          </div>
        )}

        {/* Answer */}
        <div className="px-4 py-4">
          {isStreaming && !content && (
            <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> {progress || 'Thinking…'}
            </div>
          )}
          {error && (
            <div className="text-[13px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-3 border border-rose-200 dark:border-rose-500/20">
              {error}
            </div>
          )}
          {content && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed">
              <MarkdownMessage content={content} />
            </div>
          )}
          {isStreaming && content && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> {progress || 'Writing…'}
            </div>
          )}
        </div>

        {/* Grounding citations */}
        {citations.length > 0 && (
          <div className="px-4 pb-4">
            <button onClick={() => setShowCitations((v) => !v)} className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-400 dark:text-gray-500">
              {showCitations ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <BookOpen className="w-3.5 h-3.5" /> Grounded in {citations.length} passage{citations.length > 1 ? 's' : ''} from this chapter
            </button>
            {showCitations && (
              <div className="mt-2 space-y-2">
                {citations.map((c, i) => (
                  <div key={i} className="text-[12px] text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-white/[0.03] rounded-lg p-2.5 border border-slate-100 dark:border-white/[0.06]">
                    <div className="font-semibold text-slate-600 dark:text-gray-300 mb-0.5 truncate">{c.source}</div>
                    <div className="line-clamp-3 leading-relaxed">{c.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: save to revision notebook + regenerate */}
      {(content || isStreaming) && (
        <div className="border-t border-slate-200 dark:border-white/10 px-4 py-3 shrink-0 flex items-center justify-between gap-2">
          <button
            onClick={handleSave}
            disabled={!content || isStreaming || saved === 'saving' || saved === 'saved'}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-60',
              saved === 'saved'
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white',
            ].join(' ')}
          >
            {saved === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {saved === 'saved' ? 'Saved to Doubts' : saved === 'saving' ? 'Saving…' : 'Save to My Doubts'}
          </button>
          <button
            onClick={() => run(action)}
            disabled={isStreaming}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Regenerate
          </button>
        </div>
      )}
    </motion.div>
  );
}
