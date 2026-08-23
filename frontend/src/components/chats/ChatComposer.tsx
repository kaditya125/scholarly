import React, { useRef, useState } from "react";
import {
  Send,
  Paperclip,
  X,
  Reply,
  Pencil,
  Mic,
  Smile,
  Type,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
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
    <div className="shrink-0 p-3 sm:p-4 bg-transparent font-sans">
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
        <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl bg-white/90 dark:bg-white/5 text-[12px] border border-slate-200/80 dark:border-white/5 shadow-2xs">
          <Reply className="w-3.5 h-3.5 shrink-0 text-[#107050] dark:text-[#c8e558]" />
          <div className="min-w-0 flex-1">
            <span className="font-bold text-slate-700 dark:text-gray-200">{replyPreview.name}</span>
            <p className="truncate text-slate-400 dark:text-gray-500">{replyPreview.text}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
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
        /* Minimalistic Sleek Composer Box */
        <div className="rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#18181b] p-2.5 focus-within:border-slate-400 dark:focus-within:border-white/20 transition-all shadow-xs">
          {/* Top Quick Minimal Toolbar matching Reference UI */}
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-100 dark:border-white/5 text-slate-400 dark:text-gray-400">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Emoji"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("**")}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("*")}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat("<u>", "</u>")}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-white/10 mx-1" />

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
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Attach Document"
              >
                <Paperclip className="w-3.5 h-3.5" />
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
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Attach Photo"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsRecording(true)}
                className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-emerald-600 dark:hover:text-[#c8e558] transition-colors cursor-pointer"
                title="Voice Note"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Top right green paperplane button matching reference template */}
            <button
              onClick={submit}
              disabled={!canSend || disabled || isSending}
              aria-label="Send message"
              type="button"
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                canSend && !disabled && !isSending
                  ? "text-[#107050] dark:text-[#c8e558] hover:bg-emerald-50 dark:hover:bg-white/10 active:scale-95"
                  : "text-slate-300 dark:text-gray-600 cursor-not-allowed opacity-50"
              )}
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Emoji Picker Popup */}
          {showEmojiPicker && (
            <div className="p-1.5 border-b border-slate-100 dark:border-white/5 flex flex-wrap gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onChange(value + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="w-7 h-7 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-[15px] flex items-center justify-center transition-colors cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Text Input Area */}
          <div className="pt-1.5 px-1">
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
              className="w-full bg-transparent border-0 outline-none text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 resize-none max-h-28 min-h-[32px] py-1 leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* Pro tip helper text */}
      <div className="flex items-center justify-between px-2 pt-1.5 text-[10.5px] text-slate-400 dark:text-gray-500">
        <span>
          <strong className="font-semibold text-slate-600 dark:text-gray-400">Pro tips:</strong> can press <kbd className="px-1 py-0.2 bg-white dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 font-mono text-[9.5px]">Enter</kbd> to send, <kbd className="px-1 py-0.2 bg-white dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 font-mono text-[9.5px]">Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}
