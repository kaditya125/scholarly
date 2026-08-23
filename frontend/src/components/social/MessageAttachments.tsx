import React, { useState } from 'react';
import { FileText, Download, Maximize2 } from 'lucide-react';
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

/** Renders a message's attachments: images as interactive gallery cards, audio as voice notes, and files as downloadable cards. */
export function MessageAttachments({ attachments, mine }: { attachments?: Attachment[]; mine?: boolean }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const audio = attachments.filter((a) => a.kind === 'audio');
  const files = attachments.filter((a) => a.kind !== 'image' && a.kind !== 'audio');

  return (
    <div className="space-y-2 mb-1.5 font-sans">
      {/* Voice Notes */}
      {audio.map((a) => (
        <VoiceNotePlayer key={a.id} attachment={a} mine={mine} />
      ))}

      {/* Image Gallery */}
      {images.length > 0 && (
        <>
          <div
            className={cn(
              'grid gap-1.5 overflow-hidden rounded-xl',
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

      {/* File / PDF Downloads as Sleek Minimalist Strip */}
      {files.map((a) => {
        const isPdf = a.name.toLowerCase().endsWith('.pdf') || a.contentType?.includes('pdf');
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            download={a.name}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl transition-all group my-1 max-w-full',
              mine
                ? 'bg-white/15 hover:bg-white/20 text-white border border-white/20'
                : 'bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-800 dark:text-gray-100 border border-slate-200/80 dark:border-white/10'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px]',
                isPdf
                  ? 'bg-rose-500 text-white shadow-xs'
                  : mine
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-500 text-white shadow-xs'
              )}
            >
              {isPdf ? 'PDF' : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold truncate leading-tight">{a.name}</p>
              <p className={cn('text-[10.5px] mt-0.5', mine ? 'text-emerald-100/80' : 'text-slate-400 dark:text-gray-500')}>
                {formatSize(a.size) || 'Document'}
              </p>
            </div>
            <div className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
              mine ? 'bg-white/15 text-white' : 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-gray-300'
            )}>
              <Download className="w-3.5 h-3.5" />
            </div>
          </a>
        );
      })}
    </div>
  );
}
