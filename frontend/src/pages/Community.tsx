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

const TOPICS = [
  "General",
  "AI/ML",
  "Web Development",
  "Cloud",
  "Blockchain",
  "Data Science",
  "Cybersecurity",
  "DevOps",
  "Mobile",
  "IoT",
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
}: {
  onCreate: (input: { topic: string; title: string; description: string; tags?: string[] }) => Promise<unknown>;
  isCreating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [tags, setTags] = useState("");

  const submit = async () => {
    if (!title.trim() && !description.trim()) return;
    try {
      await onCreate({
        topic,
        title: title.trim(),
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setTitle("");
      setDescription("");
      setTags("");
      setTopic(TOPICS[0]);
      setOpen(false);
    } catch {
      /* keep the draft so the author can retry */
    }
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 p-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 text-[13.5px] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" /> Start a post
        </button>
      ) : (
        <div className="space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            autoFocus
            className="w-full bg-transparent text-[15px] font-semibold text-slate-900 dark:text-white outline-none placeholder:text-slate-400 px-1"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Share your question or idea with the community…"
            className="w-full bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[13.5px] text-slate-700 dark:text-gray-200 outline-none resize-none focus:border-indigo-400 dark:focus:border-indigo-500/40 placeholder:text-slate-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] text-slate-600 dark:text-gray-300 outline-none focus:border-indigo-400"
            >
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tags, comma separated"
              className="flex-1 min-w-[140px] bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] text-slate-600 dark:text-gray-300 outline-none focus:border-indigo-400 placeholder:text-slate-400"
            />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={isCreating || (!title.trim() && !description.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscussionCard({
  d,
  currentUid,
  onVote,
}: {
  d: CommunityDiscussion;
  currentUid?: string;
  onVote: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const { responses, respond, isResponding, setBest, setStatus } = useDiscussion(expanded ? d.id : undefined);

  // Defensive reads: even after the API-layer normalizer, hand-written seed
  // rows or legacy backend payloads can carry a missing/partial author. Blank
  // fallbacks let the card render instead of crashing.
  const author = d.author || { uid: 'unknown', displayName: 'Unknown', photoURL: undefined };
  const tagList = Array.isArray(d.tags) ? d.tags : [];
  const isAuthor = !!currentUid && (d.authorId === currentUid || author.uid === currentUid);
  const status = d.status || "active";
  const statusMeta = STATUS_META[status] || STATUS_META.active;

  const submitReply = async () => {
    const text = reply.trim();
    if (!text || isResponding) return;
    setReply("");
    try {
      await respond(text);
    } catch {
      /* invalidated on success; ignore transient errors */
    }
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <PeerAvatar
          name={author.displayName}
          photoURL={author.photoURL}
          seed={author.uid || d.id}
          className="w-9 h-9 text-[12px] mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
              {author.displayName}
            </span>
            <span className="text-[11.5px] text-slate-400">· {shortAgo(d.createdAt)}</span>
            <span className={cn("ml-auto shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full", statusMeta.cls)}>
              {statusMeta.label}
            </span>
          </div>
          <div className="text-[11.5px] text-slate-400 dark:text-gray-500">
            {d.topic} · Public
          </div>

          <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white mt-2 leading-snug">
            {d.title}
          </h3>
          {d.description && (
            <p className={cn("text-[13px] text-slate-600 dark:text-gray-300 leading-relaxed mt-1", !expanded && "line-clamp-2")}>
              {d.description}
            </p>
          )}

          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tagList.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 mt-3 text-[12px] text-slate-400 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {d.views}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> {d.replies}
            </span>
            <button
              onClick={() => onVote(d.id)}
              className={cn(
                "flex items-center gap-1 transition-colors",
                d.liked ? "text-indigo-600 dark:text-indigo-400" : "hover:text-slate-600 dark:hover:text-gray-300"
              )}
            >
              <ThumbsUp className={cn("w-3.5 h-3.5", d.liked && "fill-current")} /> {d.likeCount}
            </button>
            {d.bestResponseId && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Best answer
              </span>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto flex items-center gap-1 font-semibold text-slate-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              Respond <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: responses + composer */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-3">
          {isAuthor && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Author:</span>
              {(["active", "resolved", "closed"] as DiscussionStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize transition-colors",
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
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500">No responses yet. Be the first to reply.</p>
          ) : (
            responses.map((r) => (
              <div key={r.id} className="flex gap-2.5">
                <PeerAvatar
                  name={r.author.displayName}
                  photoURL={r.author.photoURL}
                  seed={r.author.uid || r.id}
                  className="w-7 h-7 text-[10px] mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-slate-800 dark:text-gray-100">
                      {r.author.uid === currentUid ? "You" : r.author.displayName}
                    </span>
                    <span className="text-[10.5px] text-slate-400">{shortAgo(r.createdAt)}</span>
                    {r.isBest && (
                      <span className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Best
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-600 dark:text-gray-300 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                    {r.text}
                  </p>
                  {isAuthor && !r.isBest && (
                    <button
                      onClick={() => setBest(r.id)}
                      className="mt-1 text-[11px] font-medium text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark as best answer
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {status === "closed" ? (
            <p className="flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-gray-500">
              <Lock className="w-3.5 h-3.5" /> This discussion is closed to new responses.
            </p>
          ) : (
            <div className="flex items-end gap-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 focus-within:border-indigo-400 dark:focus-within:border-indigo-500/40">
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
                className="flex-1 bg-transparent resize-none outline-none text-[13px] text-slate-700 dark:text-gray-200 placeholder:text-slate-400 max-h-28 py-1"
              />
              <button
                onClick={submitReply}
                disabled={!reply.trim() || isResponding}
                className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Send response"
              >
                {isResponding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Discussions forum: topic filters + a feed of discussions with responses, likes, tags and
 * statuses, alongside trending threads, top contributors, and the user's study groups. Everything
 * is wired to the /discussions API; author-only actions are enforced server side.
 */
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

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ topics: selectedTopics, mine, status, q, sort }),
    [selectedTopics, mine, status, q, sort]
  );

  const { discussions, isLoading, createDiscussion, isCreating, vote } = useDiscussions(filters);

  const toggleTopic = (t: string) =>
    setSelectedTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="max-w-[1200px] mx-auto flex gap-6">
      {/* ── Left sidebar ─────────────────────────── */}
      <aside className="hidden lg:block w-56 shrink-0 space-y-6">
        <div>
          <button
            onClick={() => setTopicsOpen((v) => !v)}
            className="w-full flex items-center justify-between text-[13px] font-bold text-slate-900 dark:text-white mb-2"
          >
            Filter by Topics
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", !topicsOpen && "-rotate-90")} />
          </button>
          {topicsOpen && (
            <div className="space-y-1">
              {TOPICS.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2.5 px-1 py-1 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 text-[13px] text-slate-600 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedTopics.includes(t)}
                    onChange={() => toggleTopic(t)}
                    className="accent-indigo-600 w-3.5 h-3.5"
                  />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <button
            onClick={() => setMine((v) => !v)}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg text-[13px] font-semibold transition-colors",
              mine
                ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                : "text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            My Posts
          </button>
        </div>

        <div>
          <div className="text-[13px] font-bold text-slate-900 dark:text-white mb-2">My Groups</div>
          <div className="space-y-0.5">
            {groups.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-gray-500 px-2">No groups yet.</p>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => navigate(`/community?tab=chats&g=${g.id}`)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{g.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* ── Center feed ─────────────────────────── */}
      <main className="flex-1 min-w-0 max-w-2xl space-y-4">
        <StartPost onCreate={createDiscussion} isCreating={isCreating} />

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white dark:bg-[#1a1a1b] rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search discussions"
              className="flex-1 bg-transparent outline-none text-[13px] text-slate-700 dark:text-gray-200 placeholder:text-slate-400"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | DiscussionStatus)}
            className="bg-white dark:bg-[#1a1a1b] rounded-xl border border-slate-200 dark:border-white/10 px-2.5 py-2 text-[12.5px] text-slate-600 dark:text-gray-300 outline-none focus:border-indigo-400"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "top")}
            className="bg-white dark:bg-[#1a1a1b] rounded-xl border border-slate-200 dark:border-white/10 px-2.5 py-2 text-[12.5px] text-slate-600 dark:text-gray-300 outline-none focus:border-indigo-400"
          >
            <option value="recent">Recent</option>
            <option value="top">Top</option>
          </select>
        </div>

        {isLoading && discussions.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : discussions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-[14px] font-bold text-slate-900 dark:text-white">No discussions yet</p>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 mt-1 max-w-xs">
              {mine || selectedTopics.length || q || status !== "all"
                ? "Nothing matches your filters."
                : "Start the first conversation with the Start a post box above."}
            </p>
          </div>
        ) : (
          discussions.map((d) => (
            <DiscussionCard key={d.id} d={d} currentUid={user?.uid} onVote={vote} />
          ))
        )}
      </main>

      {/* ── Right rail ─────────────────────────── */}
      <aside className="hidden xl:block w-72 shrink-0 space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900 dark:text-white mb-3">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Trending Discussions
          </div>
          {trending.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500">Nothing trending yet.</p>
          ) : (
            <div className="space-y-3">
              {trending.map((t) => (
                <div key={t.id} className="text-[12.5px]">
                  <p className="font-semibold text-slate-700 dark:text-gray-200 leading-snug line-clamp-2">{t.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t.author.displayName} · {t.views} views
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900 dark:text-white mb-3">
            <Award className="w-4 h-4 text-amber-500" /> Top Contributors
          </div>
          {contributors.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500">No contributors yet.</p>
          ) : (
            <div className="space-y-2.5">
              {contributors.map((c) => (
                <div key={c.uid} className="flex items-center gap-2.5">
                  <PeerAvatar name={c.displayName} photoURL={c.photoURL} seed={c.uid} className="w-8 h-8 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-800 dark:text-gray-100 truncate">
                      {c.uid === user?.uid ? "You" : c.displayName}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {c.posts} {c.posts === 1 ? "post" : "posts"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900 dark:text-white mb-3">
            <Users className="w-4 h-4 text-violet-500" /> Your Groups
          </div>
          {groups.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500">
              You haven't joined any groups yet.
            </p>
          ) : (
            <div className="space-y-2">
              {groups.slice(0, 5).map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-white/10"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[12px] font-bold flex items-center justify-center shrink-0">
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-800 dark:text-gray-100 truncate">{g.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {g.memberIds.length} {g.memberIds.length === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/community?tab=chats&g=${g.id}`)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-[11.5px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
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

type CommunityTab = "discussions" | "chats" | "people";

/**
 * The Community hub: one page hosting the Discussions forum, the Chats messaging experience, and
 * the People directory as tabs. The tab is kept in local state (not the URL) so the embedded Chats
 * view is free to own the query string for its own selection (?dm=, ?g=&c=, ?ai=); we still open on
 * the Chats tab when the URL already carries a conversation, so deep links keep working.
 */
export default function Community() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: CommunityTab =
    tabParam === "chats" || tabParam === "people" || tabParam === "discussions"
      ? tabParam
      : "chats"; // default to the chat workspace (the provided template)
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
  ];

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-1.5 px-4 md:px-6 h-12 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#131314] overflow-x-auto custom-scrollbar">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-3.5 h-8 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors",
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10"
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "chats" ? (
          <Chats />
        ) : tab === "people" ? (
          <People />
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
