import { X, Loader2, FileText, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { PendingAttachment } from '../../hooks/useAttachments';

/** The row of pending attachments shown above a composer while they upload. */
export function AttachmentBar({
  pending,
  onRemove,
}: {
  pending: PendingAttachment[];
  onRemove: (tempId: string) => void;
}) {
  if (pending.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {pending.map((p) => {
        const isImage = p.attachment?.kind === 'image';
        return (
          <div
            key={p.tempId}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-[12px] max-w-[220px]"
          >
            {p.uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
            ) : p.error ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            ) : isImage ? (
              <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            <span
              className={cnTruncate(p.error)}
              title={p.error ? `${p.name} — upload failed` : p.name}
            >
              {p.name}
            </span>
            <button
              onClick={() => onRemove(p.tempId)}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 shrink-0"
              aria-label={`Remove ${p.name}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function cnTruncate(error?: boolean): string {
  return `truncate flex-1 ${error ? 'text-rose-500' : 'text-slate-700 dark:text-gray-200'}`;
}
