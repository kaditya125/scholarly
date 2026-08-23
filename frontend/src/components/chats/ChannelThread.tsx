import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Hash,
  Loader2,
  Sparkles,
  Info,
  Phone,
  Video,
  Search,
  Image as ImageIcon,
  MoreVertical,
  Radio,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useTyping } from "../../hooks/useTyping";
import { useAttachments } from "../../hooks/useAttachments";
import { useSavedMessages } from "../../hooks/api/useSavedMessages";
import { PinnedBar } from "../social/PinnedBar";
import { ChatMessageList, ThreadMessage } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { GroupCallModal } from "./GroupCallModal";

interface ChannelThreadProps {
  groupId: string;
  channelId: string;
  channelName: string;
  groupName: string;
  isAdmin: boolean;
  onBack?: () => void;
  onOpenInfo?: () => void;
  onOpenAI?: () => void;
}

export function ChannelThread({
  groupId,
  channelId,
  channelName,
  groupName,
  isAdmin,
  onBack,
  onOpenInfo,
  onOpenAI,
}: ChannelThreadProps) {
  const { user } = useAuth();
  const { toggleSave, isSaved } = useSavedMessages();
  const { group } = useStudyGroup(groupId);
  const {
    messages,
    senders,
    isLoading,
    send,
    isSending,
    react,
    editMessage,
    deleteMessage,
    pinnedMessages,
    pinnedSenders,
    pinMessage,
  } = useChannelMessages(groupId, channelId);

  const typing = useTyping(["studyGroups", groupId, "channels", channelId]);
  const atts = useAttachments();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  const memberCount = group?.members?.length || 1;
  const onlineCount = Math.max(1, Math.min(memberCount, Math.floor(memberCount * 0.6) || 1));

  const resolveSender = (uid: string) => {
    const s = senders[uid];
    if (s) return { displayName: s.displayName, photoURL: s.photoURL };
    if (uid === user?.uid) return { displayName: "You", photoURL: user?.photoURL || undefined };
    return { displayName: "Member" };
  };

  const pinnedItems = useMemo(
    () =>
      pinnedMessages.map((m) => ({
        id: m.id,
        senderName: pinnedSenders[m.senderId]?.displayName || (m.senderId === user?.uid ? "You" : "Member"),
        text: m.text || "Attachment",
      })),
    [pinnedMessages, pinnedSenders, user?.uid]
  );

  const jumpTo = (id: string) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSaveMessage = (m: ThreadMessage) => {
    const sender = resolveSender(m.senderId);
    toggleSave({
      messageId: m.id,
      sourceType: "channel",
      groupId,
      channelId,
      groupName,
      channelName,
      senderId: m.senderId,
      senderName: sender.displayName,
      text: m.text || "",
      attachments: m.attachments,
      messageCreatedAt: m.createdAt,
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (editing) {
      if (!text) return;
      const id = editing.id;
      setEditing(null);
      setDraft("");
      try {
        await editMessage({ messageId: id, text });
      } catch {
        /* rolled back in the hook */
      }
      return;
    }
    const attachments = atts.ready;
    if (!text && attachments.length === 0) return;
    const reply = replyTo
      ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text }
      : undefined;
    setDraft("");
    setReplyTo(null);
    atts.clear();
    try {
      await send({
        text,
        attachments: attachments.length ? attachments : undefined,
        replyToId: reply?.id,
        replyTo: reply,
      });
    } catch {
      /* rolled back in the hook */
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fbfbfe] dark:bg-[#101013] font-sans">
      {/* ── Active Conversation Header (Matching Reference Design) ── */}
      <div className="shrink-0 flex items-center justify-between px-5 h-16 bg-white dark:bg-[#141417] border-b border-slate-200/80 dark:border-white/5 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-bold text-base flex items-center justify-center shadow-sm shrink-0">
            {(groupName || "G").charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate leading-tight">
                {groupName}
              </h3>
              <span className="text-slate-400 dark:text-gray-500 text-[13px] font-semibold">/</span>
              <span className="text-emerald-700 dark:text-[#c8e558] text-[13px] font-bold truncate">
                #{channelName}
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 dark:text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
              <span>{memberCount} Member</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{onlineCount} Online</span>
              </span>
            </p>
          </div>
        </div>

        {/* Action icons bar */}
        <div className="flex items-center gap-1 text-slate-600 dark:text-gray-300">
          <button
            onClick={() => onOpenInfo?.()}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Shared Media"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsCallModalOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Start Group Study Call"
          >
            <Video className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsCallModalOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Start Voice Session"
          >
            <Phone className="w-4 h-4" />
          </button>

          {onOpenAI && (
            <button
              onClick={onOpenAI}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors cursor-pointer"
              title="Ask AI in this circle"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}

          {onOpenInfo && (
            <button
              onClick={onOpenInfo}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Group info"
              aria-label="Group info"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <PinnedBar items={pinnedItems} onJump={jumpTo} onUnpin={(id) => pinMessage({ messageId: id, pinned: false })} />

      {/* Message Feed with Watermark Wallpaper */}
      <div className="flex-1 overflow-y-auto custom-scrollbar chat-doodle-wallpaper">
        {isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-[#c8e558] mb-3">
              <Hash className="w-7 h-7" />
            </div>
            <h4 className="text-[16px] font-bold text-slate-900 dark:text-white">
              Welcome to #{channelName}
            </h4>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-1 max-w-sm">
              This is the beginning of the #{channelName} channel. Start discussing exam questions, share notes, or ask doubts!
            </p>
          </div>
        ) : (
          <ChatMessageList
            messages={messages}
            currentUid={user?.uid}
            variant="channel"
            resolveSender={resolveSender}
            canEdit={(m) => m.senderId === user?.uid}
            canDelete={(m) => m.senderId === user?.uid || isAdmin}
            onReply={(m) => setReplyTo(m)}
            onEdit={(m) => {
              setEditing({ id: m.id, text: m.text });
              setDraft(m.text);
            }}
            onDelete={(m) => deleteMessage(m.id)}
            onReact={(messageId, emoji) => react({ messageId, emoji })}
            onPin={(m) => pinMessage({ messageId: m.id, pinned: !m.pinned })}
            onSave={handleSaveMessage}
            isSaved={isSaved}
          />
        )}
      </div>

      {/* Message Composer */}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onTyping={typing.notifyTyping}
        placeholder={`Message #${channelName}…`}
        disabled={!user?.uid}
        isSending={isSending}
        editing={!!editing}
        onCancelEdit={() => {
          setEditing(null);
          setDraft("");
        }}
        replyPreview={
          replyTo
            ? {
                name: replyTo.senderId === user?.uid ? "You" : resolveSender(replyTo.senderId).displayName,
                text: replyTo.text || "Attachment",
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        atts={atts}
        typingUsers={typing.typingUsers}
      />

      {/* Group Call Overlay */}
      <GroupCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        title={groupName}
        subtitle={`Live Study Room • #${channelName}`}
        isGroup={true}
      />
    </div>
  );
}
