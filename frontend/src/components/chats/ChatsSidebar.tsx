import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Hash,
  ChevronRight,
  Sparkles,
  Users,
  UserPlus,
  LogIn,
  Loader2,
  X,
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
        "rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0",
        className
      )}
    >
      {letter}
    </div>
  );
}

function DmRow({
  conv,
  active,
  online,
  onSelect,
}: {
  conv: ConversationSummary;
  active: boolean;
  online: boolean;
  onSelect: () => void;
}) {
  const { user } = useAuth();
  const mine = conv.lastMessage?.senderId === user?.uid;
  const preview = conv.lastMessage
    ? `${mine ? "You: " : ""}${conv.lastMessage.text || "Attachment"}`
    : "No messages yet";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors",
        active ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"
      )}
    >
      <PeerAvatar
        name={conv.peer.displayName}
        photoURL={conv.peer.photoURL}
        seed={conv.peer.uid}
        online={online}
        className="w-9 h-9 text-[12px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[13px] truncate flex-1",
              conv.unread > 0
                ? "font-bold text-slate-900 dark:text-white"
                : "font-medium text-slate-700 dark:text-gray-300"
            )}
          >
            {conv.peer.displayName}
          </span>
          {conv.lastMessage && (
            <span className="text-[10.5px] text-slate-400 shrink-0">{shortAgo(conv.lastMessage.createdAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[12px] truncate flex-1",
              conv.unread > 0 ? "text-slate-600 dark:text-gray-300" : "text-slate-400 dark:text-gray-500"
            )}
          >
            {preview}
          </span>
          {conv.unread > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function GroupRow({
  group,
  expanded,
  onToggle,
  selection,
  onSelectChannel,
}: {
  group: StudyGroup;
  expanded: boolean;
  onToggle: () => void;
  selection: ChatsSelection;
  onSelectChannel: (groupId: string, channelId: string) => void;
}) {
  const { channels } = useGroupChannels(expanded ? group.id : undefined);
  const isActiveGroup = selection.kind === "channel" && selection.groupId === group.id;

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        )}
      >
        <ChevronRight
          className={cn("w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform", expanded && "rotate-90")}
        />
        <GroupAvatar name={group.name} className="w-6 h-6 text-[11px]" />
        <span
          className={cn(
            "text-[13px] font-semibold truncate flex-1",
            isActiveGroup ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-gray-200"
          )}
        >
          {group.name}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 pl-2 border-l border-slate-200 dark:border-white/10 space-y-0.5 mt-0.5 mb-1">
          {channels.length === 0 ? (
            <div className="px-2 py-1 text-[11.5px] text-slate-400 dark:text-gray-600">Loading channels…</div>
          ) : (
            channels.map((c) => {
              const active = selection.kind === "channel" && selection.channelId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectChannel(group.id, c.id)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors",
                    active
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-gray-400"
                  )}
                >
                  <Hash className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span
                    className={cn(
                      "text-[12.5px] truncate flex-1",
                      c.unread && !active && "font-bold text-slate-900 dark:text-white"
                    )}
                  >
                    {c.name}
                  </span>
                  {c.unread && !active && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The unified conversation rail: search, Unread/Channels/DMs filters, a Direct Messages list with
 * presence + unread, an expandable Groups→Channels tree, and the AI Assistant entry that opens the
 * Study Circle for the active group. Also hosts the New-group / Join-by-code / Find-people actions
 * so nothing from the old Study Groups page is lost.
 */
export function ChatsSidebar({
  selection,
  onSelectDm,
  onSelectChannel,
  onOpenAssistant,
  className,
}: ChatsSidebarProps) {
  const navigate = useNavigate();
  const { conversations } = useConversations();
  const { groups, joinByCode } = useStudyGroups();
  const unreadTotal = useUnreadCount();

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const online = useOnlineStatuses(conversations.map((c) => c.peer.uid));

  // Keep the active group expanded.
  useEffect(() => {
    if (selection.kind === "channel" && selection.groupId) {
      const gid = selection.groupId;
      setExpanded((e) => (e[gid] ? e : { ...e, [gid]: true }));
    }
  }, [selection.kind, selection.groupId]);

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
    { id: "channels", label: "Channels" },
    { id: "dms", label: "DMs" },
  ];

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-white/5",
        className
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-100 dark:border-white/5">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Messages</h2>
        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
            aria-label="New conversation or group"
          >
            <Plus className="w-4 h-4" />
          </button>
          {newOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNewOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 z-40 rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl p-1.5">
                <button
                  onClick={() => {
                    setNewOpen(false);
                    navigate("/people");
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <UserPlus className="w-4 h-4 text-slate-400" /> Message someone
                </button>
                <button
                  onClick={() => {
                    setNewOpen(false);
                    setCreateOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <Users className="w-4 h-4 text-slate-400" /> New study group
                </button>
                <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                <div className="px-2 py-1">
                  <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Join with a code</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                      placeholder="Invite code"
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2 py-1.5 text-[12.5px] outline-none focus:border-indigo-400"
                    />
                    <button
                      onClick={handleJoin}
                      disabled={!joinCode.trim() || joining}
                      className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40"
                      aria-label="Join group"
                    >
                      {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent outline-none text-[13px] text-slate-700 dark:text-gray-200 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 h-7 rounded-full text-[12px] font-semibold transition-colors",
              tab === t.id
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10"
            )}
          >
            {t.label}
            {t.id === "unread" && unreadTotal > 0 && (
              <span
                className={cn(
                  "min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                  tab === t.id ? "bg-white/20" : "bg-indigo-600 text-white"
                )}
              >
                {unreadTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
        {showDms && (
          <div className="mb-2">
            <p className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">
              Personal Messages
            </p>
            {filteredConvs.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-slate-400 dark:text-gray-600">
                {tab === "unread" ? "No unread messages." : "No conversations yet."}
              </p>
            ) : (
              filteredConvs.map((conv) => (
                <DmRow
                  key={conv.id}
                  conv={conv}
                  active={selection.kind === "dm" && selection.dmUid === conv.peer.uid}
                  online={online.has(conv.peer.uid)}
                  onSelect={() => onSelectDm(conv.peer.uid)}
                />
              ))
            )}
          </div>
        )}

        {showChannels && (
          <div>
            <p className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">
              Channels
            </p>
            {filteredGroups.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-slate-400 dark:text-gray-600">
                {q ? "No groups match." : "No study groups yet."}
              </p>
            ) : (
              filteredGroups.map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  expanded={!!expanded[group.id] || !!q}
                  onToggle={() => setExpanded((e) => ({ ...e, [group.id]: !e[group.id] }))}
                  selection={selection}
                  onSelectChannel={onSelectChannel}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* AI Assistant */}
      <button
        onClick={() => activeGroupId && onOpenAssistant(activeGroupId)}
        disabled={!activeGroupId}
        title={activeGroupId ? "Open the Study Circle AI" : "Join or create a group to use the AI"}
        className={cn(
          "shrink-0 m-2 flex items-center gap-3 p-3 rounded-xl text-left transition-colors",
          selection.kind === "ai" && "ring-1 ring-violet-400 dark:ring-violet-500/50",
          activeGroupId
            ? "bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-200 dark:border-violet-500/20 hover:from-violet-500/15 hover:to-indigo-500/15"
            : "bg-slate-50 dark:bg-white/5 opacity-60 cursor-not-allowed"
        )}
      >
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-slate-900 dark:text-white">AI Assistant</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 uppercase tracking-wider">
              Beta
            </span>
          </div>
          <p className="text-[11.5px] text-slate-500 dark:text-gray-400 truncate">
            Summarize chats, find info, write better.
          </p>
        </div>
      </button>

      <CreateGroupModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(g) => {
          setExpanded((e) => ({ ...e, [g.id]: true }));
        }}
      />
    </div>
  );
}
