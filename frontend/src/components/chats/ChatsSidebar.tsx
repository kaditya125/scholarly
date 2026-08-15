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
        "flex flex-col h-full bg-white dark:bg-[#111113] border-r border-slate-200/80 dark:border-white/5 font-sans",
        className
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 h-13 border-b border-slate-100 dark:border-white/5">
        <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">Messages</h2>
        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="New conversation or group"
          >
            <Plus className="w-4 h-4" />
          </button>
          {newOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNewOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-56 z-40 rounded-2xl bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 shadow-2xl p-1.5 space-y-0.5">
                <button
                  onClick={() => {
                    setNewOpen(false);
                    navigate("/people");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-slate-400" /> Message someone
                </button>
                <button
                  onClick={() => {
                    setNewOpen(false);
                    setCreateOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4 text-slate-400" /> New study group
                </button>
                <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                <div className="px-2.5 py-1.5">
                  <p className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Join with a code</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                      placeholder="Invite code"
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12px] outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={handleJoin}
                      disabled={!joinCode.trim() || joining}
                      className="shrink-0 w-7 h-7 rounded-lg bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      aria-label="Join group"
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

      {/* Minimalist Search Capsule */}
      <div className="shrink-0 px-3 pt-2.5">
        <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-white/[0.04] border border-transparent dark:border-white/5 rounded-full px-3 py-1.5 focus-within:border-slate-300 dark:focus-within:border-white/15 transition-all shadow-2xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 bg-transparent outline-none text-[12px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[11px] font-bold">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer",
              tab === t.id
                ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 font-semibold shadow-2xs"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            {t.label}
            {t.id === "unread" && unreadTotal > 0 && (
              <span
                className={cn(
                  "min-w-[15px] h-3.5 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center",
                  tab === t.id ? "bg-white/30 text-white dark:text-slate-900" : "bg-[#8ba32b] dark:bg-[#c8e558] text-white dark:text-slate-900"
                )}
              >
                {unreadTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3 space-y-3">
        {showDms && (
          <div>
            <div className="flex items-center justify-between px-2 pt-1 pb-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Personal Messages
              </span>
              <button 
                onClick={() => navigate("/people")}
                className="text-[10px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
              >
                Find Peers
              </button>
            </div>

            {filteredConvs.length === 0 ? (
              <div className="px-2 py-3 text-center rounded-xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 my-1">
                <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                  {tab === "unread" ? "No unread messages." : "No conversations yet."}
                </p>
              </div>
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
            <div className="flex items-center justify-between px-2 pt-1 pb-1">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Study Group Channels
              </span>
              <button 
                onClick={() => setCreateOpen(true)}
                className="text-[10px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
              >
                + New
              </button>
            </div>

            {filteredGroups.length === 0 ? (
              <div className="px-2 py-3 text-center rounded-xl bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 my-1">
                <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                  {q ? "No groups match." : "No study groups joined."}
                </p>
              </div>
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

      {/* AI Assistant Card */}
      <div className="p-2 shrink-0 border-t border-slate-100 dark:border-white/5">
        <button
          onClick={() => activeGroupId && onOpenAssistant(activeGroupId)}
          disabled={!activeGroupId}
          title={activeGroupId ? "Open the Study Circle AI" : "Join or create a group to use the AI"}
          className={cn(
            "w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all border",
            selection.kind === "ai" && "ring-1 ring-[#8ba32b] dark:ring-[#c8e558]",
            activeGroupId
              ? "bg-slate-50 dark:bg-white/[0.03] border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              : "bg-slate-50/50 dark:bg-white/[0.02] border-transparent opacity-60 cursor-not-allowed"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-900 dark:text-white">AI Assistant</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] uppercase tracking-wider">
                BETA
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
              Summarize chats, find info, write better.
            </p>
          </div>
        </button>
      </div>

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
