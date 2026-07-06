import { useState, useEffect } from "react";
import {
  Users, Plus, BookOpen, Trophy, Calendar, Crown,
  UserPlus, X, Loader2, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { studyGroupsApi, StudyGroup } from "../lib/api/studyGroups";

const CARD_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-teal-500 to-emerald-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-cyan-500 to-teal-600",
  "from-fuchsia-500 to-pink-600",
  "from-lime-500 to-green-600",
];

const CARD_GLOW_COLORS = [
  "shadow-violet-500/20",
  "shadow-teal-500/20",
  "shadow-rose-500/20",
  "shadow-amber-500/20",
  "shadow-blue-500/20",
  "shadow-cyan-500/20",
  "shadow-fuchsia-500/20",
  "shadow-lime-500/20",
];

function getInitials(id: string): string {
  const names = ["AK", "RS", "PM", "NK", "ST", "VG", "DL", "JM"];
  const idx = Math.abs(id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % names.length;
  return names[idx];
}

function getAvatarColor(id: string): string {
  const colors = [
    "bg-violet-500", "bg-teal-500", "bg-rose-500", "bg-amber-500",
    "bg-blue-500", "bg-cyan-500", "bg-fuchsia-500", "bg-emerald-500",
  ];
  const idx = Math.abs(id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length;
  return colors[idx];
}

function formatDate(ts: number): string {
  if (!ts) return "Recently";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Group Card ────────────────────────────────────────────────────────
function GroupCard({ group, index }: { group: StudyGroup; index: number }) {
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const glow = CARD_GLOW_COLORS[index % CARD_GLOW_COLORS.length];
  const memberCount = group.members?.length || group.memberIds?.length || 0;
  const notebookCount = group.notebookIds?.length || 0;
  const challengeCount = group.weeklyChallenges?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4 }}
      className={`group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl ${glow} transition-shadow duration-300 cursor-pointer`}
    >
      {/* Gradient Header */}
      <div className={`h-2.5 bg-gradient-to-r ${gradient}`} />

      <div className="p-6">
        {/* Name & Owner Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {group.name}
            </h3>
          </div>
          <div className="flex-shrink-0 ml-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
              <Crown className="w-3 h-3" />
              Owner
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-5 leading-relaxed">
          {group.description || "No description provided."}
        </p>

        {/* Member Avatars */}
        <div className="flex items-center mb-5">
          <div className="flex -space-x-2">
            {(group.members?.slice(0, 4) || group.memberIds?.slice(0, 4) || []).map((m, i) => {
              const uid = typeof m === "string" ? m : m.userId;
              return (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full ${getAvatarColor(uid)} flex items-center justify-center text-white text-xs font-bold ring-2 ring-white dark:ring-slate-900`}
                >
                  {getInitials(uid)}
                </div>
              );
            })}
            {memberCount > 4 && (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-bold ring-2 ring-white dark:ring-slate-900">
                +{memberCount - 4}
              </div>
            )}
          </div>
          <span className="ml-3 text-xs text-slate-400 dark:text-slate-500">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{memberCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{notebookCount} notebook{notebookCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            <span>{challengeCount} challenge{challengeCount !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(group.createdAt)}</span>
          </div>
          <button className={`px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r ${gradient} opacity-90 hover:opacity-100 transition-opacity shadow-md`}>
            Open
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const group = await studyGroupsApi.createGroup(name.trim(), description.trim());
      onCreated(group);
      setName("");
      setDescription("");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
            className="relative w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[28px] p-8 shadow-2xl border border-slate-200/60 dark:border-slate-700/60"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/25">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create Study Group</h2>
                <p className="text-sm text-slate-500">Collaborate and learn with others</p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 rounded-xl text-sm text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            {/* Fields */}
            <div className="space-y-5 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., JEE Physics 2026 Batch"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your group's purpose, goals, and topics..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI features enabled for groups
              </span>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={creating || !name.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/25 transition-all"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {creating ? "Creating…" : "Create Group"}
                </button>
              </div>
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

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        {/* ── Header ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10"
        >
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
                <Users className="w-6 h-6" />
              </div>
              Study Groups
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 ml-[52px]">
              Collaborate &amp; Learn Together
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-full font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Group
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full font-medium text-sm hover:border-violet-500/50 dark:hover:border-violet-500/50 transition-colors shadow-sm">
              <UserPlus className="w-4 h-4" />
              Join Group
            </button>
          </div>
        </motion.div>

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-violet-500 mb-4" />
            <p className="text-sm text-slate-400">Loading your study groups…</p>
          </div>
        ) : groups.length === 0 ? (
          /* ── Empty State ──────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center py-24 px-8"
          >
            <div className="relative mb-8">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-500/10 dark:to-purple-500/10 flex items-center justify-center">
                <Users className="w-14 h-14 text-violet-400 dark:text-violet-500" />
              </div>
              <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-slate-900 dark:text-white">
              No Study Groups Yet
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-8 leading-relaxed">
              Create or join a study group to collaborate with peers, share notebooks,
              and tackle weekly challenges together.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-full font-semibold shadow-lg shadow-violet-500/25 transition-all"
            >
              <Plus className="w-5 h-5" />
              Create Your First Group
            </button>
          </motion.div>
        ) : (
          /* ── Group Grid ───────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group, i) => (
              <GroupCard key={group.id} group={group} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Create Modal ──────────────────────────────────────── */}
      <CreateGroupModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
