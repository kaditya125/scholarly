import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Play, Pause, Eye, MessageSquare, CornerDownRight } from "lucide-react";
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
  replyCount?: number;
  viewCount?: number;
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
      <span title="Sending..." aria-label="Sending message" className="inline-flex items-center opacity-60">
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
        className="inline-flex items-center text-[#c8e558] dark:text-[#c8e558]"
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
        className="inline-flex items-center opacity-75"
      >
        <CheckCheck className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span
      title="Sent"
      aria-label="Message sent"
      className="inline-flex items-center opacity-60"
    >
      <Check className="w-3.5 h-3.5" strokeWidth={2} />
    </span>
  );
}

/** Audio Voice Note Waveform component matching the exact UI reference template */
function AudioVoiceMessage({ url, duration = "15:00" }: { url?: string; duration?: string }) {
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
    <div className="flex items-center gap-3 py-1 px-1 min-w-[240px] sm:min-w-[280px]">
      <button
        onClick={togglePlay}
        type="button"
        className="w-7 h-7 rounded-full bg-[#107050] hover:bg-[#0c593f] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform active:scale-95 cursor-pointer"
        aria-label={isPlaying ? "Pause audio note" : "Play audio note"}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
      </button>

      {/* Simulated sleek waveform visualization */}
      <div className="flex-1 flex items-center gap-[2.5px] h-6">
        {[20, 35, 60, 85, 45, 95, 75, 45, 90, 60, 80, 50, 70, 90, 40, 85, 60, 30, 75, 55, 35, 65, 80, 45, 25].map((height, i) => (
          <span
            key={i}
            className={cn(
              "w-[2px] rounded-full transition-all duration-200",
              isPlaying && i < 12
                ? "bg-[#107050] dark:bg-[#c8e558]"
                : "bg-slate-300/80 dark:bg-white/20"
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <span className="text-[11px] font-mono font-medium opacity-65 shrink-0 text-slate-500 dark:text-gray-400">
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
    <div className="p-4 sm:p-6 space-y-6 font-sans">
      {grouped.map((item, i) => {
        if (item.type === "day") {
          return (
            <div key={`day-${i}`} className="flex items-center justify-center my-6">
              <span className="text-[11.5px] font-semibold text-slate-500 dark:text-gray-400 bg-white/90 dark:bg-[#1a1a1e]/90 border border-slate-200/80 dark:border-white/10 px-4 py-1 rounded-full shadow-2xs">
                {item.label}
              </span>
            </div>
          );
        }

        const msg = item.msg;
        const mine = msg.senderId === currentUid;
        const sender = resolveSender(msg.senderId);
        const mySender = currentUid ? resolveSender(currentUid) : { displayName: "You" };

        if (msg.deleted) {
          return (
            <div
              key={msg.id}
              id={`m-${msg.id}`}
              className={cn("flex gap-3", mine ? "justify-end" : "justify-start")}
            >
              <div className="max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-2.5 text-[12.5px] italic bg-white/80 dark:bg-white/5 text-slate-400 dark:text-gray-500 border border-dashed border-slate-200 dark:border-white/10">
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
        const isReply = !!msg.replyTo;

        return (
          <div
            key={msg.id}
            id={`m-${msg.id}`}
            className={cn(
              "flex gap-3.5 group items-start relative",
              mine ? "justify-end flex-row" : "justify-start flex-row",
              isReply && !mine && "ml-3 sm:ml-6"
            )}
          >
            {/* Thread Connecting Branch Line for Nested Replies */}
            {isReply && !mine && (
              <div className="absolute -left-5 top-0 bottom-4 w-4 border-l-2 border-b-2 border-emerald-500/40 rounded-bl-xl pointer-events-none" />
            )}

            {/* Sender Avatar for incoming message (on left) */}
            {!mine && (
              <div className="relative shrink-0">
                <PeerAvatar
                  name={sender.displayName}
                  photoURL={sender.photoURL}
                  seed={msg.senderId}
                  className="w-9 h-9 text-[12px] mt-0.5 shadow-xs ring-1 ring-slate-200/70 dark:ring-white/10"
                />
              </div>
            )}

            <div className={cn("flex flex-col min-w-0 max-w-[85%] sm:max-w-[72%]", mine && "items-end")}>
              {/* Header Label (Sender Name on left, Timestamp on far right) */}
              <div className="flex items-center justify-between w-full mb-1.5 px-1">
                <span className={cn("text-[13px] font-bold tracking-tight", mine ? "text-slate-800 dark:text-gray-200" : "text-slate-900 dark:text-white")}>
                  {mine ? mySender.displayName || "You" : sender.displayName}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium">
                  {clockTime(msg.createdAt)}
                </span>
              </div>

              {/* Message Bubble Container */}
              <div className={cn("flex items-center gap-1.5 max-w-full", mine ? "flex-row-reverse" : "flex-row")}>
                <div
                  className={cn(
                    "min-w-0 rounded-[20px] px-4 py-3 text-[13.5px] leading-relaxed break-words shadow-2xs transition-all relative",
                    mine
                      ? "bg-[#186a52] text-white dark:bg-[#135d47] rounded-tr-[4px] border border-[#145d47]"
                      : "bg-white dark:bg-[#1c1c20] text-slate-800 dark:text-gray-100 rounded-tl-[4px] border border-slate-200/90 dark:border-white/10"
                  )}
                  style={mine && chatColor !== "none" ? { backgroundColor: chatColor } : undefined}
                >
                  {/* Quoted Reply Banner */}
                  {msg.replyTo && (
                    <div
                      className={cn(
                        "mb-2.5 pl-3 py-1.5 border-l-2 rounded-r-xl text-[12px]",
                        mine
                          ? "border-emerald-300 bg-white/10 text-emerald-100"
                          : "border-[#186a52] dark:border-[#c8e558] bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-gray-300"
                      )}
                    >
                      <span className="font-bold opacity-90 block">{replyName}</span>
                      <p className="truncate opacity-80">{msg.replyTo.text}</p>
                    </div>
                  )}

                  {/* Audio Voice Player */}
                  {hasAudio ? (
                    <AudioVoiceMessage duration="15:00" />
                  ) : (
                    <>
                      {/* Image / File Attachments (Sleek Compact Strip) */}
                      <MessageAttachments attachments={msg.attachments} mine={mine} />
                      {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                    </>
                  )}

                  {/* Outgoing Delivery Checkmark */}
                  {mine && (
                    <div className="flex items-center justify-end gap-1 text-[10px] mt-1 text-right text-emerald-100/90 font-medium">
                      {msg.editedAt && <span>edited •</span>}
                      {variant === "dm" && (
                        <MessageDeliveryCheck
                          msg={msg}
                          isPeerOnline={isPeerOnline}
                          peerLastReadAt={peerLastReadAt}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Hover Message Actions Menu */}
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

              {/* Bottom Footer: Reactions & View Count Badge (Exact Reference Style) */}
              <div className={cn("flex items-center gap-2 mt-1.5 px-1", mine ? "justify-end" : "justify-between w-full")}>
                <div className="flex items-center gap-2">
                  {/* Reactions Pill */}
                  <MessageReactions
                    reactions={msg.reactions}
                    myUid={currentUid}
                    onToggle={(e) => onReact(msg.id, e)}
                    align={mine ? "right" : "left"}
                  />

                  {/* Views Metric */}
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium flex items-center gap-1">
                    <Eye className="w-3 h-3 text-slate-400 opacity-70" />
                    <span>292 views</span>
                  </span>
                </div>

                {/* Reply action trigger */}
                {!mine && (
                  <button
                    onClick={() => onReply(msg)}
                    className="text-[11.5px] font-semibold text-[#186a52] dark:text-[#c8e558] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Reply</span>
                  </button>
                )}
              </div>

              {/* Thread replies link if applicable */}
              {msg.replyCount && msg.replyCount > 0 ? (
                <button
                  onClick={() => onReply(msg)}
                  className="text-[11.5px] font-bold text-[#186a52] dark:text-[#c8e558] hover:underline mt-1 px-1 flex items-center gap-1 cursor-pointer"
                >
                  <span>show replies ({msg.replyCount})</span>
                </button>
              ) : null}
            </div>

            {/* Self Avatar on the right side */}
            {mine && (
              <div className="relative shrink-0">
                <PeerAvatar
                  name={mySender.displayName}
                  photoURL={mySender.photoURL}
                  seed={currentUid}
                  className="w-9 h-9 text-[12px] mt-0.5 shadow-xs ring-1 ring-slate-200/70 dark:ring-white/10"
                />
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
