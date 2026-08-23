import React, { useState } from "react";
import { X, Link2, QrCode, Shield, Mail, Check } from "lucide-react";
import { PeerAvatar } from "../social/PeerAvatar";
import type { StudyGroupMemberProfile } from "../../lib/api/studyGroups";

interface GroupParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  members: StudyGroupMemberProfile[];
  isAdmin: boolean;
  currentUserId?: string;
  onInvite?: (email: string) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
}

export function GroupParticipantsModal({
  isOpen,
  onClose,
  groupName,
  members,
  isAdmin,
  currentUserId,
  onInvite,
  onRemoveMember,
}: GroupParticipantsModalProps) {
  const [inviteInput, setInviteInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim() || isSending) return;
    setIsSending(true);
    try {
      if (onInvite) {
        await onInvite(inviteInput.trim());
      }
      setInviteInput("");
    } catch (err) {
      console.error("Invite error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/community?group=${encodeURIComponent(groupName)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06]">
          <div>
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">
              Group Participants
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-0.5">
              Showing members in <span className="font-medium text-slate-700 dark:text-gray-200">{groupName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invite Input Bar */}
        <div className="px-6 py-4 bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
          <form onSubmit={handleSendInvite} className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="Email, comma separated..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#1f1f23] border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b] dark:focus:ring-[#c8e558]/50"
              />
            </div>
            <button
              type="submit"
              disabled={!inviteInput.trim() || isSending}
              className="px-4 py-2 bg-[#8ba32b] dark:bg-[#c8e558] hover:opacity-90 disabled:opacity-50 text-white dark:text-slate-900 font-semibold text-[12.5px] rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
            >
              {isSending ? "Sending..." : "Send Invite"}
            </button>
          </form>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-2 flex items-center gap-1.5">
            <span>👤</span>
            <span>Will email them instruction and a link to join this study group</span>
          </p>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
            Members ({members.length})
          </div>

          {members.map((member) => {
            const isSelf = member.uid === currentUserId;
            const isMemberAdmin = member.role === "admin" || member.isOwner;

            return (
              <div
                key={member.uid}
                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PeerAvatar
                    name={member.displayName || "Student"}
                    photoURL={member.photoURL}
                    seed={member.uid}
                    className="w-10 h-10 text-[13px] font-bold"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-800 dark:text-gray-200 truncate">
                        {member.displayName || "Student"}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
                      {member.role ? `${member.role.charAt(0).toUpperCase() + member.role.slice(1)} • Joined group` : "Student"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isMemberAdmin ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8ba32b] dark:text-[#c8e558] bg-[#8ba32b]/10 dark:bg-[#c8e558]/15 px-2.5 py-1 rounded-lg">
                      <Shield className="w-3 h-3" />
                      Admin
                    </span>
                  ) : isAdmin && !isSelf ? (
                    <button
                      onClick={() => onRemoveMember && onRemoveMember(member.uid)}
                      className="text-[11.5px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.01] flex items-center justify-between text-[12.5px]">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" /> : <Link2 className="w-4 h-4 text-slate-400" />}
            <span>{copied ? "Link Copied!" : "Get private invite link"}</span>
          </button>

          <button
            onClick={() => setShowQr(!showQr)}
            className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-slate-400" />
            <span>Show QR Code</span>
          </button>
        </div>

        {/* QR Code expansion */}
        {showQr && (
          <div className="p-6 bg-white dark:bg-[#161619] border-t border-slate-100 dark:border-white/[0.06] flex flex-col items-center justify-center text-center animate-in fade-in duration-200">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-md">
              <QrCode className="w-32 h-32 text-slate-900" />
            </div>
            <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-3">
              Scan with mobile camera to instantly join <strong>{groupName}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
