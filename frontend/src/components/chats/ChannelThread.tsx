import React, { useMemo, useState } from "react";
import { ArrowLeft, Hash, Loader2, Sparkles, Info, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useTyping } from "../../hooks/useTyping";
import { useAttachments } from "../../hooks/useAttachments";
import { PinnedBar } from "../social/PinnedBar";
import { ChatMessageList, ThreadMessage } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";

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

/** The center pane for a group channel: breadcrumb header, pinned bar, message list, and composer. */
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
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#131314]">
      {/* Header — breadcrumb */}
      <div className="shrink-0 flex items-center gap-2 px-4 h-14 border-b border-slate-100 dark:border-slate-800/60">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0 flex-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-400">
          <span className="hidden sm:inline text-[12.5px] truncate max-w-[140px]">{groupName}</span>
          <ChevronRight className="hidden sm:inline w-3.5 h-3.5 shrink-0" />
          <Hash className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{channelName}</span>
        </div>
        {onOpenAI && (
          <button
            onClick={onOpenAI}
            title="Study Circle AI"
            className="p-2 rounded-full text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
            aria-label="Open Study Circle AI"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}
        {onOpenInfo && (
          <button
            onClick={onOpenInfo}
            className="lg:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Channel info"
          >
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>

      <PinnedBar items={pinnedItems} onJump={jumpTo} onUnpin={(id) => pinMessage({ messageId: id, pinned: false })} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-1">
        {isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <Hash className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-[14px] font-bold text-slate-900 dark:text-white">
              Welcome to #{channelName}
            </p>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-1">
              This is the beginning of the channel. Say hello!
            </p>
          </div>
        ) : (
          <ChatMessageList
            messages={messages as ThreadMessage[]}
            currentUid={user?.uid}
            variant="channel"
            resolveSender={resolveSender}
            canEdit={(m) => m.senderId === user?.uid && !m.deleted}
            canDelete={(m) => (m.senderId === user?.uid || isAdmin) && !m.deleted}
            onReply={(m) => {
              setEditing(null);
              setReplyTo(m);
            }}
            onEdit={(m) => {
              setReplyTo(null);
              setEditing({ id: m.id, text: m.text });
              setDraft(m.text);
            }}
            onDelete={(m) => deleteMessage(m.id).catch(() => {})}
            onReact={(id, emoji) => react({ messageId: id, emoji }).catch(() => {})}
            onPin={(m) => pinMessage({ messageId: m.id, pinned: !m.pinned }).catch(() => {})}
          />
        )}
      </div>

      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onTyping={typing.notifyTyping}
        placeholder={`Message #${channelName}`}
        isSending={isSending}
        editing={!!editing}
        onCancelEdit={() => {
          setEditing(null);
          setDraft("");
        }}
        replyPreview={
          replyTo ? { name: resolveSender(replyTo.senderId).displayName, text: replyTo.text } : null
        }
        onCancelReply={() => setReplyTo(null)}
        atts={atts}
        typingUsers={typing.typingUsers}
      />
    </div>
  );
}
