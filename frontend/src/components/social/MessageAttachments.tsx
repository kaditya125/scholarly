import React, { useState } from 'react';
import { FileText, Download, Maximize2, FileCode, Video, Music, Archive } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Attachment } from '../../lib/api/uploads';
import { ImageLightbox } from './ImageLightbox';
import { VoiceNotePlayer } from './VoiceNotePlayer';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileCategory(name: string, contentType?: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();

  if (ext === 'pdf' || ct.includes('pdf')) {
    return { type: 'pdf', label: 'PDF Document', color: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20' };
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || ct.startsWith('video/')) {
    return { type: 'video', label: 'Video File', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20' };
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext) || ct.startsWith('audio/')) {
    return { type: 'audio', label: 'Audio File', color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { type: 'archive', label: 'Archive', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20' };
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'html', 'css', 'json'].includes(ext)) {
    return { type: 'code', label: 'Source Code', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20' };
  }
  return { type: 'doc', label: 'Document', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20' };
}

/** Renders a message's attachments with exact reference UI file strip cards */
export function MessageAttachments({ attachments, mine }: { attachments?: Attachment[]; mine?: boolean }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const audio = attachments.filter((a) => a.kind === 'audio');
  const files = attachments.filter((a) => a.kind !== 'image' && a.kind !== 'audio');

  return (
    <div className="space-y-2 mb-2 font-sans">
      {/* Voice Notes */}
      {audio.map((a) => (
        <VoiceNotePlayer key={a.id} attachment={a} mine={mine} />
      ))}

      {/* Image Gallery */}
      {images.length > 0 && (
        <>
          <div
            className={cn(
              'grid gap-1.5 overflow-hidden rounded-2xl',
              images.length === 1
                ? 'grid-cols-1 max-w-sm'
                : images.length === 2
                ? 'grid-cols-2 max-w-md'
                : images.length === 3
                ? 'grid-cols-2 max-w-md'
                : 'grid-cols-2 max-w-md'
            )}
          >
            {images.map((a, i) => (
              <div
                key={a.id}
                onClick={() => setLightboxIndex(i)}
                className={cn(
                  'relative group overflow-hidden rounded-xl bg-slate-100 dark:bg-white/10 cursor-pointer aspect-video sm:aspect-[4/3]',
                  images.length === 3 && i === 0 && 'col-span-2 aspect-[2/1]'
                )}
              >
                <img
                  src={a.url}
                  alt={a.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <div className="p-2 rounded-full bg-black/50 backdrop-blur-xs">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lightbox Modal */}
          <ImageLightbox
            images={images}
            initialIndex={lightboxIndex ?? 0}
            isOpen={lightboxIndex !== null}
            onClose={() => setLightboxIndex(null)}
          />
        </>
      )}

      {/* File / PDF Downloads — Exact Floating Card Strip matching Reference Image */}
      {files.map((a) => {
        const cat = getFileCategory(a.name, a.contentType);
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            className={cn(
              'flex items-center gap-3.5 p-2.5 sm:p-3 rounded-2xl transition-all group my-1.5 max-w-full shadow-2xs hover:shadow-xs cursor-pointer',
              mine
                ? 'bg-white/95 dark:bg-[#1f1f23]/95 text-slate-900 dark:text-white border border-white/30 backdrop-blur-xs'
                : 'bg-white dark:bg-[#1a1a1e] text-slate-900 dark:text-white border border-slate-200/80 dark:border-white/10'
            )}
          >
            {/* Squircle App-Like File Icon Box */}
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs transition-transform group-hover:scale-105',
                cat.color
              )}
            >
              {cat.type === 'pdf' ? (
                <span className="font-extrabold text-[11px] tracking-tight">PDF</span>
              ) : cat.type === 'video' ? (
                <Video className="w-5 h-5 fill-current" />
              ) : cat.type === 'audio' ? (
                <Music className="w-5 h-5" />
              ) : cat.type === 'archive' ? (
                <Archive className="w-5 h-5" />
              ) : cat.type === 'code' ? (
                <FileCode className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>

            {/* Title & Metadata */}
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-[13px] font-bold text-slate-900 dark:text-gray-100 truncate leading-snug">
                {a.name}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-gray-400 font-medium mt-0.5 flex items-center gap-1.5">
                <span>{cat.label}</span>
                {a.size > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatSize(a.size)}</span>
                  </>
                )}
              </p>
            </div>

            {/* Download Icon Button */}
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 flex items-center justify-center shrink-0 group-hover:bg-[#186a52] group-hover:text-white dark:group-hover:bg-[#c8e558] dark:group-hover:text-slate-900 transition-colors">
              <Download className="w-4 h-4" />
            </div>
          </a>
        );
      })}
    </div>
  );
}
