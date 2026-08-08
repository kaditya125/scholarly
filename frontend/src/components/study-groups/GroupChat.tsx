import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Hash,
  Plus,
  Send,
  Info,
  Loader2,
  Pencil,
  Trash2,
  X,
  Settings2,
  Paperclip,
  Reply,
  Check,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useGroupChannels, useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useAttachments } from "../../hooks/useAttachments";
import { useTyping } from "../../hooks/useTyping";
import { PeerAvatar } from "../social/PeerAvatar";
import { MessageAttachments } from "../social/MessageAttachments";
import { AttachmentBar } from "../social/AttachmentBar";
import { TypingIndicator } from "../social/TypingIndicator";
import { MessageReactions } from "../social/MessageReactions";
import { MessageActionsMenu } from "../social/MessageActionsMenu";
import { PinnedBar, PinnedItem } from "../social/PinnedBar";
import { getAvatarColor, getInitials } from "./utils";
import { GroupDetails } from "./GroupDetails";
import { StudyCircle } from "./StudyCircle";
import type { GroupChannelMessage } from "../../lib/api/groupChannels";

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

interface GroupChatProps {
  groupId: string;
  onBack: () => void;
  onExit: () => void;
}

export function GroupChat({ groupId, onBack, onExit }: GroupChatProps) {
  const { user } = useAuth();
  const { group } = useStudyGroup(groupId);
  const {
    channels,
    isLoading: channelsLoading,
    createChannel,
    renameChannel,
    deleteChannel,
    clearUnread,
  } = useGroupChannels(groupId);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [channelMenu, setChannelMenu] = useState(false);
  const [form, setForm] = useState<{ mode: "create" | "rename"; channelId?: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"channels" | "circle">("channels");

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const atts = useAttachments();
  const typing = useTyping(
    groupId && selectedChannelId ? ["studyGroups", groupId, "channels", selectedChannelId] : null
  );

  const {
    messages,
    senders,
    isLoading: messagesLoading,
    send,
    isSending,
    react,
    editMessage,
    deleteMessage,
    pinnedMessages,
    pinnedSenders,
    pinMessage,
  } = useChannelMessages(groupId, selectedChannelId || undefined);

  const [replyingTo, setReplyingTo] = useState<{ id: string; senderId: string; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const me = group?.memberProfiles.find((m) => m.uid === user?.uid);
  const isAdmin = me?.role === "admin" || !!me?.isOwner;
  const activeChannel = channels.find((c) => c.id === selectedChannelId) || null;

  // Default-select the first channel (and keep a valid selection if the list changes).
  useEffect(() => {
    if (channels.length > 0 && (!selectedChannelId || !channels.some((c) => c.id === selectedChannelId))) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedChannelId]);

  // Reset the composer when switching channels.
  useEffect(() => {
    setDraft("");
    setReplyingTo(null);
    setEditing(null);
    atts.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId]);

  const selectChannel = (id: string) => {
    setSelectedChannelId(id);
    clearUnread(id);
  };

  const resolveSender = (uid: string) =>
    senders[uid] ||
    group?.memberProfiles.find((m) => m.uid === uid) || { displayName: "Scholarly learner", photoURL: undefined };

  const startReply = (m: GroupChannelMessage) => {
    setEditing(null);
    setReplyingTo({
      id: m.id,
      senderId: m.senderId,
      text: m.text || (m.attachments?.length ? "📎 Attachment" : ""),
    });
    inputRef.current?.focus();
  };
  const startEdit = (m: GroupChannelMessage) => {
    setReplyingTo(null);
    setEditing({ id: m.id, text: m.text });
    setDraft(m.text);
    inputRef.current?.focus();
  };
  const cancelCompose = () => {
    setEditing(null);
    setReplyingTo(null);
    setDraft("");
  };

  const onSend = async () => {
    const text = draft.trim();

    if (editing) {
      if (!text) return;
      const { id } = editing;
      setEditing(null);
      setDraft("");
      try {
        await editMessage({ messageId: id, text });
      } catch {
        setEditing({ id, text });
        setDraft(text);
      }
      return;
    }

    const attachments = atts.ready;
    if ((!text && attachments.length === 0) || isSending || atts.uploading || !selectedChannelId) return;
    const reply = replyingTo;
    setDraft("");
    setReplyingTo(null);
    try {
      await send({
        text,
        attachments: attachments.length ? attachments : undefined,
        replyToId: reply?.id,
        replyTo: reply || undefined,
      });
      atts.clear();
    } catch {
      setDraft(text);
      setReplyingTo(reply);
    }
  };

  const submitForm = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (form.mode === "create") {
        const ch = await createChannel({ name });
        setSelectedChannelId((ch as any).id);
      } else if (form.channelId) {
        await renameChannel({ channelId: form.channelId, name });
      }
      setForm(null);
    } catch {
      /* keep the form open on error */
    } finally {
      setBusy(false);
    }
  };

  const onDeleteChannel = async () => {
    if (!activeChannel) return;
    setChannelMenu(false);
    if (!window.confirm(`Delete #${activeChannel.name}? Its messages will be permanently removed.`)) return;
    setBusy(true);
    try {
      await deleteChannel(activeChannel.id);
      setSelectedChannelId(null);
    } catch (e: any) {
      window.alert(e?.response?.data?.error || "Couldn't delete channel");
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const items: ({ type: "day"; label: string } | { type: "msg"; msg: GroupChannelMessage })[] = [];
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

  const jumpToMessage = (id: string) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const pinnedItems: PinnedItem[] = useMemo(
    () =>
      pinnedMessages.map((m) => ({
        id: m.id,
        senderName:
          m.senderId === user?.uid
            ? "You"
            : pinnedSenders[m.senderId]?.displayName ||
              group?.memberProfiles.find((p) => p.uid === m.senderId)?.displayName ||
              "Member",
        text: m.text || (m.attachments?.length ? "📎 Attachment" : "Message"),
      })),
    [pinnedMessages, pinnedSenders, user?.uid, group?.memberProfiles]
  );

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#131314]">
      {/* Header */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-800/60">
        <button
          onClick={onBack}
          className="md:hidden -ml-1 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label="Back to groups"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {group && (
          <div
            className={cn(
              "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white text-[13px] font-bold",
              getAvatarColor(group.id)
            )}
          >
            {getInitials(group.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate leading-tight">
            {group?.name || "Group"}
          </p>
          <p className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
            {group ? `${group.memberProfiles.length} member${group.memberProfiles.length === 1 ? "" : "s"}` : "…"}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-0.5 p-0.5 rounded-full bg-slate-100 dark:bg-white/5">
          <button
            onClick={() => setView("channels")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-full text-[12px] font-bold transition-colors",
              view === "channels"
                ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
            )}
          >
            <Hash className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Chat</span>
          </button>
          <button
            onClick={() => setView("circle")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 sm:px-3 h-8 rounded-full text-[12px] font-bold transition-colors",
              view === "circle"
                ? "bg-white dark:bg-white/15 text-violet-600 dark:text-violet-300 shadow-sm"
                : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Study Circle</span>
          </button>
        </div>
        <button
          onClick={() => setShowInfo(true)}
          className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 text-[12.5px] font-bold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
        >
          <Info className="w-4 h-4" /> <span className="hidden sm:inline">Group info</span>
        </button>
      </div>

      {view === "circle" ? (
        <StudyCircle groupId={groupId} isAdmin={isAdmin} />
      ) : (
        <>
      {/* Channels bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 overflow-x-auto custom-scrollbar">
        {channelsLoading && channels.length === 0 ? (
          <div className="h-7 w-40 rounded-full bg-slate-100 dark:bg-white/5 animate-pulse" />
        ) : (
          channels.map((c) => {
            const active = c.id === selectedChannelId;
            return (
              <button
                key={c.id}
                onClick={() => selectChannel(c.id)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-[12.5px] font-semibold transition-colors",
                  active
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/15"
                )}
              >
                <Hash className="w-3.5 h-3.5 opacity-80" />
                {c.name}
                {c.unread && !active && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
              </button>
            );
          })
        )}
        {isAdmin && (
          <button
            onClick={() => setForm({ mode: "create", name: "" })}
            title="Create channel"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-white/10 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {isAdmin && activeChannel && (
          <div className="relative shrink-0 ml-auto">
            <button
              onClick={() => setChannelMenu((v) => !v)}
              title="Channel settings"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            {channelMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setChannelMenu(false)} />
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl py-1 text-[13px]">
                  <button
                    onClick={() => {
                      setForm({ mode: "rename", channelId: activeChannel.id, name: activeChannel.name });
                      setChannelMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Rename channel
                  </button>
                  <button
                    onClick={onDeleteChannel}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete channel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <PinnedBar
        items={pinnedItems}
        onJump={jumpToMessage}
        onUnpin={(id) => pinMessage({ messageId: id, pinned: false })}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-1">
        {messagesLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <Hash className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-[13px] font-semibold text-slate-600 dark:text-gray-300 mb-1">
              Welcome to #{activeChannel?.name || "the channel"}
            </p>
            <p className="text-[12px] text-slate-400 dark:text-gray-500">
              This is the beginning of the conversation.
            </p>
          </div>
        ) : (
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
                  const mine = msg.senderId === user?.uid;
                  const sender = resolveSender(msg.senderId);

                  if (msg.deleted) {
                    return (
                      <div key={msg.id} id={`m-${msg.id}`} className={cn("flex gap-2.5", mine ? "justify-end" : "justify-start")}>
                        {!mine && (
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
                    ? msg.replyTo.senderId === user?.uid
                      ? "You"
                      : resolveSender(msg.replyTo.senderId).displayName
                    : "";

                  return (
                    <div key={msg.id} id={`m-${msg.id}`} className={cn("flex gap-2.5 group", mine ? "justify-end" : "justify-start")}>
                      {!mine && (
                        <PeerAvatar
                          name={sender.displayName}
                          photoURL={sender.photoURL}
                          seed={msg.senderId}
                          className="w-8 h-8 text-[11px] mt-0.5"
                        />
                      )}
                      <div className={cn("flex flex-col min-w-0 max-w-[78%] md:max-w-[64%]", mine && "items-end")}>
                        {!mine && (
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
                                : "bg-slate-100 dark:bg-[#1e1e1f] text-slate-800 dark:text-gray-100 rounded-bl-md"
                            )}
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
                            <span
                              className={cn(
                                "block text-[10px] mt-1 text-right",
                                mine ? "text-white/60" : "text-slate-400 dark:text-gray-500"
                              )}
                            >
                              {msg.editedAt ? "edited · " : ""}
                              {clockTime(msg.createdAt)}
                            </span>
                          </div>
                          <MessageActionsMenu
                            canEdit={mine}
                            canDelete={mine || isAdmin}
                            onReply={() => startReply(msg)}
                            onEdit={() => startEdit(msg)}
                            onDelete={() => {
                              if (window.confirm("Delete this message?")) deleteMessage(msg.id);
                            }}
                            onPin={() => pinMessage({ messageId: msg.id, pinned: !msg.pinned })}
                            isPinned={msg.pinned}
                            align={mine ? "right" : "left"}
                          />
                        </div>
                        <MessageReactions
                          reactions={msg.reactions}
                          myUid={user?.uid}
                          onToggle={(e) => react({ messageId: msg.id, emoji: e })}
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
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/60 p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) atts.addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {editing && (
          <div className="flex items-center gap-2 px-1 pb-2 text-[12.5px]">
            <Pencil className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-slate-500 dark:text-gray-400">Editing message</span>
            <button
              onClick={cancelCompose}
              className="ml-auto p-0.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400"
              aria-label="Cancel edit"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {replyingTo && !editing && (
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-slate-100 dark:bg-white/5 border-l-2 border-violet-500">
            <Reply className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-violet-500">
                Replying to {replyingTo.senderId === user?.uid ? "yourself" : resolveSender(replyingTo.senderId).displayName}
              </p>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 truncate">{replyingTo.text}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 shrink-0"
              aria-label="Cancel reply"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {!editing && <TypingIndicator users={typing.typingUsers} />}
        {!editing && <AttachmentBar pending={atts.pending} onRemove={atts.remove} />}
        <div className="flex items-end gap-2 bg-slate-50 dark:bg-[#1C1C1E] rounded-2xl border border-slate-200 dark:border-white/10 px-2 py-2 focus-within:border-slate-400 dark:focus-within:border-white/25 transition-colors">
          {!editing && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeChannel}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!editing) typing.notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder={
              editing ? "Edit message…" : activeChannel ? `Message #${activeChannel.name}` : "Message…"
            }
            disabled={!activeChannel}
            className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400 max-h-32 py-1 disabled:opacity-50"
          />
          <button
            onClick={onSend}
            disabled={
              editing
                ? !draft.trim()
                : (!draft.trim() && atts.ready.length === 0) || isSending || atts.uploading || !activeChannel
            }
            className="shrink-0 w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={editing ? "Save edit" : "Send message"}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : editing ? (
              <Check className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

        </>
      )}

      {/* Channel create/rename modal */}
      <AnimatePresence>
        {form && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setForm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <button
                onClick={() => setForm(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mb-4">
                {form.mode === "create" ? "Create channel" : "Rename channel"}
              </h2>
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-4">
                <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && submitForm()}
                  placeholder="channel-name"
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <button
                onClick={submitForm}
                disabled={busy || !form.name.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-[13px] font-semibold transition-colors"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {form.mode === "create" ? "Create channel" : "Save"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Group info slide-over */}
      <AnimatePresence>
        {showInfo && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setShowInfo(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="relative w-full max-w-md h-full bg-white dark:bg-[#131314] shadow-2xl flex flex-col"
            >
              <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800/60">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Group info</h2>
                <button
                  onClick={() => setShowInfo(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex">
                <GroupDetails
                  groupId={groupId}
                  onExit={() => {
                    setShowInfo(false);
                    onExit();
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
