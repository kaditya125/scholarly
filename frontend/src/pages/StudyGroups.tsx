import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  BookOpen,
  Trophy,
  Calendar,
  Crown,
  UserPlus,
  X,
  Loader2,
  Sparkles,
  KeyRound,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { studyGroupsApi, StudyGroup } from "../lib/api/studyGroups";
import { PeerAvatar } from "../components/social/PeerAvatar";
import { cn } from "../lib/utils";

const SUBJECT_OPTIONS = [
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "History",
  "Geography",
  "Reasoning",
  "General Studies",
  "NEET Prep",
  "JEE Batch",
  "BPSC & UPSC",
];

function formatDate(ts: number | string): string {
  if (!ts) return "Recently";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Group Card ────────────────────────────────────────────────────────
function GroupCard({ group, index }: { group: StudyGroup; index: number }) {
  const navigate = useNavigate();
  const memberCount = group.members?.length || group.memberIds?.length || 0;
  const notebookCount = group.notebookIds?.length || 0;
  const challengeCount = group.weeklyChallenges?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      whileHover={{ y: -3 }}
      onClick={() => navigate(`/community?tab=chats&g=${group.id}`)}
      className="group relative bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Header: Name + Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            {group.subject && (
              <span className="inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#8ba32b]/10 text-[#8ba32b] dark:bg-[#c8e558]/10 dark:text-[#c8e558] mb-1.5 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                {group.subject}
              </span>
            )}
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white truncate group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors">
              {group.name}
            </h3>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            <Crown className="w-3 h-3 text-amber-500" />
            Group
          </span>
        </div>

        {/* Description */}
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed">
          {group.description || "Active peer study circle for collaborative notes and test discussions."}
        </p>

        {/* Member Avatars Stack */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex -space-x-2 overflow-hidden items-center py-0.5">
            {(group.members?.slice(0, 4) || group.memberIds?.slice(0, 4) || []).map((m, i) => {
              const uid = typeof m === "string" ? m : m.userId;
              return (
                <div
                  key={i}
                  className="relative ring-2 ring-white dark:ring-[#141416] rounded-full overflow-hidden shrink-0 shadow-xs"
                >
                  <PeerAvatar seed={uid} className="w-6 h-6 text-[9.5px]" />
                </div>
              );
            })}
            {memberCount > 4 && (
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 ring-2 ring-white dark:ring-[#141416] text-[9px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                +{memberCount - 4}
              </span>
            )}
          </div>
          <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
      </div>

      <div>
        {/* Quick Stats */}
        <div className="flex items-center gap-3 text-[11.5px] text-slate-400 dark:text-slate-500 mb-3.5 pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{notebookCount} notes</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            <span>{challengeCount} challenges</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(group.createdAt)}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/community?tab=chats&g=${group.id}`);
            }}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 hover:opacity-90 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <span>Open</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Create Group Modal ────────────────────────────────────────────────
function CreateGroupModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (g: StudyGroup) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const group = await studyGroupsApi.createGroup(name.trim(), description.trim(), subject);
      onCreated(group);
      setName("");
      setDescription("");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create study group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-white dark:bg-[#141416] rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 font-sans"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Create Study Group</h2>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Collaborate with peers, share notes and quiz challenges</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 rounded-xl text-[12.5px] text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. NEET 2026 Biology Circle"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Subject / Stream
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your study group goals, study timings, and guidelines..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[12.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
              <span className="text-[11.5px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                Circle AI Assistant enabled
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-full text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={creating || !name.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-50 text-[12px] font-semibold rounded-full shadow-xs hover:opacity-90 transition-all cursor-pointer active:scale-98"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{creating ? "Creating…" : "Create Group"}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Join Group Modal ──────────────────────────────────────────────────
function JoinGroupModal({
  isOpen,
  onClose,
  onJoined,
}: {
  isOpen: boolean;
  onClose: () => void;
  onJoined: (g: StudyGroup) => void;
}) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!code.trim()) return;
    setJoining(true);
    setError("");
    try {
      const group = await studyGroupsApi.join(code.trim());
      onJoined(group);
      setCode("");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid invite code or group not found.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md bg-white dark:bg-[#141416] rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 font-sans"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Join Study Group</h2>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Enter a 6-character group invite code</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 rounded-xl text-[12.5px] text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. GRP123"
                  maxLength={10}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[15px] font-mono tracking-wider font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all text-center uppercase"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleJoin}
                disabled={joining || !code.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-50 text-[12px] font-semibold rounded-full shadow-xs hover:opacity-90 transition-all cursor-pointer active:scale-98"
              >
                {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                <span>{joining ? "Joining…" : "Join Group"}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────
export default function StudyGroups() {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    studyGroupsApi
      .getGroups()
      .then((g) => {
        setGroups(g);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleGroupCreated = (newGroup: StudyGroup) => {
    setGroups((prev) => [newGroup, ...prev]);
  };

  const handleGroupJoined = (joinedGroup: StudyGroup) => {
    setGroups((prev) => {
      if (prev.some((g) => g.id === joinedGroup.id)) return prev;
      return [joinedGroup, ...prev];
    });
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#fafbfc] dark:bg-[#131315] text-slate-900 dark:text-white font-sans transition-colors">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <Users className="w-4.5 h-4.5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Study Groups
              </h1>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Collaborate &amp; Learn Together • Study circles, shared notes &amp; weekly challenges
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowJoin(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-full font-semibold text-[12px] hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Join with Code</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-full font-semibold text-[12px] hover:opacity-90 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Group</span>
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-[#8ba32b] dark:text-[#c8e558] mb-3" />
            <p className="text-[13px] text-slate-400">Loading study groups…</p>
          </div>
        ) : groups.length === 0 ? (
          /* ── Empty State ──────────────────────────────────── */
          <div className="flex flex-col items-center justify-center text-center py-16 px-4">
            <div className="max-w-md w-full p-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#141416] shadow-2xs space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mx-auto border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                <Users className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">
                  No Study Groups Yet
                </h2>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Create or join a study group to collaborate with peers, share notebooks,
                  and tackle weekly challenges together.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-full text-[12px] font-semibold hover:opacity-90 transition-all shadow-xs cursor-pointer active:scale-98"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Your First Group</span>
                </button>
                <button
                  onClick={() => setShowJoin(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-full text-[12px] font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-2xs cursor-pointer active:scale-98"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Join with Code</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Group Grid ───────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((group, i) => (
              <GroupCard key={group.id} group={group} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}
      <CreateGroupModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleGroupCreated}
      />
      <JoinGroupModal
        isOpen={showJoin}
        onClose={() => setShowJoin(false)}
        onJoined={handleGroupJoined}
      />
    </div>
  );
}
