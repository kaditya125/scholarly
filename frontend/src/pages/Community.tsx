import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Hash,
  ChevronDown,
  MessageSquare,
  ThumbsUp,
  Eye,
  Send,
  Loader2,
  CheckCircle2,
  Lock,
  Star,
  TrendingUp,
  Users,
  X,
  Award,
  MessagesSquare,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { useStudyGroups } from "../hooks/api/useStudyGroups";
import {
  useDiscussions,
  useDiscussion,
  useTrending,
  useContributors,
} from "../hooks/api/useCommunity";
import { PeerAvatar } from "../components/social/PeerAvatar";
import { shortAgo } from "../components/chats/format";
import Chats from "./Chats";
import People from "./People";
import type {
  CommunityDiscussion,
  DiscussionStatus,
} from "../lib/api/discussions";

const DEFAULT_CURRICULUM_TOPICS = [
  "NEET",
  "JEE",
  "UPSC",
  "BPSC",
  "Physics",
  "Chemistry",
  "Biology",
  "Mathematics",
  "General",
  "Exam Strategy",
  "Doubt Clearing",
];

const STATUS_META: Record<DiscussionStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  resolved: { label: "Resolved", cls: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-gray-400" },
};

/** Inline "Start a post" composer that expands into title / body / topic / tags. */
function StartPost({
  onCreate,
  isCreating,
  availableTopics = DEFAULT_CURRICULUM_TOPICS,
}: {
  onCreate: (input: { topic: string; title: string; description: string; tags?: string[] }) => Promise<unknown>;
  isCreating: boolean;
  availableTopics?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState(availableTopics[0] || "General");
  const [customTopic, setCustomTopic] = useState("");
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [tags, setTags] = useState("");

  const submit = async () => {
    if (!title.trim() && !description.trim()) return;
    const finalTopic = isCustomTopic && customTopic.trim() ? customTopic.trim() : topic;
    try {
      await onCreate({
        topic: finalTopic,
        title: title.trim(),
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setTitle("");
      setDescription("");
      setTags("");
      setCustomTopic("");
      setIsCustomTopic(false);
      setTopic(availableTopics[0] || "General");
      setOpen(false);
    } catch {
      /* keep draft */
    }
  };

  return (
    <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 p-3 shadow-2xs transition-all font-sans">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-100/70 dark:bg-white/[0.04] border border-transparent dark:border-white/5 text-slate-500 dark:text-slate-400 text-[12.5px] hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-2xs"
        >
          <Plus className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
          <span>Start a discussion, ask a doubt, or share study notes...</span>
        </button>
      ) : (
        <div className="space-y-3 p-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Discussion title (e.g., Organic Chemistry Reaction Mechanisms)..."
            className="w-full bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[13px] font-semibold text-slate-900 dark:text-white outline-none focus:border-slate-400 dark:focus:border-white/20"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Share details, problem context, formulas or questions..."
            className="w-full bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[12.5px] text-slate-800 dark:text-slate-200 outline-none focus:border-slate-400 dark:focus:border-white/20 resize-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            {!isCustomTopic ? (
              <div className="flex items-center gap-1.5">
                <select
                  value={topic}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomTopic(true);
                    } else {
                      setTopic(e.target.value);
                    }
                  }}
                  className="bg-slate-50 dark:bg-[#1c1c1f] rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                >
                  {availableTopics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Subject / Exam</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Enter topic name..."
                  className="bg-slate-50 dark:bg-[#1c1c1f] rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-900 dark:text-white outline-none w-36"
                />
                <button
                  type="button"
                  onClick={() => setIsCustomTopic(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-1"
                >
                  Cancel
                </button>
              </div>
            )}

            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma separated e.g. neet, zoology)..."
              className="flex-1 min-w-40 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11.5px] text-slate-700 dark:text-slate-300 outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <button
              onClick={() => setOpen(false)}
              className="px-3.5 py-1.5 rounded-full text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={isCreating || (!title.trim() && !description.trim())}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-40 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Post Discussion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscussionCard({
  discussion: d,
  onVote,
}: {
  discussion: CommunityDiscussion;
  onVote: (id: string) => void;
}) {
  const { user } = useAuth();
  const currentUid = user?.uid;
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const {
    discussion: full,
    responses: fullResponses,
    isResponding,
    respond,
    setStatus,
    setBest,
  } = useDiscussion(expanded ? d.id : undefined);

  const author = d.author || { displayName: "Learner", uid: "" };
  const responses = fullResponses || [];
  const status = full?.status || d.status || "active";
  const isAuthor = currentUid && author.uid === currentUid;
  const statusMeta = STATUS_META[status] || STATUS_META.active;
  const tagList = Array.isArray(d.tags) ? d.tags : [];

  const submitReply = async () => {
    if (!reply.trim()) return;
    try {
      await respond(reply.trim());
      setReply("");
    } catch {
      /* retry */
    }
  };

  return (
    <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 p-4 sm:p-5 shadow-2xs transition-all font-sans">
      <div className="flex items-start gap-3">
        <PeerAvatar
          name={author.displayName}
          photoURL={author.photoURL}
          seed={author.uid || d.id}
          className="w-10 h-10 text-[12px] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
              {author.displayName}
            </span>
            <span className="text-[11px] text-slate-400">
              · {shortAgo(typeof d.createdAt === "number" ? d.createdAt : new Date(d.createdAt).getTime())}
            </span>
            <span className={cn("ml-auto shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full", statusMeta.cls)}>
              {statusMeta.label}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            {d.topic} • Public Community
          </div>

          <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white mt-2 leading-snug">
            {d.title}
          </h3>
          {d.description && (
            <p className={cn("text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed mt-1", !expanded && "line-clamp-2")}>
              {d.description}
            </p>
          )}

          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {tagList.map((t) => (
                <span
                  key={t}
                  className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-white/5"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 sm:gap-4 mt-3.5 pt-2.5 border-t border-slate-100 dark:border-white/5 text-[11.5px] text-slate-400 dark:text-slate-500 flex-wrap sm:flex-nowrap">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {d.views}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> {d.replies}
            </span>
            <button
              onClick={() => onVote(d.id)}
              className={cn(
                "flex items-center gap-1 transition-colors cursor-pointer",
                d.liked ? "text-[#8ba32b] dark:text-[#c8e558] font-bold" : "hover:text-slate-700 dark:hover:text-white"
              )}
            >
              <ThumbsUp className={cn("w-3.5 h-3.5", d.liked && "fill-current")} /> {d.likeCount}
            </button>

            {/* Profile Avatar Stack */}
            {d.participantProfiles && d.participantProfiles.length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <div className="flex -space-x-2 overflow-hidden items-center py-0.5">
                  {d.participantProfiles.slice(0, 4).map((p, idx) => (
                    <div
                      key={p.uid || idx}
                      title={p.displayName}
                      className="relative ring-2 ring-white dark:ring-[#141416] rounded-full overflow-hidden shrink-0 transition-transform hover:scale-110 hover:z-10 cursor-pointer shadow-xs"
                    >
                      <PeerAvatar
                        name={p.displayName}
                        photoURL={p.photoURL}
                        seed={p.uid || p.displayName}
                        className="w-5.5 h-5.5 text-[8.5px]"
                      />
                    </div>
                  ))}
                  {d.participantProfiles.length > 4 && (
                    <span className="flex items-center justify-center w-5.5 h-5.5 rounded-full bg-slate-100 dark:bg-white/10 ring-2 ring-white dark:ring-[#141416] text-[8.5px] font-bold text-slate-600 dark:text-gray-300 shrink-0">
                      +{d.participantProfiles.length - 4}
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] font-medium text-slate-400 hidden sm:inline">
                  {d.participantProfiles.length} active
                </span>
              </div>
            )}

            {d.bestResponseId && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Best answer
              </span>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <span>{expanded ? "Hide" : "Respond"}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: responses + composer */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-3">
          {isAuthor && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">Status:</span>
              {(["active", "resolved", "closed"] as DiscussionStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "text-[10.5px] font-semibold px-2 py-0.5 rounded-full capitalize transition-colors cursor-pointer",
                    status === s
                      ? STATUS_META[s].cls
                      : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {responses.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-slate-500 py-1">No responses yet. Be the first to reply.</p>
          ) : (
            responses.map((r) => (
              <div key={r.id} className="flex gap-2.5 pt-2">
                <PeerAvatar
                  name={r.author.displayName}
                  photoURL={r.author.photoURL}
                  seed={r.author.uid || r.id}
                  className="w-7 h-7 text-[10px] mt-0.5"
                />
                <div className="min-w-0 flex-1 bg-slate-50/70 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-slate-800 dark:text-gray-100">
                      {r.author.uid === currentUid ? "You" : r.author.displayName}
                    </span>
                    <span className="text-[10.5px] text-slate-400">
                      {shortAgo(typeof r.createdAt === "number" ? r.createdAt : new Date(r.createdAt).getTime())}
                    </span>
                    {r.isBest && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Best
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                    {r.text}
                  </p>
                  {isAuthor && !r.isBest && (
                    <button
                      onClick={() => setBest(r.id)}
                      className="mt-1 text-[10.5px] font-semibold text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark as best answer
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {status === "closed" ? (
            <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
              <Lock className="w-3.5 h-3.5" /> This discussion is closed to new responses.
            </p>
          ) : (
            <div className="flex items-end gap-2 bg-slate-50 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10 px-3.5 py-1.5 focus-within:border-slate-400 transition-colors">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitReply();
                  }
                }}
                rows={1}
                placeholder="Write a response…"
                className="flex-1 bg-transparent resize-none outline-none text-[12.5px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400 py-1"
              />
              <button
                onClick={submitReply}
                disabled={!reply.trim() || isResponding}
                className="shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                aria-label="Send response"
              >
                {isResponding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiscussionsForum() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { groups } = useStudyGroups();
  const { trending } = useTrending();
  const { contributors } = useContributors();

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [status, setStatus] = useState<"all" | DiscussionStatus>("all");
  const [sort, setSort] = useState<"recent" | "top">("recent");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [topicsOpen, setTopicsOpen] = useState(true);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ topics: selectedTopics, mine, status, q, sort }),
    [selectedTopics, mine, status, q, sort]
  );

  const { discussions, isLoading, createDiscussion, isCreating, vote } = useDiscussions(filters);

  // Dynamically compute all unique topics present in real data + curriculum
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    discussions.forEach((d) => {
      if (d.topic && d.topic.trim()) set.add(d.topic.trim());
      if (d.chapter && d.chapter.trim()) set.add(d.chapter.trim());
    });
    DEFAULT_CURRICULUM_TOPICS.forEach((t) => set.add(t));
    return Array.from(set);
  }, [discussions]);

  // Topic counts from real data
  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    discussions.forEach((d) => {
      const top = d.topic?.trim();
      if (top) counts.set(top, (counts.get(top) || 0) + 1);
    });
    return counts;
  }, [discussions]);

  const toggleTopic = (t: string) =>
    setSelectedTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const clearAllFilters = () => {
    setSelectedTopics([]);
    setMine(false);
    setStatus("all");
    setSearchInput("");
  };

  const hasActiveFilters = selectedTopics.length > 0 || mine || status !== "all" || q.length > 0;

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col lg:flex-row gap-6 font-sans">
      {/* ── Left sidebar ─────────────────────────── */}
      <aside className="w-full lg:w-56 shrink-0 space-y-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setTopicsOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 dark:text-white cursor-pointer"
            >
              <span>Filter by Topics</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform", !topicsOpen && "-rotate-90")} />
            </button>
            {selectedTopics.length > 0 && (
              <button
                onClick={() => setSelectedTopics([])}
                className="text-[11px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {topicsOpen && (
            <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {availableTopics.map((t) => {
                const count = topicCounts.get(t);
                const isSelected = selectedTopics.includes(t);
                return (
                  <label
                    key={t}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 text-[12px] font-medium text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTopic(t)}
                        className="accent-[#8ba32b] dark:accent-[#c8e558] w-3.5 h-3.5 rounded cursor-pointer shrink-0"
                      />
                      <span className="truncate">{t}</span>
                    </div>
                    {typeof count === "number" && count > 0 && (
                      <span className="text-[10.5px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 shrink-0">
                        {count}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-2 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-1">
          <button
            onClick={() => setMine((v) => !v)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-xl text-[12px] font-semibold transition-all cursor-pointer",
              mine
                ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            )}
          >
            My Discussions
          </button>
        </div>
      </aside>

      {/* ── Center feed ──────────────────────────── */}
      <main className="flex-1 min-w-0 space-y-4">
        {/* Post composer */}
        <StartPost onCreate={createDiscussion} isCreating={isCreating} availableTopics={availableTopics} />

        {/* Filter / Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 flex items-center gap-2 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-full px-3.5 py-2 shadow-2xs focus-within:border-slate-400">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search discussions, topics, keywords..."
              className="w-full bg-transparent text-[12px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[11px] font-bold">
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-full px-3 py-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 outline-none shadow-2xs cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-full px-3 py-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 outline-none shadow-2xs cursor-pointer"
            >
              <option value="recent">Recent</option>
              <option value="top">Top Voted</option>
            </select>
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 font-medium">Filters:</span>
            {selectedTopics.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900"
              >
                {t}
                <button onClick={() => toggleTopic(t)} className="hover:opacity-70">
                  ✕
                </button>
              </span>
            ))}
            {mine && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900">
                My Posts
                <button onClick={() => setMine(false)} className="hover:opacity-70">
                  ✕
                </button>
              </span>
            )}
            {status !== "all" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                Status: {status}
                <button onClick={() => setStatus("all")} className="hover:opacity-70">
                  ✕
                </button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Discussion items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#8ba32b] dark:text-[#c8e558] animate-spin" />
          </div>
        ) : discussions.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xs space-y-2">
            <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white">No discussions found</h3>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {q ? `No discussions matched "${q}". Try another search.` : "Be the first to start a conversation in this topic."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {discussions.map((d) => (
              <DiscussionCard key={d.id} discussion={d} onVote={vote} />
            ))}
          </div>
        )}
      </main>

      {/* ── Right sidebar ────────────────────────── */}
      <aside className="w-full lg:w-64 shrink-0 space-y-4">
        {/* Trending */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 dark:text-white">
            <TrendingUp className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" /> Trending Discussions
          </div>
          {trending.length === 0 ? (
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">Nothing trending yet.</p>
          ) : (
            <div className="space-y-2.5">
              {trending.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSearchInput(t.title);
                  }}
                  className="text-[12px] space-y-0.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <p className="font-semibold text-slate-800 dark:text-gray-200 line-clamp-2">
                    {t.title}
                  </p>
                  <p className="text-[10.5px] text-slate-400">
                    {t.topic} • {t.replies} replies • {t.views} views
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top contributors */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 dark:text-white">
            <Award className="w-4 h-4 text-amber-500" /> Top Contributors
          </div>
          {contributors.length === 0 ? (
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">No contributors yet.</p>
          ) : (
            <div className="space-y-2.5">
              {contributors.map((c) => (
                <div
                  key={c.uid}
                  onClick={() => setSearchInput(c.displayName)}
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <PeerAvatar name={c.displayName} photoURL={c.photoURL} seed={c.uid} className="w-7 h-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-gray-200 truncate">{c.displayName}</p>
                    <p className="text-[10.5px] text-slate-400">{c.posts} discussions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User's Groups */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 dark:text-white">
            <Users className="w-4 h-4 text-blue-500" /> Your Study Groups
          </div>
          {groups.length === 0 ? (
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">You haven't joined any groups yet.</p>
          ) : (
            <div className="space-y-2">
              {groups.slice(0, 5).map((g) => (
                <div key={g.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5">
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                  <p className="text-[12px] font-semibold text-slate-800 dark:text-gray-100 truncate flex-1">{g.name}</p>
                  <button
                    onClick={() => navigate(`/community?tab=chats&g=${g.id}`)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

import { SavedMessagesView } from "../components/social/SavedMessagesView";
import { Bookmark } from "lucide-react";

type CommunityTab = "discussions" | "chats" | "people" | "saved";

/**
 * The Community hub: one page hosting the Discussions forum, the Chats messaging experience,
 * the People directory, and the Saved Notes revision vault.
 */
export default function Community() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: CommunityTab =
    tabParam === "chats" || tabParam === "people" || tabParam === "discussions" || tabParam === "saved"
      ? tabParam
      : "chats"; // default to the chat workspace
  const setTab = (id: CommunityTab) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("tab", id);
      return n;
    });

  const TABS: { id: CommunityTab; label: string; icon: React.ElementType }[] = [
    { id: "chats", label: "Chats", icon: MessagesSquare },
    { id: "discussions", label: "Discussions", icon: MessageSquare },
    { id: "people", label: "People", icon: Users },
    { id: "saved", label: "Saved Notes", icon: Bookmark },
  ];

  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-[#fafbfc] dark:bg-[#0b0b0c] font-sans">
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 h-13 border-b border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#141416] transition-colors">
        <div className="flex items-center gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-all cursor-pointer",
                  active
                    ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        <span className="hidden sm:inline text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Sadhya Community &amp; Chats
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "chats" ? (
          <Chats />
        ) : tab === "people" ? (
          <People />
        ) : tab === "saved" ? (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <SavedMessagesView />
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 md:px-6 lg:px-8 py-6">
              <DiscussionsForum />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
