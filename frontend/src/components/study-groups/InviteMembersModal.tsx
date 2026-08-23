import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, Loader2, UserPlus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { sendRealNotification } from "../../lib/api/realtimeNotifications";
import { useConnections } from "../../hooks/api/useConnections";
import { PeerAvatar } from "../social/PeerAvatar";

interface InviteMembersModalProps {
  existingMemberIds: string[];
  onInvite: (targetIds: string[]) => Promise<unknown>;
  onClose: () => void;
}

/** Pick connections to add to a group. Only accepted connections not already in the group show up. */
export function InviteMembersModal({ existingMemberIds, onInvite, onClose }: InviteMembersModalProps) {
  const navigate = useNavigate();
  const { connections, isLoading } = useConnections();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  const candidates = useMemo(
    () => connections.filter((c) => !existingMemberIds.includes(c.uid)),
    [connections, existingMemberIds]
  );

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const { user } = useAuth();
  const submit = async () => {
    if (selected.size === 0) return;
    setInviting(true);
    try {
      await onInvite([...selected]);
      // Dispatch live invitation notifications to all selected peers
      selected.forEach((peerId) => {
        sendRealNotification({
          userId: peerId,
          type: "study_group_invitation",
          category: "social",
          title: `${user?.displayName || "A classmate"} invited you to join a Study Circle! 👥`,
          body: `Join to collaborate on shared mock tests, active chat discussions, and revision flashcards.`,
          avatar: user?.photoURL || undefined,
          actions: ["Join", "Later"],
          actionUrl: "/community?tab=chats",
          priority: "medium",
        }).catch(() => {});
      });
      onClose();
    } catch {
      setInviting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh]"
        >
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-500 text-white">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Invite connections</h2>
                <p className="text-[12px] text-slate-500">Add people you're connected with</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-[180px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-[13px] font-semibold text-slate-700 dark:text-gray-200 mb-1">
                  {connections.length === 0 ? "No connections yet" : "Everyone's already here"}
                </p>
                <p className="text-[12px] text-slate-500 dark:text-gray-400 mb-4">
                  {connections.length === 0
                    ? "Connect with people to invite them to your groups."
                    : "All your connections are already members of this group."}
                </p>
                {connections.length === 0 && (
                  <button
                    onClick={() => {
                      onClose();
                      navigate("/people");
                    }}
                    className="text-[12.5px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Find people
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {candidates.map((c) => {
                  const checked = selected.has(c.uid);
                  return (
                    <button
                      key={c.uid}
                      onClick={() => toggle(c.uid)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <PeerAvatar
                        name={c.displayName}
                        photoURL={c.photoURL}
                        seed={c.uid}
                        className="w-10 h-10 text-[12px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                          {c.displayName}
                        </p>
                        {c.goal && (
                          <p className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">{c.goal}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                          checked
                            ? "bg-violet-600 border-violet-600 text-white"
                            : "border-slate-300 dark:border-white/20"
                        )}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[12.5px] text-slate-500">
              {selected.size > 0 ? `${selected.size} selected` : "Select people to invite"}
            </span>
            <button
              onClick={submit}
              disabled={selected.size === 0 || inviting}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-semibold transition-colors"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Invite
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
