import { FileText, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Attachment } from '../../lib/api/uploads';

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Renders a message's attachments: images as thumbnails, other files as downloadable cards. */
export function MessageAttachments({ attachments, mine }: { attachments?: Attachment[]; mine?: boolean }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');

  return (
    <div className="space-y-1.5 mb-1">
      {images.length > 0 && (
        <div className={cn('grid gap-1.5', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
              <img
                src={a.url}
                alt={a.name}
                loading="lazy"
                className="w-full max-h-56 object-cover bg-slate-100 dark:bg-white/10 hover:opacity-95 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}

      {files.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          download={a.name}
          className={cn(
            'flex items-center gap-2.5 p-2 rounded-xl transition-colors group',
            mine
              ? 'bg-white/15 hover:bg-white/25 text-white'
              : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-slate-700 dark:text-gray-200'
          )}
        >
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              mine ? 'bg-white/20' : 'bg-white dark:bg-white/10'
            )}
          >
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold truncate">{a.name}</p>
            {a.size > 0 && (
              <p className={cn('text-[11px]', mine ? 'text-white/70' : 'text-slate-400 dark:text-gray-500')}>
                {formatSize(a.size)}
              </p>
            )}
          </div>
          <Download className="w-4 h-4 opacity-60 group-hover:opacity-100" />
        </a>
      ))}
    </div>
  );
}
