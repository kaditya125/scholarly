import React, { useMemo, useState } from "react";
import {
  X,
  Hash,
  FileText,
  Link as LinkIcon,
  Info as InfoIcon,
  ExternalLink,
  Download,
  Crown,
  ShieldCheck,
  Loader2,
  Bell,
  Search,
  Bookmark,
  UserPlus,
  Calendar,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useGroupChannels, useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useConversation } from "../../hooks/api/useDirectMessages";
import { useOnlineStatuses } from "../../hooks/usePresence";
import { PeerAvatar } from "../social/PeerAvatar";
import { GroupParticipantsModal } from "./GroupParticipantsModal";
import type { ThreadMessage } from "./ChatMessageList";
import { longDate } from "./format";

type Sender = { displayName: string; photoURL?: string };
const URL_RE = /(https?:\/\/[^\s<>()]+)/g;

interface MediaItem {
  id: string;
  url: string;
  name: string;
}
interface FileItem {
  id: string;
  url: string;
  name: string;
  by: string;
  size?: string;
}
interface LinkItem {
  url: string;
  host: string;
  by: string;
}

function useSharedContent(messages: ThreadMessage[], resolveSender: (uid: string) => Sender) {
  return useMemo(() => {
    const media: MediaItem[] = [];
    const files: FileItem[] = [];
    const links: LinkItem[] = [];
    const seenLinks = new Set<string>();

    for (const m of messages) {
      if (m.deleted) continue;
      const by = resolveSender(m.senderId).displayName;
      for (const a of m.attachments || []) {
        if (a.kind === "image") {
          media.push({ id: a.id, url: a.url, name: a.name });
        } else {
          const rawSize = (a as any).sizeBytes || (a as any).size;
          files.push({
            id: a.id,
            url: a.url,
            name: a.name,
            by,
            size: rawSize ? `${(rawSize / (1024 * 1024)).toFixed(2)} MB` : "5.21 MB",
          });
        }
      }
      if (m.text) {
        const matches = m.text.match(URL_RE);
        if (matches) {
          for (const raw of matches) {
            const url = raw.replace(/[.,)]+$/, "");
            if (seenLinks.has(url)) continue;
            seenLinks.add(url);
            let host = url;
            try {
              host = new URL(url).hostname.replace(/^www\./, "");
            } catch {
              /* keep raw */
            }
            links.push({ url, host, by });
          }
        }
      }
    }
    media.reverse();
    files.reverse();
    links.reverse();
    return { media, files, links };
  }, [messages, resolveSender]);
}

function SectionHead({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h4>
      {count > 0 && (
        <button
          onClick={onToggle}
          className="text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
        >
          {expanded ? "Show less" : "See all"}
        </button>
      )}
    </div>
  );
}

/**
 * Detail Message Right-Side Panel matching the reference templates
 */
function GeneralInfoPanel({
  title,
  subtitle,
  icon,
  messages,
  resolveSender,
  about,
  onClose,
  onOpenInvite,
}: {
  title: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  messages: ThreadMessage[];
  resolveSender: (uid: string) => Sender;
  about?: React.ReactNode;
  onClose?: () => void;
  onOpenInvite?: () => void;
}) {
  const { media, files, links } = useSharedContent(messages, resolveSender);
  const [mediaAll, setMediaAll] = useState(false);
  const [filesAll, setFilesAll] = useState(false);
  const [linksAll, setLinksAll] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const shownMedia = mediaAll ? media : media.slice(0, 6);
  const shownFiles = filesAll ? files : files.slice(0, 4);
  const shownLinks = linksAll ? links : links.slice(0, 4);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#131316] border-l border-slate-200/80 dark:border-white/5 font-sans overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-slate-100 dark:border-white/5">
        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
          Detail Message
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* About & Quick Action Chips */}
        {about}

        {/* Quick Actions Row (Mute, Search, Bookmarks) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer",
              isMuted
                ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400"
                : "bg-slate-50 dark:bg-white/[0.03] border-slate-200/70 dark:border-white/5 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Bell className="w-4 h-4" />
            <span className="text-[10.5px] font-semibold">{isMuted ? "Muted" : "Mute"}</span>
          </button>

          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border border-slate-200/70 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span className="text-[10.5px] font-semibold">Search</span>
          </button>

          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border border-slate-200/70 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
          >
            <Bookmark className="w-4 h-4" />
            <span className="text-[10.5px] font-semibold">Starred</span>
          </button>
        </div>

        {/* ── Shared Media Section ── */}
        <div className="pt-2 border-t border-slate-100 dark:border-white/5">
          <SectionHead
            title="Shared Media"
            count={media.length}
            expanded={mediaAll}
            onToggle={() => setMediaAll((v) => !v)}
          />
          {media.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500 py-1">
              No photos shared yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {shownMedia.map((m, idx) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 group shadow-2xs"
                  title={m.name}
                >
                  <img
                    src={m.url}
                    alt={m.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {!mediaAll && idx === 5 && media.length > 6 && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white text-[11px] font-bold">
                      +{media.length - 6} more
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Shared Documents & Files List ── */}
        <div className="pt-2 border-t border-slate-100 dark:border-white/5">
          <SectionHead
            title="Shared Files"
            count={files.length}
            expanded={filesAll}
            onToggle={() => setFilesAll((v) => !v)}
          />
          {files.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500 py-1">
              No documents shared yet.
            </p>
          ) : (
            <div className="space-y-2">
              {shownFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  download={f.name}
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-emerald-600 dark:text-[#c8e558]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-slate-800 dark:text-gray-200 truncate">
                      {f.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500">{f.size || "5.21 MB"}</p>
                  </div>
                  <Download className="w-4 h-4 text-slate-300 group-hover:text-slate-600 dark:group-hover:text-white shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── Shared Links List ── */}
        <div className="pt-2 border-t border-slate-100 dark:border-white/5">
          <SectionHead
            title="Shared Links"
            count={links.length}
            expanded={linksAll}
            onToggle={() => setLinksAll((v) => !v)}
          />
          {links.length === 0 ? (
            <p className="text-[12px] text-slate-400 dark:text-gray-500 py-1">
              No shared links yet.
            </p>
          ) : (
            <div className="space-y-2">
              {shownLinks.map((l, i) => (
                <a
                  key={`${l.url}-${i}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center shrink-0">
                    <LinkIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-slate-800 dark:text-gray-200 truncate">
                      {l.host}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500 truncate">{l.url}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-slate-600 dark:group-hover:text-white shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Right-hand panel for a group channel */
export function ChannelInfoPanel({
  groupId,
  channelId,
  onClose,
}: {
  groupId: string;
  channelId: string;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const { group, invite, removeMember } = useStudyGroup(groupId);
  const { channels } = useGroupChannels(groupId);
  const { messages, senders } = useChannelMessages(groupId, channelId);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const channel = channels.find((c) => c.id === channelId);
  const members = group?.memberProfiles || [];
  const online = useOnlineStatuses(members.map((m) => m.uid));
  const isAdmin = group?.ownerId === user?.uid || members.find((m) => m.uid === user?.uid)?.role === "admin";

  const resolveSender = (uid: string): Sender => {
    const s = senders[uid];
    if (s) return { displayName: s.displayName, photoURL: s.photoURL };
    const m = members.find((mm) => mm.uid === uid);
    if (m) return { displayName: m.displayName, photoURL: m.photoURL };
    if (uid === user?.uid) return { displayName: "You", photoURL: user?.photoURL || undefined };
    return { displayName: "Member" };
  };

  const about = !group ? (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 text-slate-300 dark:text-white/20 animate-spin" />
    </div>
  ) : (
    <div className="space-y-4">
      {/* Group Card */}
      <div className="p-4 rounded-3xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-bold text-base flex items-center justify-center shadow-sm">
            {(group.name || "G").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
              {group.name}
            </h4>
            <p className="text-[11.5px] text-slate-500 dark:text-gray-400">
              {members.length} members • {online.size} online
            </p>
          </div>
        </div>

        <p className="text-[12.5px] text-slate-600 dark:text-gray-300 leading-relaxed pt-1">
          {group.description || "Active collaborative study group for peer discussions & doubts."}
        </p>
      </div>

      {/* Participants List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">Participant</h4>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add email</span>
          </button>
        </div>

        <div className="space-y-2">
          {members.slice(0, 6).map((m) => (
            <div
              key={m.uid}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PeerAvatar
                  name={m.displayName}
                  photoURL={m.photoURL}
                  seed={m.uid}
                  online={online.has(m.uid)}
                  className="w-8 h-8 text-[11px]"
                />
                <div className="min-w-0">
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-gray-200 truncate block">
                    {m.uid === user?.uid ? "You" : m.displayName}
                  </span>
                  <span className="text-[10.5px] text-slate-400 dark:text-gray-500">
                    {m.isOwner ? "Owner" : m.role === "admin" ? "Admin" : "Aspirant"}
                  </span>
                </div>
              </div>

              {m.isOwner || m.role === "admin" ? (
                <span className="text-[10.5px] font-bold text-[#8ba32b] dark:text-[#c8e558] bg-[#8ba32b]/10 dark:bg-[#c8e558]/15 px-2 py-0.5 rounded-lg">
                  Admin
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <GeneralInfoPanel
        title={channel ? `# ${channel.name}` : "Channel"}
        subtitle={group?.name}
        icon={<Hash className="w-4 h-4" />}
        messages={messages as ThreadMessage[]}
        resolveSender={resolveSender}
        about={about}
        onClose={onClose}
        onOpenInvite={() => setIsInviteModalOpen(true)}
      />

      {group && (
        <GroupParticipantsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          groupName={group.name}
          members={members}
          isAdmin={isAdmin}
          currentUserId={user?.uid}
          onInvite={async (email) => {
            if (invite) await invite([email]);
          }}
          onRemoveMember={async (uid) => {
            if (removeMember) await removeMember(uid);
          }}
        />
      )}
    </>
  );
}

/** Right-hand panel for a direct message */
export function DmInfoPanel({ otherId, onClose }: { otherId: string; onClose?: () => void }) {
  const { user } = useAuth();
  const { messages, peer } = useConversation(otherId);
  const online = useOnlineStatuses([otherId]);
  const isOnline = online.has(otherId);

  const resolveSender = (uid: string): Sender =>
    uid === user?.uid
      ? { displayName: "You", photoURL: user?.photoURL || undefined }
      : { displayName: peer?.displayName || "User", photoURL: peer?.photoURL };

  const about = (
    <div className="flex flex-col items-center text-center p-4 rounded-3xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5">
      <PeerAvatar
        name={peer?.displayName}
        photoURL={peer?.photoURL}
        seed={otherId}
        online={isOnline}
        className="w-16 h-16 text-xl mb-3 shadow-md"
      />
      <h4 className="text-[16px] font-bold text-slate-900 dark:text-white">
        {peer?.displayName || "Student"}
      </h4>
      <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-0.5">
        {isOnline ? "Active now on Sadhya" : "Offline"}
      </p>
    </div>
  );

  return (
    <GeneralInfoPanel
      title={peer?.displayName || "Conversation"}
      subtitle="Direct message"
      icon={<InfoIcon className="w-4 h-4" />}
      messages={messages as ThreadMessage[]}
      resolveSender={resolveSender}
      about={about}
      onClose={onClose}
    />
  );
}
