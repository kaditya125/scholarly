import React, { useRef } from "react";
import { Send, Paperclip, X, Reply, Pencil, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/ThemeContext";
import { AttachmentBar } from "../social/AttachmentBar";
import { TypingIndicator } from "../social/TypingIndicator";
import type { useAttachments } from "../../hooks/useAttachments";
import type { TypingUser } from "../../hooks/useTyping";

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  editing?: boolean;
  onCancelEdit?: () => void;
  replyPreview?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  atts: ReturnType<typeof useAttachments>;
  typingUsers?: TypingUser[];
}

/**
 * Shared message composer for DMs and channels: reply/edit banners, pending-attachment bar, file
 * picker, typing notification, and Enter-to-send. Attachments are hidden in edit mode (edits are
 * text-only). `canSend` requires text or a finished upload.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onTyping,
  placeholder = "Write a message…",
  disabled,
  isSending,
  editing,
  onCancelEdit,
  replyPreview,
  onCancelReply,
  atts,
  typingUsers = [],
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { chatColor } = useTheme();

  const canSend = editing
    ? value.trim().length > 0
    : (value.trim().length > 0 || atts.ready.length > 0) && !atts.uploading;

  const submit = () => {
    if (!canSend || disabled || isSending) return;
    onSend();
  };

  return (
    <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/60 p-3">
      <TypingIndicator users={typingUsers} />

      {editing && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-[12.5px] text-amber-700 dark:text-amber-300">
          <Pencil className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Editing message</span>
          <button onClick={onCancelEdit} className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-500/20" aria-label="Cancel edit">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!editing && replyPreview && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg bg-slate-100 dark:bg-white/5 text-[12.5px]">
          <Reply className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-slate-600 dark:text-gray-300">{replyPreview.name}</span>
            <p className="truncate text-slate-400 dark:text-gray-500">{replyPreview.text}</p>
          </div>
          <button onClick={onCancelReply} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10" aria-label="Cancel reply">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}

      {!editing && <AttachmentBar pending={atts.pending} onRemove={atts.remove} />}

      <div className="flex items-end gap-2 bg-slate-50 dark:bg-[#1C1C1E] rounded-2xl border border-slate-200 dark:border-white/10 px-3 py-2 focus-within:border-indigo-400 dark:focus-within:border-indigo-500/40 transition-colors">
        {!editing && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) atts.addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 w-8 h-8 mb-0.5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              aria-label="Attach files"
              type="button"
            >
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
          </>
        )}
        <textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400 max-h-32 py-1.5 disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={!canSend || disabled || isSending}
          className="shrink-0 w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={chatColor !== 'none' ? { backgroundColor: chatColor } : undefined}
          aria-label="Send message"
          type="button"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
