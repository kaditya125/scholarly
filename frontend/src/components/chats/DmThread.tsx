import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Info,
  Loader2,
  Lock,
  Phone,
  Video,
  Search,
  Image as ImageIcon,
  MoreVertical,
} from "lucide-react";
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
import { GroupCallModal } from "./GroupCallModal";

interface DmThreadProps {
  otherId: string;
  onBack?: () => void;
  onOpenInfo?: () => void;
}

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
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  const peerName = peer?.displayName || "Student";

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

          <div className="relative">
            <PeerAvatar
              name={peerName}
              photoURL={peer?.photoURL}
              seed={otherId}
              className="w-10 h-10 text-[13px] font-bold"
            />
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#141417]" />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate leading-tight">
              {peerName}
            </h3>
            <p className="text-[11.5px] text-slate-500 dark:text-gray-400 truncate flex items-center gap-1.5 mt-0.5">
              {isOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Online</span>
                </>
              ) : (
                <span>Peer Connection</span>
              )}
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
            title="Start Video Call"
          >
            <Video className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsCallModalOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Start Audio Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          {onOpenInfo && (
            <button
              onClick={onOpenInfo}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title="More info"
              aria-label="Conversation info"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <PinnedBar items={pinnedItems} onJump={jumpTo} onUnpin={(id) => pinMessage({ messageId: id, pinned: false })} />

      {/* Message Feed Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isError ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-[13.5px] font-semibold text-slate-700 dark:text-gray-200">
              You can only message your connections
            </p>
            <p className="text-[12px] text-slate-400 dark:text-gray-500 mt-1 max-w-xs">
              Send a connection request to start direct messaging with this peer.
            </p>
          </div>
        ) : isLoading && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <PeerAvatar name={peerName} photoURL={peer?.photoURL} seed={otherId} className="w-16 h-16 text-xl mb-3 shadow-sm" />
            <h4 className="text-[15px] font-bold text-slate-900 dark:text-white">{peerName}</h4>
            <p className="text-[12px] text-slate-400 dark:text-gray-500 mt-1 max-w-sm">
              This is the start of your direct conversation. Share doubts, compare notes, and collaborate on exams.
            </p>
          </div>
        ) : (
          <ChatMessageList
            messages={messages}
            currentUid={user?.uid}
            variant="dm"
            resolveSender={resolveSender}
            canEdit={(m) => m.senderId === user?.uid}
            canDelete={(m) => m.senderId === user?.uid}
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
            lastSeenMessageId={lastSeenMessageId}
            isPeerOnline={isOnline}
            peerLastReadAt={peerLastReadAt}
          />
        )}
      </div>

      {/* Message Composer */}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onTyping={typing.notifyTyping}
        placeholder={`Message ${peerName}…`}
        disabled={isError || !user?.uid}
        isSending={isSending}
        editing={!!editing}
        onCancelEdit={() => {
          setEditing(null);
          setDraft("");
        }}
        replyPreview={
          replyTo
            ? {
                name: replyTo.senderId === user?.uid ? "You" : peerName,
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
        title={peerName}
        subtitle="1:1 Study Consultation"
        isGroup={false}
      />
    </div>
  );
}
