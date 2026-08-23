import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Hash,
  Sparkles,
  Users,
  UserPlus,
  LogIn,
  Loader2,
  CheckCheck,
  Check,
  Edit3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useConversations, useUnreadCount } from "../../hooks/api/useDirectMessages";
import { useStudyGroups } from "../../hooks/api/useStudyGroups";
import { useGroupChannels } from "../../hooks/api/useGroupChannels";
import { useOnlineStatuses } from "../../hooks/usePresence";
import { PeerAvatar } from "../social/PeerAvatar";
import { CreateGroupModal } from "../study-groups/CreateGroupModal";
import type { StudyGroup } from "../../lib/api/studyGroups";
import type { ConversationSummary } from "../../lib/api/dm";
import { shortAgo } from "./format";

export interface ChatsSelection {
  kind: "dm" | "channel" | "ai" | null;
  dmUid?: string;
  groupId?: string;
  channelId?: string;
}

type Tab = "all" | "unread" | "channels" | "dms";

interface ChatsSidebarProps {
  selection: ChatsSelection;
  onSelectDm: (uid: string) => void;
  onSelectChannel: (groupId: string, channelId: string) => void;
  onOpenAssistant: (groupId: string) => void;
  className?: string;
}

function GroupAvatar({ name, className }: { name: string; className?: string }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold shrink-0 shadow-sm",
        className
      )}
    >
      {letter}
    </div>
  );
}

export function ChatsSidebar({
  selection,
  onSelectDm,
  onSelectChannel,
  onOpenAssistant,
  className,
}: ChatsSidebarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const { groups, joinByCode } = useStudyGroups();
  const unreadTotal = useUnreadCount();

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const onlineUids = useOnlineStatuses(conversations.map((c) => c.peer.uid));

  // Extract online users for the horizontal story avatar bar
  const onlinePeers = useMemo(() => {
    return conversations
      .filter((c) => onlineUids.has(c.peer.uid))
      .map((c) => c.peer);
  }, [conversations, onlineUids]);

  const q = search.trim().toLowerCase();

  const filteredConvs = useMemo(() => {
    let list = conversations;
    if (tab === "unread") list = list.filter((c) => c.unread > 0);
    if (q) list = list.filter((c) => c.peer.displayName.toLowerCase().includes(q));
    return list;
  }, [conversations, tab, q]);

  const filteredGroups = useMemo(
    () => (q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups),
    [groups, q]
  );

  const showDms = tab === "all" || tab === "unread" || tab === "dms";
  const showChannels = tab === "all" || tab === "channels";
  const activeGroupId = selection.groupId || groups[0]?.id;

  // Separate pinned conversations (first 2 groups or high unread chats)
  const pinnedGroups = useMemo(() => groups.slice(0, 2), [groups]);

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code || joining) return;
    setJoining(true);
    try {
      await joinByCode(code);
      setJoinCode("");
      setNewOpen(false);
    } catch {
      /* invalid code — leave the field so the user can retry */
    } finally {
      setJoining(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "channels", label: "Groups" },
    { id: "dms", label: "Direct" },
  ];

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-white dark:bg-[#131316] border-r border-slate-200/80 dark:border-white/5 font-sans overflow-hidden",
        className
      )}
    >
      {/* ── 1. Top Header: Messages + Compose Button ── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">
          Messages
        </h2>

        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer border border-slate-200/70 dark:border-white/10 shadow-2xs"
            aria-label="New message or study group"
          >
            <Edit3 className="w-4 h-4 text-slate-700 dark:text-slate-200" />
          </button>

          {newOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNewOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-60 z-40 rounded-2xl bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setNewOpen(false);
                    navigate("/people");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" /> Direct Message Peer
                </button>
                <button
                  onClick={() => {
                    setNewOpen(false);
                    setCreateOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" /> Create Study Group
                </button>
                <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                <div className="px-2.5 py-1.5">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                    Join with Invite Code
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                      placeholder="e.g. NEET26"
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12px] text-slate-900 dark:text-white outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={handleJoin}
                      disabled={!joinCode.trim() || joining}
                      className="shrink-0 w-7 h-7 rounded-lg bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                    >
                      {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Online Horizontal Story Avatars Strip ── */}
      <div className="shrink-0 px-5 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12.5px] font-bold text-slate-800 dark:text-gray-200">Online</span>
          <button
            onClick={() => navigate("/people")}
            className="text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
          >
            See All
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1.5 pt-0.5">
          {onlinePeers.length > 0 ? (
            onlinePeers.map((peer) => (
              <button
                key={peer.uid}
                onClick={() => onSelectDm(peer.uid)}
                className="flex flex-col items-center gap-1 shrink-0 group cursor-pointer focus:outline-none"
                title={peer.displayName}
              >
                <div className="relative p-0.5 rounded-full ring-2 ring-[#8ba32b] dark:ring-[#c8e558] group-hover:scale-105 transition-transform">
                  <PeerAvatar
                    name={peer.displayName}
                    photoURL={peer.photoURL}
                    seed={peer.uid}
                    className="w-10 h-10 text-[12px]"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131316]" />
                </div>
                <span className="text-[10.5px] font-medium text-slate-600 dark:text-gray-300 max-w-[48px] truncate">
                  {peer.displayName.split(" ")[0]}
                </span>
              </button>
            ))
          ) : (
            <div className="flex items-center gap-2 py-1 text-[11.5px] text-slate-400 dark:text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>You are connected and online</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Search Bar (Capsule with Icon) ── */}
      <div className="shrink-0 px-5 pt-1 pb-2">
        <div className="flex items-center gap-2 bg-slate-100/90 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/5 rounded-2xl px-3.5 py-2 focus-within:border-slate-400 dark:focus-within:border-white/20 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start of message"
            className="flex-1 bg-transparent outline-none text-[12.5px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[11px] font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Filter Tabs ── */}
      <div className="shrink-0 flex items-center gap-1.5 px-5 py-2 border-b border-slate-100 dark:border-white/5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium transition-all cursor-pointer",
              tab === t.id
                ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 font-bold shadow-2xs"
                : "text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            {t.label}
            {t.id === "unread" && unreadTotal > 0 && (
              <span
                className={cn(
                  "min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center",
                  tab === t.id
                    ? "bg-white/30 text-white dark:text-slate-900"
                    : "bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-900"
                )}
              >
                {unreadTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 5. Conversation Streams (Pinned & All) ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-4">
        {/* Pinned Message Section */}
        {pinnedGroups.length > 0 && !search && tab === "all" && (
          <div className="space-y-1.5">
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
              Pinned Message
            </div>

            {pinnedGroups.map((group) => {
              const isActive = selection.kind === "channel" && selection.groupId === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => {
                    onSelectChannel(group.id, "general");
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all cursor-pointer border",
                    isActive
                      ? "bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/30 shadow-xs"
                      : "bg-slate-50/60 dark:bg-white/[0.02] border-slate-100 dark:border-white/5 hover:bg-slate-100/70 dark:hover:bg-white/[0.05]"
                  )}
                >
                  <GroupAvatar name={group.name} className="w-10 h-10 text-[13px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">
                        {group.name}
                      </span>
                      <span className="text-[10.5px] font-medium text-slate-400 dark:text-gray-500 shrink-0">
                        12:00 PM
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[12px] text-slate-500 dark:text-gray-400 truncate">
                        {group.description || "Active study group discussion"}
                      </p>
                      <span className="min-w-[20px] h-[18px] px-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center shrink-0">
                        99+
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* All Message Section */}
        <div className="space-y-1">
          <div className="px-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 flex items-center justify-between">
            <span>All Message</span>
            <span className="text-[10.5px] lowercase font-normal text-slate-400">
              {filteredConvs.length + filteredGroups.length} chats
            </span>
          </div>

          {/* DMs List */}
          {showDms &&
            filteredConvs.map((conv) => {
              const active = selection.kind === "dm" && selection.dmUid === conv.peer.uid;
              const isOnline = onlineUids.has(conv.peer.uid);
              const mine = conv.lastMessage?.senderId === user?.uid;
              const preview = conv.lastMessage
                ? `${mine ? "You: " : ""}${conv.lastMessage.text || "Attachment"}`
                : "Start conversation...";

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectDm(conv.peer.uid)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer group",
                    active
                      ? "bg-slate-100 dark:bg-white/[0.08] shadow-2xs"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                  )}
                >
                  <div className="relative shrink-0">
                    <PeerAvatar
                      name={conv.peer.displayName}
                      photoURL={conv.peer.photoURL}
                      seed={conv.peer.uid}
                      className="w-10 h-10 text-[13px] font-semibold"
                    />
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131316]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-[13px] truncate",
                          conv.unread > 0
                            ? "font-bold text-slate-900 dark:text-white"
                            : "font-semibold text-slate-800 dark:text-gray-200"
                        )}
                      >
                        {conv.peer.displayName}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-[10.5px] text-slate-400 dark:text-gray-500 shrink-0">
                          {shortAgo(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {mine && (
                          <span className="shrink-0 text-emerald-500">
                            <CheckCheck className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <p
                          className={cn(
                            "text-[12px] truncate",
                            conv.unread > 0
                              ? "font-medium text-slate-700 dark:text-gray-200"
                              : "text-slate-400 dark:text-gray-500"
                          )}
                        >
                          {preview}
                        </p>
                      </div>

                      {conv.unread > 0 && (
                        <span className="shrink-0 min-w-[19px] h-[19px] px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center ml-2">
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

          {/* Group Channels List */}
          {showChannels &&
            filteredGroups.map((group) => {
              const isGroupActive = selection.kind === "channel" && selection.groupId === group.id;

              return (
                <GroupChannelTree
                  key={group.id}
                  group={group}
                  isGroupActive={isGroupActive}
                  selection={selection}
                  onSelectChannel={onSelectChannel}
                />
              );
            })}
        </div>
      </div>

      {/* ── 6. Bottom AI Assistant Card ── */}
      <div className="p-3 shrink-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
        <button
          onClick={() => activeGroupId && onOpenAssistant(activeGroupId)}
          disabled={!activeGroupId}
          title={activeGroupId ? "Open the Study Circle AI" : "Join or create a group to use the AI"}
          className={cn(
            "w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all border",
            selection.kind === "ai" && "ring-2 ring-[#8ba32b] dark:ring-[#c8e558]",
            activeGroupId
              ? "bg-white dark:bg-[#1a1a1e] border-slate-200/80 dark:border-white/10 hover:shadow-sm cursor-pointer"
              : "bg-slate-100/50 dark:bg-white/[0.02] border-transparent opacity-60 cursor-not-allowed"
          )}
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">
                Sadhya AI Tutor
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/20 dark:text-[#c8e558] uppercase">
                Active
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-gray-400 truncate">
              Ask doubts, explain solutions, summarize notes
            </p>
          </div>
        </button>
      </div>

      <CreateGroupModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(g) => {
          onSelectChannel(g.id, "general");
        }}
      />
    </div>
  );
}

function GroupChannelTree({
  group,
  isGroupActive,
  selection,
  onSelectChannel,
}: {
  group: StudyGroup;
  isGroupActive: boolean;
  selection: ChatsSelection;
  onSelectChannel: (groupId: string, channelId: string) => void;
}) {
  const { channels } = useGroupChannels(group.id);

  return (
    <div className="rounded-2xl overflow-hidden mb-1">
      <div
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-left transition-all",
          isGroupActive
            ? "bg-slate-100/80 dark:bg-white/[0.06]"
            : "hover:bg-slate-50 dark:hover:bg-white/[0.02]"
        )}
      >
        <GroupAvatar name={group.name} className="w-8 h-8 text-[11px]" />
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate block">
            {group.name}
          </span>
          <span className="text-[10.5px] text-slate-400 dark:text-gray-500">
            {group.members?.length || 1} members
          </span>
        </div>
      </div>

      {/* Sub channels */}
      <div className="ml-5 pl-3 border-l-2 border-slate-200/80 dark:border-white/10 space-y-0.5 my-1">
        {channels.map((c) => {
          const active = selection.kind === "channel" && selection.channelId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelectChannel(group.id, c.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer",
                active
                  ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] font-bold"
                  : "text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5"
              )}
            >
              <Hash className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="text-[12px] truncate flex-1">{c.name}</span>
              {c.unread && !active && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
