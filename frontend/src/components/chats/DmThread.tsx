import React, { useMemo, useState } from "react";
import { ArrowLeft, Info, Loader2, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useConversation } from "../../hooks/api/useDirectMessages";
import { useOnlineStatuses } from "../../hooks/usePresence";
import { useTyping } from "../../hooks/useTyping";
import { useAttachments } from "../../hooks/useAttachments";
import { useSavedMessages } from "../../hooks/api/useSavedMessages";
import { PeerAvatar } from "../social/PeerAvatar";
import { PinnedBar } from "../social/PinnedBar";
import { ChatMessageList, ThreadMessage } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";

interface DmThreadProps {
  otherId: string;
  onBack?: () => void;
  onOpenInfo?: () => void;
}

/** The center pane for a direct message: header, pinned bar, message list, and composer. */
export function DmThread({ otherId, onBack, onOpenInfo }: DmThreadProps) {
  const { user } = useAuth();
  const { toggleSave, isSaved } = useSavedMessages();
  const {
    messages,
    peer,
    peerLastReadAt,
    pinnedMessages,
    isLoading,
    isError,
    send,
    isSending,
    react,
    editMessage,
    deleteMessage,
    pinMessage,
  } = useConversation(otherId);

  const onlineSet = useOnlineStatuses([otherId]);
  const isOnline = onlineSet.has(otherId);

  const convId = user?.uid ? [user.uid, otherId].sort().join("__") : null;
  const typing = useTyping(convId ? ["dmConversations", convId] : null);
  const atts = useAttachments();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const peerName = peer?.displayName || "Conversation";

  const resolveSender = (uid: string) =>
    uid === user?.uid
      ? { displayName: "You", photoURL: user?.photoURL || undefined }
      : { displayName: peer?.displayName || "User", photoURL: peer?.photoURL };

  const lastSeenMessageId = useMemo(() => {
    if (!peerLastReadAt || !user?.uid) return null;
    let id: string | null = null;
    for (const m of messages) {
      if (m.senderId === user.uid && m.createdAt <= peerLastReadAt) id = m.id;
    }
    return id;
  }, [messages, peerLastReadAt, user?.uid]);

  const pinnedItems = useMemo(
    () =>
      pinnedMessages.map((m) => ({
        id: m.id,
        senderName: m.senderId === user?.uid ? "You" : peerName,
        text: m.text || "Attachment",
      })),
    [pinnedMessages, user?.uid, peerName]
  );

  const jumpTo = (id: string) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSaveMessage = (m: ThreadMessage) => {
    const sender = resolveSender(m.senderId);
    toggleSave({
      messageId: m.id,
      sourceType: "dm",
      conversationId: convId || undefined,
      peerUid: otherId,
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
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#131314]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-slate-100 dark:border-slate-800/60">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <PeerAvatar
          name={peerName}
          photoURL={peer?.photoURL}
          seed={otherId}
          online={isOnline}
          className="w-9 h-9 text-[12px]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate leading-tight">
            {peerName}
          </p>
          <p className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
            {isOnline ? "Online" : "Direct message"}
          </p>
        </div>
        {onOpenInfo && (
          <button
            onClick={onOpenInfo}
            className="lg:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Conversation info"
          >
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>

      <PinnedBar items={pinnedItems} onJump={jumpTo} onUnpin={(id) => pinMessage({ messageId: id, pinned: false })} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-1">
        {isError ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-[13.5px] font-semibold text-slate-700 dark:text-gray-200">
              You can only message your connections
            </p>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-1">
              Connect with {peerName} to start a conversation.
            </p>
          </div>
        ) : isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <PeerAvatar name={peerName} photoURL={peer?.photoURL} seed={otherId} className="w-16 h-16 text-xl mb-3" />
            <p className="text-[14px] font-bold text-slate-900 dark:text-white">{peerName}</p>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-1">
              This is the start of your conversation.
            </p>
          </div>
        ) : (
          <ChatMessageList
            messages={messages as ThreadMessage[]}
            currentUid={user?.uid}
            variant="dm"
            resolveSender={resolveSender}
            canEdit={(m) => m.senderId === user?.uid && !m.deleted}
            canDelete={(m) => m.senderId === user?.uid && !m.deleted}
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
            onSave={handleSaveMessage}
            isSaved={isSaved}
            isPeerOnline={isOnline}
            peerLastReadAt={peerLastReadAt}
            lastSeenMessageId={lastSeenMessageId}
          />
        )}
      </div>

      {!isError && (
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onTyping={typing.notifyTyping}
          placeholder={`Message ${peerName}`}
          isSending={isSending}
          editing={!!editing}
          onCancelEdit={() => {
            setEditing(null);
            setDraft("");
          }}
          replyPreview={
            replyTo
              ? { name: replyTo.senderId === user?.uid ? "You" : peerName, text: replyTo.text }
              : null
          }
          onCancelReply={() => setReplyTo(null)}
          atts={atts}
          typingUsers={typing.typingUsers}
        />
      )}
    </div>
  );
}
