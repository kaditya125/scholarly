/**
 * UploadContentModal Component
 * Phase 1B & Phase 2A: Content Upload, Storage & Frontend Multi-File Queue
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Folder,
  Trash2,
  RotateCcw,
  Ban,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PipelineCollection,
  UploadQueueItem,
  SUPPORTED_EXTENSIONS,
} from '../../types/pipeline.types';
import { pipelineApi, computeBrowserFileHash } from '../../lib/api/pipeline';

interface UploadContentModalProps {
  collections: PipelineCollection[];
  initialCollectionId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UploadContentModal: React.FC<UploadContentModalProps> = ({
  collections,
  initialCollectionId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(
    initialCollectionId || (collections.length > 0 ? collections[0].id : '')
  );
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialCollectionId if changed
  useEffect(() => {
    if (initialCollectionId) {
      setSelectedCollectionId(initialCollectionId);
    } else if (collections.length > 0 && !selectedCollectionId) {
      setSelectedCollectionId(collections[0].id);
    }
  }, [initialCollectionId, collections]);

  if (!isOpen) return null;

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-rose-500" />;
    if (['docx', 'doc'].includes(ext)) return <FileText className="w-4 h-4 text-blue-500" />;
    if (['pptx', 'ppt'].includes(ext)) return <Presentation className="w-4 h-4 text-amber-500" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    if (['html', 'htm', 'md', 'txt'].includes(ext)) return <FileCode className="w-4 h-4 text-violet-500" />;
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return <ImageIcon className="w-4 h-4 text-teal-500" />;
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const addFilesToQueue = async (files: FileList | File[]) => {
    setGlobalError(null);
    const newItems: UploadQueueItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      // Check format
      if (!SUPPORTED_EXTENSIONS.includes(ext as any)) {
        setGlobalError(`File "${file.name}" has unsupported format .${ext}`);
        continue;
      }

      // Check max size (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setGlobalError(`File "${file.name}" exceeds maximum size limit of 50MB`);
        continue;
      }

      if (file.size === 0) {
        setGlobalError(`File "${file.name}" is empty (0 bytes)`);
        continue;
      }

      const itemId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      newItems.push({
        id: itemId,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'idle',
        collectionId: selectedCollectionId,
      });
    }

    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
    // reset input so same file can be re-selected if deleted
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadSingleItem = async (item: UploadQueueItem) => {
    if (!selectedCollectionId) {
      setGlobalError('Please select a collection first');
      return;
    }

    const abortController = new AbortController();

    setQueue((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, status: 'uploading', progress: 5, abortController, error: undefined }
          : it
      )
    );

    try {
      // 1. Compute hash client-side & precheck duplicate
      const hash = await computeBrowserFileHash(item.file);
      const dupCheck = await pipelineApi.checkDuplicate(selectedCollectionId, hash);
      if (dupCheck.isDuplicate) {
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'completed',
                  progress: 100,
                  hash,
                  isDuplicate: true,
                  sourceId: dupCheck.source?.id,
                }
              : it
          )
        );
        return;
      }

      // 2. Upload file
      const source = await pipelineApi.uploadSource(
        selectedCollectionId,
        item.file,
        (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 95) / progressEvent.total);
            setQueue((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress: percentCompleted } : it))
            );
          }
        },
        abortController.signal
      );

      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: 'queued',
                progress: 100,
                sourceId: source.id,
              }
            : it
        )
      );
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.message === 'canceled') {
        setQueue((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'cancelled', progress: 0 } : it))
        );
      } else {
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'failed',
                  error: err.response?.data?.error || err.message || 'Upload failed',
                }
              : it
          )
        );
      }
    }
  };

  const handleUploadAll = async () => {
    if (!selectedCollectionId) {
      setGlobalError('Please select a target collection');
      return;
    }

    const pendingItems = queue.filter((it) => ['idle', 'failed', 'cancelled'].includes(it.status));
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      await uploadSingleItem(item);
    }

    if (onSuccess) onSuccess();
  };

  const handleCancelItem = (itemId: string) => {
    const item = queue.find((it) => it.id === itemId);
    if (item && item.abortController) {
      item.abortController.abort();
    }
    setQueue((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'cancelled', progress: 0 } : it))
    );
  };

  const handleRemoveItem = (itemId: string) => {
    handleCancelItem(itemId);
    setQueue((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleRetryItem = (item: UploadQueueItem) => {
    uploadSingleItem(item);
  };

  const handleClearCompleted = () => {
    setQueue((prev) => prev.filter((it) => !['completed', 'queued'].includes(it.status)));
  };

  const pendingCount = queue.filter((it) => ['idle', 'uploading'].includes(it.status)).length;
  const isAnyUploading = queue.some((it) => it.status === 'uploading');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Upload Content
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Add learning materials (PDF, DOCX, PPTX, XLSX, TXT, MD, HTML, Images)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Collection Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Target Collection <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                disabled={collections.length === 0 || isAnyUploading}
                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer disabled:opacity-60"
              >
                {collections.length === 0 ? (
                  <option value="">No collections available (create one first)</option>
                ) : (
                  collections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title} ({col.sourceCount || 0} items)
                    </option>
                  ))
                )}
              </select>
              <Folder className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 relative group',
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 scale-[0.99]'
                : 'border-slate-200 dark:border-white/10 hover:border-indigo-400 dark:hover:border-indigo-500/40 bg-slate-50/50 dark:bg-zinc-900/40'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.html,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-1">
              Drag & Drop multiple files here, or{' '}
              <span className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-400/40 underline-offset-2">
                Browse Files
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3">
              Up to 50MB per file. Multi-file upload supported.
            </p>

            {/* Format Pills */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {['PDF', 'DOCX', 'PPTX', 'XLSX', 'TXT', 'MD', 'HTML', 'PNG', 'JPG'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-white/5"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>

          {/* Global Error Banner */}
          {globalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Queue List */}
          {queue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Upload Queue ({queue.length} file{queue.length > 1 ? 's' : ''})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearCompleted}
                    className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                  >
                    Clear Finished
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/5 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-white/5 shrink-0">
                          {getFileIcon(item.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate max-w-xs">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                            {formatFileSize(item.size)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status Badge */}
                        {item.status === 'idle' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                            Ready
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {item.progress}%
                          </span>
                        )}
                        {item.status === 'queued' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Queued
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {item.isDuplicate ? 'Duplicate (Synced)' : 'Uploaded'}
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Failed
                          </span>
                        )}
                        {item.status === 'cancelled' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            Cancelled
                          </span>
                        )}

                        {/* Actions */}
                        {item.status === 'uploading' && (
                          <button
                            type="button"
                            onClick={() => handleCancelItem(item.id)}
                            title="Cancel upload"
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-slate-200 dark:hover:bg-white/10"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {['failed', 'cancelled'].includes(item.status) && (
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item)}
                            title="Retry upload"
                            className="p-1 text-indigo-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {['idle', 'completed', 'queued', 'failed', 'cancelled'].includes(item.status) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            title="Remove item"
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 rounded-md hover:bg-slate-200 dark:hover:bg-white/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {item.status === 'uploading' && (
                      <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {item.error && (
                      <p className="text-[10px] text-rose-500 dark:text-rose-400 truncate">
                        {item.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-900/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            {queue.some((it) => ['queued', 'completed'].includes(it.status)) ? 'Done' : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            {queue.some((it) => ['idle', 'failed', 'cancelled'].includes(it.status)) && (
              <button
                type="button"
                onClick={handleUploadAll}
                disabled={isAnyUploading || !selectedCollectionId}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/25 transition-all"
              >
                {isAnyUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    Start Ingestion ({queue.filter((it) => ['idle', 'failed', 'cancelled'].includes(it.status)).length})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
