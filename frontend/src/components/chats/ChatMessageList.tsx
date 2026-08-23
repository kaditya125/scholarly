import React, { useEffect, useMemo, useRef } from "react";
import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/ThemeContext";
import { PeerAvatar } from "../social/PeerAvatar";
import { MessageAttachments } from "../social/MessageAttachments";
import { MessageReactions } from "../social/MessageReactions";
import { MessageActionsMenu } from "../social/MessageActionsMenu";
import { clockTime, dayLabel } from "./format";
import type { Attachment } from "../../lib/api/uploads";

/** Normalized message shape satisfied structurally by both DmMessage and GroupChannelMessage. */
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
  /** "channel" shows sender avatar + name for others; "dm" is 1:1 with a Seen receipt. */
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
        className="inline-flex items-center ml-1 text-[#c8e558] dark:text-[#c8e558]"
      >
        <CheckCheck className="w-3 h-3" strokeWidth={2.4} />
      </span>
    );
  }

  const isDelivered = isPeerOnline || (typeof peerLastReadAt === "number" && peerLastReadAt > 0);
  if (isDelivered) {
    return (
      <span
        title="Delivered"
        aria-label="Message delivered"
        className="inline-flex items-center ml-1 opacity-70"
      >
        <CheckCheck className="w-3 h-3" strokeWidth={1.9} />
      </span>
    );
  }

  return (
    <span
      title="Sent"
      aria-label="Message sent"
      className="inline-flex items-center ml-1 opacity-60"
    >
      <Check className="w-3 h-3" strokeWidth={1.9} />
    </span>
  );
}

/**
 * Shared thread renderer for DMs and group channels: day separators, reply quotes, attachments,
 * reactions, per-message actions, and (for DMs) a "Seen" receipt. Auto-scrolls to the newest
 * message. Message rows carry `id="m-<id>"` so pinned-bar jump-to-message works.
 */
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
    <>
      {grouped.map((item, i) =>
        item.type === "day" ? (
          <div key={`day-${i}`} className="flex items-center justify-center my-4">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-gray-500 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full">
              {item.label}
            </span>
          </div>
        ) : (
          (() => {
            const msg = item.msg;
            const mine = msg.senderId === currentUid;
            const sender = resolveSender(msg.senderId);
            const showAvatar = variant === "channel" && !mine;

            if (msg.deleted) {
              return (
                <div
                  key={msg.id}
                  id={`m-${msg.id}`}
                  className={cn("flex gap-2.5", mine ? "justify-end" : "justify-start")}
                >
                  {showAvatar && (
                    <PeerAvatar
                      name={sender.displayName}
                      photoURL={sender.photoURL}
                      seed={msg.senderId}
                      className="w-8 h-8 text-[11px] mt-0.5"
                    />
                  )}
                  <div className="max-w-[75%] md:max-w-[60%] rounded-2xl px-3.5 py-2 text-[13px] italic bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-500">
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

            return (
              <div
                key={msg.id}
                id={`m-${msg.id}`}
                className={cn("flex gap-2.5 group", mine ? "justify-end" : "justify-start")}
              >
                {showAvatar && (
                  <PeerAvatar
                    name={sender.displayName}
                    photoURL={sender.photoURL}
                    seed={msg.senderId}
                    className="w-8 h-8 text-[11px] mt-0.5"
                  />
                )}
                <div className={cn("flex flex-col min-w-0 max-w-[82%] md:max-w-[66%]", mine && "items-end")}>
                  {showAvatar && (
                    <p className="text-[11.5px] font-semibold text-slate-500 dark:text-gray-400 mb-0.5 ml-1">
                      {sender.displayName}
                    </p>
                  )}
                  <div className={cn("flex items-center gap-1 max-w-full", mine ? "flex-row-reverse" : "flex-row")}>
                    <div
                      className={cn(
                        "min-w-0 rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed break-words",
                        mine
                          ? "bg-indigo-600 text-white rounded-br-md"
                          : "bg-white dark:bg-[#1e1e1f] text-slate-800 dark:text-gray-100 border border-slate-100 dark:border-white/5 rounded-bl-md"
                      )}
                      style={mine && chatColor !== 'none' ? { backgroundColor: chatColor } : undefined}
                    >
                      {msg.replyTo && (
                        <div
                          className={cn(
                            "mb-1.5 pl-2 border-l-2 text-[12px]",
                            mine ? "border-white/40" : "border-slate-300 dark:border-white/20"
                          )}
                        >
                          <span className="font-semibold opacity-90">{replyName}</span>
                          <p className="truncate opacity-70">{msg.replyTo.text}</p>
                        </div>
                      )}
                      <MessageAttachments attachments={msg.attachments} mine={mine} />
                      {msg.text && <span className="whitespace-pre-wrap">{msg.text}</span>}
                      <div className="flex items-center justify-end gap-1 text-[10px] mt-1 text-right">
                        <span className={cn(mine ? "text-white/70" : "text-slate-400 dark:text-gray-500")}>
                          {msg.editedAt ? "edited · " : ""}
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
                  <MessageReactions
                    reactions={msg.reactions}
                    myUid={currentUid}
                    onToggle={(e) => onReact(msg.id, e)}
                    align={mine ? "right" : "left"}
                  />
                </div>
              </div>
            );
          })()
        )
      )}
      <div ref={endRef} />
    </>
  );
}
