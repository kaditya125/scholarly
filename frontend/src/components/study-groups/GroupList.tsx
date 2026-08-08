import { useMemo, useState } from "react";
import { Search, Plus, Sparkles, KeyRound } from "lucide-react";
import { StudyGroup } from "../../lib/api/studyGroups";
import { getAvatarColor, getInitials, formatDate } from "./utils";

interface GroupListProps {
  groups: StudyGroup[];
  activeGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onCreateClick: () => void;
  onJoinClick: () => void;
}

export function GroupList({
  groups,
  activeGroupId,
  onSelectGroup,
  onCreateClick,
  onJoinClick,
}: GroupListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.subject || "").toLowerCase().includes(q)
    );
  }, [groups, query]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1C1C1E] border-r border-slate-100 dark:border-slate-800/60 w-full sm:w-[320px] shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Study Groups</h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onJoinClick}
              title="Join with a code"
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-colors"
            >
              <KeyRound className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={onCreateClick}
              title="Create a group"
              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100 focus:bg-white dark:bg-slate-900 dark:hover:bg-slate-800/80 dark:focus:bg-slate-900 border border-transparent focus:border-violet-500/30 rounded-lg text-sm transition-colors outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {groups.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No study groups yet. Create one or join with a code.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-slate-500">No groups match “{query}”.</p>
          </div>
        ) : (
          filtered.map((group) => {
            const memberCount = group.members?.length || group.memberIds?.length || 0;
            const active = activeGroupId === group.id;
            return (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left ${
                  active ? "bg-violet-50 dark:bg-violet-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <div
                  className={`w-10 h-10 shrink-0 rounded-full ${getAvatarColor(group.id)} flex items-center justify-center text-white text-sm font-semibold`}
                >
                  {getInitials(group.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3
                      className={`text-sm font-semibold truncate pr-2 ${
                        active ? "text-violet-900 dark:text-violet-100" : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {group.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                      {formatDate(group.updatedAt || group.createdAt)}
                    </span>
                  </div>
                  <p
                    className={`text-xs truncate ${
                      active ? "text-violet-600/70 dark:text-violet-300/70" : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {group.subject ? `${group.subject} · ` : ""}
                    {memberCount} member{memberCount === 1 ? "" : "s"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
