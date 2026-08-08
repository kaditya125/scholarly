import { useState } from "react";
import {
  Copy,
  Check,
  Sparkles,
  Crown,
  Shield,
  MoreHorizontal,
  UserMinus,
  ArrowUpCircle,
  ArrowDownCircle,
  LogOut,
  Trash2,
  Pencil,
  X,
  Loader2,
  UserPlus,
  KeyRound,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useOnlineStatuses } from "../../hooks/usePresence";
import { getAvatarColor, getInitials, formatDate } from "./utils";
import { PeerAvatar } from "../social/PeerAvatar";
import { InviteMembersModal } from "./InviteMembersModal";

interface GroupDetailsProps {
  groupId: string;
  onExit: () => void;
}

export function GroupDetails({ groupId, onExit }: GroupDetailsProps) {
  const { user } = useAuth();
  const {
    group,
    isLoading,
    isError,
    error,
    invite,
    updateGroup,
    removeMember,
    setRole,
    leaveGroup,
    deleteGroup,
  } = useStudyGroup(groupId);

  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const onlineMembers = useOnlineStatuses(group?.memberProfiles.map((m) => m.uid) || []);

  const notify = (m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    setMenuMemberId(null);
    try {
      await fn();
      if (okMsg) notify(okMsg);
    } catch (e: any) {
      notify(e?.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#131314]">
        <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-white dark:bg-[#131314]">
        <p className="text-[15px] font-bold text-slate-900 dark:text-white mb-1">Couldn't open this group</p>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-xs">
          {error?.response?.data?.error || "You may no longer be a member of this group."}
        </p>
      </div>
    );
  }

  const me = group.memberProfiles.find((m) => m.uid === user?.uid);
  const isOwner = !!me?.isOwner;
  const isAdmin = me?.role === "admin" || isOwner;

  const startEdit = () => {
    setEditName(group.name);
    setEditDesc(group.description || "");
    setEditSubject(group.subject || "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    await run(
      () => updateGroup({ name: editName.trim(), description: editDesc.trim(), subject: editSubject.trim() }),
      "Group updated"
    );
    setEditing(false);
  };

  const copyCode = () => {
    if (!group.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const onLeave = () => {
    const msg = isOwner
      ? "Leave this group? Ownership will pass to another member (or the group is deleted if you're the last one)."
      : "Leave this group?";
    if (!window.confirm(msg)) return;
    run(async () => {
      await leaveGroup();
      onExit();
    });
  };

  const onDelete = () => {
    if (!window.confirm(`Delete “${group.name}”? This permanently removes the group for all members.`)) return;
    run(async () => {
      await deleteGroup();
      onExit();
    });
  };

  const roleBadge = (m: { role: "admin" | "member"; isOwner: boolean }) => {
    if (m.isOwner)
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Crown className="w-3 h-3" /> Owner
        </span>
      );
    if (m.role === "admin")
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
          <Shield className="w-3 h-3" /> Admin
        </span>
      );
    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314] overflow-y-auto custom-scrollbar min-w-0">
      <div className="max-w-2xl w-full mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className={cn(
              "w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-white text-xl font-bold",
              getAvatarColor(group.id)
            )}
          >
            {getInitials(group.name)}
          </div>

          {editing ? (
            <div className="flex-1 min-w-0 space-y-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Group name"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold outline-none focus:border-violet-500"
              />
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Subject (optional)"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] outline-none focus:border-violet-500"
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-white leading-tight">
                  {group.name}
                </h2>
                {isAdmin && (
                  <button
                    onClick={startEdit}
                    title="Edit group"
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {group.subject && (
                  <span className="text-[11.5px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300">
                    {group.subject}
                  </span>
                )}
                <span className="text-[12.5px] text-slate-400 dark:text-gray-500">
                  {group.memberProfiles.length} member{group.memberProfiles.length === 1 ? "" : "s"} · created{" "}
                  {formatDate(group.createdAt)}
                </span>
              </div>
            </div>
          )}
        </div>

        {editing && (
          <div className="mb-6">
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Group description"
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] outline-none focus:border-violet-500 resize-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={busy || !editName.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        )}

        {/* Invite / share */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4 text-violet-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-slate-400 dark:text-gray-500">Invite code</p>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-2 text-[15px] font-bold tracking-wider text-slate-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  title="Copy invite code"
                >
                  {group.inviteCode || "———"}
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-bold hover:opacity-90 transition-opacity"
            >
              <UserPlus className="w-3.5 h-3.5" /> Invite
            </button>
          </div>
        </div>

        {/* About */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <h3 className="text-[13px] font-bold text-slate-900 dark:text-white uppercase tracking-wide">About</h3>
          </div>
          <p className="text-[13.5px] text-slate-600 dark:text-gray-300 leading-relaxed">
            {group.description || "No description yet. Admins can add one to explain the group's focus."}
          </p>
        </div>

        {/* Members */}
        <div className="mb-8">
          <h3 className="text-[13px] font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">
            Members · {group.memberProfiles.length}
          </h3>
          <div className="space-y-1">
            {group.memberProfiles.map((m) => {
              const canManage = isAdmin && m.uid !== user?.uid && !m.isOwner;
              return (
                <div
                  key={m.uid}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <PeerAvatar
                    name={m.displayName}
                    photoURL={m.photoURL}
                    seed={m.uid}
                    online={onlineMembers.has(m.uid)}
                    className="w-10 h-10 text-[12px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                        {m.displayName}
                        {m.uid === user?.uid && <span className="text-slate-400 font-normal"> (you)</span>}
                      </p>
                      {roleBadge(m)}
                    </div>
                    <p className="text-[11.5px] text-slate-400 dark:text-gray-500">Joined {formatDate(m.joinedAt)}</p>
                  </div>

                  {canManage && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setMenuMemberId(menuMemberId === m.uid ? null : m.uid)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        aria-label="Manage member"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuMemberId === m.uid && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuMemberId(null)} />
                          <div className="absolute right-0 top-8 z-20 w-44 rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 shadow-xl py-1 text-[13px]">
                            {m.role === "member" ? (
                              <button
                                onClick={() => run(() => setRole({ memberId: m.uid, role: "admin" }), "Promoted to admin")}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                              >
                                <ArrowUpCircle className="w-3.5 h-3.5" /> Make admin
                              </button>
                            ) : (
                              <button
                                onClick={() => run(() => setRole({ memberId: m.uid, role: "member" }), "Changed to member")}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                              >
                                <ArrowDownCircle className="w-3.5 h-3.5" /> Remove admin
                              </button>
                            )}
                            <button
                              onClick={() => run(() => removeMember(m.uid), `${m.displayName} removed`)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <UserMinus className="w-3.5 h-3.5" /> Remove
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-slate-100 dark:border-white/5 pt-5 flex items-center gap-3">
          <button
            onClick={onLeave}
            disabled={busy}
            className="flex items-center gap-2 px-4 h-9 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-200 text-[12.5px] font-bold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" /> Leave group
          </button>
          {isOwner && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="flex items-center gap-2 px-4 h-9 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[12.5px] font-bold hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete group
            </button>
          )}
        </div>
      </div>

      {showInvite && (
        <InviteMembersModal
          existingMemberIds={group.memberIds}
          onInvite={(ids) => invite(ids)}
          onClose={() => setShowInvite(false)}
        />
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
