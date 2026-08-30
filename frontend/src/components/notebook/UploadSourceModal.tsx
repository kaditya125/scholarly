import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderUp, X, Trash2, Download, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNotebookSources } from '../../hooks/ai/useNotebook';
import { notebooksApi } from '../../lib/api/notebooks';
import { DocumentSource } from '../../types';
import { storage } from '../../lib/storage';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';

const PROCESSING = ['PENDING', 'UPLOADING', 'PROCESSING', 'OCR', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'GENERATING_GRAPH'];

function fmtSize(bytes?: number) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(name: string) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'FILE').toUpperCase();
}

const EXT_COLORS: Record<string, string> = {
  PDF: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
  PNG: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  JPG: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  JPEG: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  GIF: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400',
  TXT: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  MD: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  XLS: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  XLSX: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  CSV: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  DOC: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  DOCX: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  PPT: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  PPTX: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  DEFAULT: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-gray-400',
};

function FileBadge({ name }: { name: string }) {
  const ext = extOf(name);
  return (
    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-[9.5px] font-bold tracking-tight', EXT_COLORS[ext] || EXT_COLORS.DEFAULT)}>
      {ext}
    </div>
  );
}

/** SVG ring used for per-file upload progress. */
function Ring({ value, size = 44, stroke = 3.5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const off = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-white/10" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        className="stroke-amber-400 transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

interface UploadItem {
  id: string;
  file: File;
  loaded: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  controller: AbortController;
}

interface UploadSourceModalProps {
  notebookId: string;
  notebookTitle?: string;
  initialFiles?: File[];
  onClose: () => void;
}

/**
 * The "Upload sources" window: a large drag-and-drop zone plus a live upload process — files show a
 * progress ring while uploading (cancellable), a "Try again" on failure, and the notebook's indexed
 * sources with delete / download. Uploads run per-file (real progress, cancel via AbortController)
 * and land in the notebook's knowledge base once processed.
 */
export function UploadSourceModal({ notebookId, notebookTitle, initialFiles, onClose }: UploadSourceModalProps) {
  const { sources, deleteSource, refetchSources } = useNotebookSources(notebookId);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedInitial = useRef(false);

  const startUpload = (file: File) => {
    const controller = new AbortController();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploads((prev) => [{ id, file, loaded: 0, progress: 0, status: 'uploading', controller }, ...prev]);

    notebooksApi
      .uploadSource(
        notebookId,
        file,
        (pe: any) => {
          if (pe.total) {
            setUploads((prev) =>
              prev.map((u) => (u.id === id ? { ...u, loaded: pe.loaded, progress: Math.round((pe.loaded * 100) / pe.total) } : u))
            );
          }
        },
        controller.signal
      )
      .then(() => {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'done', progress: 100 } : u)));
        refetchSources();
        // Once processed it lives in the sources list below, so retire the transient row.
        setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id)), 1400);
      })
      .catch(() => {
        setUploads((prev) => {
          const item = prev.find((u) => u.id === id);
          if (item?.controller.signal.aborted) return prev.filter((u) => u.id !== id);
          return prev.map((u) => (u.id === id ? { ...u, status: 'error' } : u));
        });
      });
  };

  const addFiles = (files?: FileList | File[] | null) => {
    if (!files) return;
    Array.from(files).forEach(startUpload);
  };

  // Auto-start any files dropped on the trigger before the window opened.
  useEffect(() => {
    if (!startedInitial.current && initialFiles && initialFiles.length) {
      startedInitial.current = true;
      initialFiles.forEach(startUpload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  const cancel = (id: string) => {
    const item = uploads.find((u) => u.id === id);
    item?.controller.abort();
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const retry = (id: string) => {
    const item = uploads.find((u) => u.id === id);
    if (!item) return;
    setUploads((prev) => prev.filter((u) => u.id !== id));
    startUpload(item.file);
  };

  const download = async (doc: DocumentSource) => {
    if (!doc.gcsPath) return;
    try {
      const url = await getDownloadURL(storageRef(storage, doc.gcsPath));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.title;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      /* ignore — the file may still be processing */
    }
  };

  const remove = async (doc: DocumentSource) => {
    setDeletingId(doc.id);
    try {
      await deleteSource(doc.id);
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  };

  const uploading = uploads.filter((u) => u.status === 'uploading');
  const failed = uploads.filter((u) => u.status === 'error');
  const hasProcess = uploading.length > 0 || failed.length > 0 || sources.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div>
              <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Upload sources</h2>
              {notebookTitle && <p className="text-[12.5px] text-slate-400 dark:text-gray-500">to {notebookTitle}</p>}
            </div>
            <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
            {/* Drop zone */}
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                if (inputRef.current) inputRef.current.value = '';
              }}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'w-full border-2 border-dashed rounded-2xl px-6 py-9 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all',
                isDragging
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15'
                  : 'border-slate-300 dark:border-white/15 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-white/5'
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
                <FolderUp className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-slate-700 dark:text-gray-200">
                  Drop your files here or <span className="text-indigo-600 dark:text-indigo-400">click here to upload</span>
                </p>
                <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-0.5">
                  Upload anything you want — PDF, DOCX, TXT, images and more.
                </p>
              </div>
            </div>

            {/* Upload process */}
            {hasProcess && (
              <div className="mt-6">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-3">Upload process</h3>

                {/* Uploading */}
                {uploading.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[12px] font-semibold text-slate-500 dark:text-gray-400 mb-1">Uploading</p>
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {uploading.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 py-2.5">
                          <FileBadge name={u.file.name} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold text-slate-800 dark:text-gray-100 truncate">{u.file.name}</p>
                            <p className="text-[11.5px] text-slate-400 dark:text-gray-500">
                              {fmtSize(u.loaded)} / {fmtSize(u.file.size)}
                            </p>
                          </div>
                          <button
                            onClick={() => cancel(u.id)}
                            className="group relative shrink-0 flex items-center justify-center"
                            style={{ width: 44, height: 44 }}
                            title="Cancel upload"
                          >
                            <Ring value={u.progress} />
                            <span className="absolute text-[10px] font-bold text-slate-600 dark:text-gray-300 group-hover:opacity-0 transition-opacity">
                              {u.progress}%
                            </span>
                            <X className="absolute w-4 h-4 text-slate-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed */}
                {failed.length > 0 && (
                  <div className="mb-4">
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {failed.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 py-2.5">
                          <FileBadge name={u.file.name} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold text-slate-800 dark:text-gray-100 truncate">{u.file.name}</p>
                            <p className="text-[11.5px] text-rose-500">Upload failed</p>
                          </div>
                          <button
                            onClick={() => retry(u.id)}
                            className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Try again
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Uploaded (indexed sources) */}
                {sources.length > 0 && (
                  <div>
                    <p className="text-[12px] font-semibold text-slate-500 dark:text-gray-400 mb-1">Uploaded</p>
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {sources.map((doc) => {
                        const processing = PROCESSING.includes(doc.status);
                        // Phase 3: FAILED_NONRETRYABLE renders identically so the badge
                        // doesn't silently fall back to green/check for a source that's
                        // actually permanently dead (missing GCS object / denied rules).
                        const failedDoc = doc.status === 'FAILED' || doc.status === 'FAILED_NONRETRYABLE';
                        return (
                          <div key={doc.id} className="flex items-center gap-3 py-2.5">
                            <FileBadge name={doc.title} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-semibold text-slate-800 dark:text-gray-100 truncate">{doc.title}</p>
                              <p className="text-[11.5px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                                <span>
                                  {doc.type}
                                  {doc.totalPages ? ` · ${doc.totalPages} pages` : ''}
                                  {doc.sizeBytes ? ` · ${fmtSize(doc.sizeBytes)}` : ''}
                                </span>
                                {processing ? (
                                  <span className="text-indigo-500 dark:text-indigo-400 font-medium flex items-center gap-1">
                                    · <Loader2 className="w-3 h-3 animate-spin" /> Processing
                                  </span>
                                ) : failedDoc ? (
                                  <span className="text-rose-500 font-medium">· Failed</span>
                                ) : (
                                  <span className="text-emerald-500 font-medium flex items-center gap-1">
                                    · <CheckCircle2 className="w-3 h-3" /> Ready
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-1">
                              <button
                                onClick={() => remove(doc)}
                                disabled={deletingId === doc.id}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                              {doc.gcsPath && (
                                <button
                                  onClick={() => download(doc)}
                                  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
