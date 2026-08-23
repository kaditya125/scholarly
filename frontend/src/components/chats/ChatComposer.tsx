import React, { useRef, useState } from "react";
import {
  Send,
  Paperclip,
  X,
  Reply,
  Pencil,
  Mic,
  Smile,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { AttachmentBar } from "../social/AttachmentBar";
import { TypingIndicator } from "../social/TypingIndicator";
import { VoiceRecorder } from "./VoiceRecorder";
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
  const imageRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const canSend = editing
    ? value.trim().length > 0
    : (value.trim().length > 0 || atts.ready.length > 0) && !atts.uploading;

  const submit = () => {
    if (!canSend || disabled || isSending) return;
    onSend();
  };

  const handleSendAudio = async (file: File, duration: number, waveform: number[]) => {
    try {
      await atts.addAudioFile(file, duration, waveform);
      setIsRecording(false);
      setTimeout(() => {
        onSend();
      }, 50);
    } catch (err) {
      console.error("Failed to upload audio voice note:", err);
    }
  };

  const handleFormat = (prefix: string, suffix: string = prefix) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = value;
    const selected = text.substring(start, end);
    const replacement = `${prefix}${selected || "text"}${suffix}`;
    const next = text.substring(0, start) + replacement + text.substring(end);
    onChange(next);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
      }
    }, 0);
  };

  const EMOJIS = ["👍", "❤️", "🔥", "🎉", "💡", "📚", "✨", "🙌", "🎯", "👏"];

  return (
    <div className="shrink-0 border-t border-slate-200/80 dark:border-white/10 p-3 sm:p-4 bg-white/80 dark:bg-[#131316]/80 backdrop-blur-md">
      <TypingIndicator users={typingUsers} />

      {/* Editing message banner */}
      {editing && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-[12px] text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-500/20">
          <Pencil className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 font-medium">Editing message</span>
          <button
            onClick={onCancelEdit}
            className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer"
            aria-label="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reply quote banner */}
      {!editing && replyPreview && (
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl bg-slate-100/80 dark:bg-white/5 text-[12px] border border-slate-200/60 dark:border-white/5">
          <Reply className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" />
          <div className="min-w-0 flex-1">
            <span className="font-bold text-slate-700 dark:text-gray-200">{replyPreview.name}</span>
            <p className="truncate text-slate-400 dark:text-gray-500">{replyPreview.text}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer"
            aria-label="Cancel reply"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}

      {/* Attachment pending upload bar */}
      {!editing && <AttachmentBar pending={atts.pending} onRemove={atts.remove} />}

      {/* Voice Recorder Mode */}
      {isRecording ? (
        <VoiceRecorder
          onSendAudio={handleSendAudio}
          onCancel={() => setIsRecording(false)}
        />
      ) : (
        <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-[#19191c] p-2.5 focus-within:border-slate-400 dark:focus-within:border-white/20 transition-all shadow-2xs">
          {/* Quick Toolbar (Inspired by Reference Image 1 & 5) */}
          <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-200/50 dark:border-white/5">
            <div className="flex items-center gap-1 text-slate-400 dark:text-gray-400">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Add Emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("**")}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("*")}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("~~")}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />

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
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Attach Document"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) atts.addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Attach Photo"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsRecording(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11.5px] font-semibold text-emerald-600 dark:text-[#c8e558] hover:bg-emerald-50 dark:hover:bg-[#c8e558]/10 transition-colors cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
          </div>

          {/* Emoji Picker Popup */}
          {showEmojiPicker && (
            <div className="p-2 border-b border-slate-200/60 dark:border-white/5 flex flex-wrap gap-1.5">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(value + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-[16px] flex items-center justify-center transition-colors cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Text input area */}
          <div className="flex items-end gap-2 pt-2 px-1">
            <textarea
              ref={textareaRef}
              rows={1}
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
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 bg-transparent border-0 outline-none text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 resize-none max-h-32 min-h-[38px] py-1.5 leading-relaxed"
            />

            <button
              onClick={submit}
              disabled={!canSend || disabled || isSending}
              aria-label="Send message"
              type="button"
              className={cn(
                "shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm",
                canSend && !disabled && !isSending
                  ? "bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-900 hover:opacity-90 active:scale-95"
                  : "bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 cursor-not-allowed opacity-60"
              )}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      )}

      {/* Pro tip helper text from reference screenshot */}
      <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-slate-400 dark:text-gray-500">
        <span>
          <strong className="font-semibold text-slate-600 dark:text-gray-400">Pro tip:</strong> press <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 font-mono text-[10px]">Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}
