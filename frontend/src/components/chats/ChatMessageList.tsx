import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Play, Pause, Volume2, Eye, Share2, MessageCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/ThemeContext";
import { PeerAvatar } from "../social/PeerAvatar";
import { MessageAttachments } from "../social/MessageAttachments";
import { MessageReactions } from "../social/MessageReactions";
import { MessageActionsMenu } from "../social/MessageActionsMenu";
import { clockTime, dayLabel } from "./format";
import type { Attachment } from "../../lib/api/uploads";

export interface ThreadMessage {
  id: string;
  senderId: string;
  text: string;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>;
  replyTo?: { id: string; senderId: string; text: string };
  editedAt?: number;
  deleted?: boolean;
  pinned?: boolean;
  createdAt: number;
}

interface Sender {
  displayName: string;
  photoURL?: string;
}

interface ChatMessageListProps {
  messages: ThreadMessage[];
  currentUid?: string;
  variant: "dm" | "channel";
  resolveSender: (uid: string) => Sender;
  canEdit: (m: ThreadMessage) => boolean;
  canDelete: (m: ThreadMessage) => boolean;
  onReply: (m: ThreadMessage) => void;
  onEdit: (m: ThreadMessage) => void;
  onDelete: (m: ThreadMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onPin: (m: ThreadMessage) => void;
  onSave?: (m: ThreadMessage) => void;
  isSaved?: (messageId: string) => boolean;
  lastSeenMessageId?: string | null;
  isPeerOnline?: boolean;
  peerLastReadAt?: number;
}

function MessageDeliveryCheck({
  msg,
  isPeerOnline,
  peerLastReadAt,
}: {
  msg: ThreadMessage;
  isPeerOnline?: boolean;
  peerLastReadAt?: number;
}) {
  const isPending = msg.id.startsWith("tmp-");
  if (isPending) {
    return (
      <span title="Sending..." aria-label="Sending message" className="inline-flex items-center ml-1 opacity-60">
        <Clock className="w-2.5 h-2.5 animate-pulse" />
      </span>
    );
  }

  const isRead = typeof peerLastReadAt === "number" && msg.createdAt <= peerLastReadAt;
  if (isRead) {
    return (
      <span
        title="Read"
        aria-label="Message read"
        className="inline-flex items-center ml-1 text-[#8ba32b] dark:text-[#c8e558]"
      >
        <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.4} />
      </span>
    );
  }

  const isDelivered = isPeerOnline || (typeof peerLastReadAt === "number" && peerLastReadAt > 0);
  if (isDelivered) {
    return (
      <span
        title="Delivered"
        aria-label="Message delivered"
        className="inline-flex items-center ml-1 opacity-75"
      >
        <CheckCheck className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      title="Sent"
      aria-label="Message sent"
      className="inline-flex items-center ml-1 opacity-60"
    >
      <Check className="w-3.5 h-3.5" strokeWidth={2} />
    </span>
  );
}

/** Audio Voice Note Waveform component inspired by Reference Image 1 & 5 */
function AudioVoiceMessage({ url, duration = "0:45" }: { url?: string; duration?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current && url) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-3 py-1 px-1 min-w-[220px]">
      <button
        onClick={togglePlay}
        type="button"
        className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 cursor-pointer"
        aria-label={isPlaying ? "Pause audio note" : "Play audio note"}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
      </button>

      {/* Simulated waveform visualization */}
      <div className="flex-1 flex items-center gap-0.5 h-6">
        {[40, 65, 85, 30, 95, 75, 45, 90, 60, 80, 50, 70, 90, 40, 85, 60, 30, 75, 55, 35].map((height, i) => (
          <span
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-200",
              isPlaying && i < 10
                ? "bg-emerald-500 dark:bg-[#c8e558]"
                : "bg-slate-300 dark:bg-white/20"
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <span className="text-[11px] font-mono font-medium opacity-70 shrink-0">
        {duration}
      </span>
    </div>
  );
}

export function ChatMessageList({
  messages,
  currentUid,
  variant,
  resolveSender,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onSave,
  isSaved,
  lastSeenMessageId,
  isPeerOnline,
  peerLastReadAt,
}: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const { chatColor } = useTheme();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const grouped = useMemo(() => {
    const items: ({ type: "day"; label: string } | { type: "msg"; msg: ThreadMessage })[] = [];
    let lastDay = "";
    for (const m of messages) {
      const label = dayLabel(m.createdAt);
      if (label !== lastDay) {
        items.push({ type: "day", label });
        lastDay = label;
      }
      items.push({ type: "msg", msg: m });
    }
    return items;
  }, [messages]);

  return (
    <div className="p-4 sm:p-6 space-y-3.5">
      {grouped.map((item, i) => {
        if (item.type === "day") {
          return (
            <div key={`day-${i}`} className="flex items-center justify-center my-6">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 px-3.5 py-1 rounded-full shadow-2xs">
                {item.label}
              </span>
            </div>
          );
        }

        const msg = item.msg;
        const mine = msg.senderId === currentUid;
        const sender = resolveSender(msg.senderId);
        const showAvatar = variant === "channel" && !mine;

        if (msg.deleted) {
          return (
            <div
              key={msg.id}
              id={`m-${msg.id}`}
              className={cn("flex gap-3", mine ? "justify-end" : "justify-start")}
            >
              {showAvatar && (
                <PeerAvatar
                  name={sender.displayName}
                  photoURL={sender.photoURL}
                  seed={msg.senderId}
                  className="w-9 h-9 text-[12px] mt-0.5"
                />
              )}
              <div className="max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-2.5 text-[12.5px] italic bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-500 border border-dashed border-slate-200 dark:border-white/10">
                This message was deleted
              </div>
            </div>
          );
        }

        const replyName = msg.replyTo
          ? msg.replyTo.senderId === currentUid
            ? "You"
            : resolveSender(msg.replyTo.senderId).displayName
          : "";

        const hasAudio = msg.attachments?.some((a) => a.kind === "audio") || msg.text?.startsWith("🎙️ [Voice Note]");

        return (
          <div
            key={msg.id}
            id={`m-${msg.id}`}
            className={cn("flex gap-3 group items-start", mine ? "justify-end" : "justify-start")}
          >
            {showAvatar && (
              <PeerAvatar
                name={sender.displayName}
                photoURL={sender.photoURL}
                seed={msg.senderId}
                className="w-9 h-9 text-[12px] mt-0.5 shrink-0"
              />
            )}

            <div className={cn("flex flex-col min-w-0 max-w-[84%] md:max-w-[70%]", mine && "items-end")}>
              {/* Sender Name for incoming group messages */}
              {showAvatar && (
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-[12.5px] font-bold text-slate-900 dark:text-gray-200">
                    {sender.displayName}
                  </span>
                  <span className="text-[10.5px] text-slate-400 dark:text-gray-500">
                    {clockTime(msg.createdAt)}
                  </span>
                </div>
              )}

              {/* Message Bubble Container */}
              <div className={cn("flex items-center gap-1.5 max-w-full", mine ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "min-w-0 rounded-3xl px-4 py-3 text-[13.5px] leading-relaxed break-words shadow-2xs transition-all",
                    mine
                      ? "bg-slate-900 dark:bg-emerald-950/60 text-white border border-slate-800 dark:border-emerald-500/30 rounded-tr-sm"
                      : "bg-white dark:bg-[#1c1c1f] text-slate-800 dark:text-gray-100 border border-slate-200/80 dark:border-white/10 rounded-tl-sm"
                  )}
                  style={mine && chatColor !== "none" ? { backgroundColor: chatColor } : undefined}
                >
                  {/* Quoted Reply Banner */}
                  {msg.replyTo && (
                    <div
                      className={cn(
                        "mb-2 pl-2.5 py-1 border-l-2 rounded-r-lg text-[12px]",
                        mine
                          ? "border-emerald-400 bg-white/10 text-emerald-100"
                          : "border-[#8ba32b] dark:border-[#c8e558] bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-gray-300"
                      )}
                    >
                      <span className="font-bold opacity-90 block">{replyName}</span>
                      <p className="truncate opacity-75">{msg.replyTo.text}</p>
                    </div>
                  )}

                  {/* Audio Voice Player */}
                  {hasAudio ? (
                    <AudioVoiceMessage duration="15:00" />
                  ) : (
                    <>
                      {/* Image / File Attachments */}
                      <MessageAttachments attachments={msg.attachments} mine={mine} />
                      {msg.text && <span className="whitespace-pre-wrap">{msg.text}</span>}
                    </>
                  )}

                  {/* Metadata Row */}
                  <div className="flex items-center justify-end gap-1.5 text-[10px] mt-1.5 text-right font-medium">
                    <span className={cn(mine ? "text-white/70 dark:text-emerald-200/70" : "text-slate-400 dark:text-gray-500")}>
                      {msg.editedAt ? "edited • " : ""}
                      {clockTime(msg.createdAt)}
                    </span>
                    {variant === "dm" && mine && (
                      <MessageDeliveryCheck
                        msg={msg}
                        isPeerOnline={isPeerOnline}
                        peerLastReadAt={peerLastReadAt}
                      />
                    )}
                  </div>
                </div>

                {/* Hover Message Actions */}
                <MessageActionsMenu
                  canEdit={canEdit(msg)}
                  canDelete={canDelete(msg)}
                  onReply={() => onReply(msg)}
                  onEdit={() => onEdit(msg)}
                  onDelete={() => onDelete(msg)}
                  onPin={() => onPin(msg)}
                  onSave={onSave ? () => onSave(msg) : undefined}
                  isSaved={isSaved ? isSaved(msg.id) : false}
                  isPinned={msg.pinned}
                  align={mine ? "right" : "left"}
                />
              </div>

              {/* Message Reactions Bar */}
              <MessageReactions
                reactions={msg.reactions}
                myUid={currentUid}
                onToggle={(e) => onReact(msg.id, e)}
                align={mine ? "right" : "left"}
              />
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
