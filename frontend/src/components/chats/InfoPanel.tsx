import React, { useMemo, useState } from "react";
import {
  X,
  FileText,
  Image as ImageIcon,
  Link2,
  Bell,
  BellOff,
  Search,
  Bookmark,
  Users,
  ChevronRight,
  Download,
  ExternalLink,
  ShieldCheck,
  UserPlus,
  PanelRightClose,
  Radio,
  FileCode,
  Music,
  Video,
  Archive,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { usePresence } from "../../hooks/usePresence";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useGroupMembers } from "../../hooks/api/useGroupMembers";
import { useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useConversation } from "../../hooks/api/useDirectMessages";
import { PeerAvatar } from "../social/PeerAvatar";
import { GroupParticipantsModal } from "./GroupParticipantsModal";
import type { Attachment } from "../../lib/api/uploads";
import type { ThreadMessage } from "./ChatMessageList";

interface Sender {
  displayName: string;
  photoURL?: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileCategory(name: string, contentType?: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const ct = (contentType || '').toLowerCase();

  if (ext === 'pdf' || ct.includes('pdf')) {
    return { type: 'pdf', label: 'PDF Document', color: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20' };
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || ct.startsWith('video/')) {
    return { type: 'video', label: 'Video File', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20' };
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext) || ct.startsWith('audio/')) {
    return { type: 'audio', label: 'Audio File', color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { type: 'archive', label: 'Archive', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20' };
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'html', 'css', 'json'].includes(ext)) {
    return { type: 'code', label: 'Source Code', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20' };
  }
  return { type: 'doc', label: 'Document', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20' };
}

function useSharedContent(messages: ThreadMessage[], resolveSender: (uid: string) => Sender) {
  return useMemo(() => {
    const media: { id: string; url: string; name: string; sender: Sender; createdAt: number }[] = [];
    const files: { id: string; url: string; name: string; size: number; contentType?: string; sender: Sender; createdAt: number }[] = [];
    const links: { url: string; host: string; messageId: string; sender: Sender; createdAt: number }[] = [];

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    for (const m of messages) {
      if (m.deleted) continue;
      const sender = resolveSender(m.senderId);

      // Attachments
      if (m.attachments) {
        for (const a of m.attachments) {
          if (a.kind === "image") {
            media.push({ id: a.id, url: a.url, name: a.name, sender, createdAt: m.createdAt });
          } else if (a.kind === "file" || a.kind === "audio") {
            files.push({
              id: a.id,
              url: a.url,
              name: a.name,
              size: a.size,
              contentType: a.contentType,
              sender,
              createdAt: m.createdAt,
            });
          }
        }
      }

      // Links in text
      if (m.text) {
        const matches = m.text.match(urlRegex);
        if (matches) {
          for (const u of matches) {
            try {
              const host = new URL(u).hostname.replace(/^www\./, "");
              links.push({ url: u, host, messageId: m.id, sender, createdAt: m.createdAt });
            } catch {
              // Ignore invalid url parse
            }
          }
        }
      }
    }

    return {
      media: media.reverse(),
      files: files.reverse(),
      links: links.reverse(),
    };
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
    <div className="flex items-center justify-between mb-3.5">
      <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h4>
      {count > 0 && (
        <button
          onClick={onToggle}
          className="text-[11.5px] font-semibold text-[#186a52] dark:text-[#c8e558] hover:underline cursor-pointer"
        >
          {expanded ? "Show less" : "See all"}
        </button>
      )}
    </div>
  );
}

/**
 * Premium Detail Message Right-Side Panel
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
    <div className="flex flex-col h-full bg-white dark:bg-[#141417] border-l border-slate-200/80 dark:border-white/5 font-sans overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 h-15 border-b border-slate-100 dark:border-white/5 bg-white/80 dark:bg-[#141417]/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
            Detail Message
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Collapse details"
            title="Collapse panel"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* About Card & Quick Action Chips */}
        {about}

        {/* Quick Action Pills matching Reference UI */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs",
              isMuted
                ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20 text-rose-600 dark:text-rose-400"
                : "bg-slate-50/80 dark:bg-white/[0.03] border-slate-200/70 dark:border-white/5 text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            <span className="text-[11px] font-bold">{isMuted ? "Muted" : "Mute"}</span>
          </button>

          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-slate-200/70 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <Search className="w-4 h-4" />
            <span className="text-[11px] font-bold">Search</span>
          </button>

          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-slate-200/70 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.03] text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <Bookmark className="w-4 h-4" />
            <span className="text-[11px] font-bold">Starred</span>
          </button>
        </div>

        {/* ── Shared Media Section ── */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/5">
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

        {/* ── Shared Documents & Files List (Exact Squircle Card Strip) ── */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/5">
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
              {shownFiles.map((f) => {
                const cat = getFileCategory(f.name, f.contentType);
                return (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    download={f.name}
                    className="flex items-center gap-3 p-2.5 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all group shadow-2xs hover:shadow-xs"
                  >
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs", cat.color)}>
                      {cat.type === 'pdf' ? (
                        <span className="font-extrabold text-[10px]">PDF</span>
                      ) : cat.type === 'video' ? (
                        <Video className="w-4 h-4 fill-current" />
                      ) : cat.type === 'audio' ? (
                        <Music className="w-4 h-4" />
                      ) : cat.type === 'archive' ? (
                        <Archive className="w-4 h-4" />
                      ) : cat.type === 'code' ? (
                        <FileCode className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-slate-900 dark:text-gray-100 truncate">
                        {f.name}
                      </p>
                      <p className="text-[10.5px] text-slate-400 dark:text-gray-400 font-medium">
                        {cat.label} {f.size ? `• ${formatSize(f.size)}` : ""}
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-300 flex items-center justify-center shrink-0 group-hover:bg-[#186a52] group-hover:text-white dark:group-hover:bg-[#c8e558] dark:group-hover:text-slate-900 transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Shared Links List ── */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/5">
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
              {shownLinks.map((l, idx) => (
                <a
                  key={idx}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all group shadow-2xs hover:shadow-xs"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0 text-slate-600 dark:text-gray-300">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-slate-900 dark:text-gray-100 truncate">
                      {l.host}
                    </p>
                    <p className="text-[10.5px] text-slate-400 dark:text-gray-400 truncate">{l.url}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Channel info drawer / right panel */
export function ChannelInfoPanel({
  groupId,
  channelId,
  onClose,
}: {
  groupId: string;
  channelId: string;
  onClose?: () => void;
}) {
  const { group, invite } = useStudyGroup(groupId);
  const { members } = useGroupMembers(groupId);
  const { channel, messages } = useChannelMessages(groupId, channelId);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const resolveSender = useMemo(() => {
    const map = new Map<string, Sender>();
    if (group?.memberProfiles) {
      for (const p of group.memberProfiles) {
        map.set(p.uid, { displayName: p.displayName, photoURL: p.photoURL });
      }
    }
    return (uid: string): Sender =>
      map.get(uid) || { displayName: `Student ${uid.slice(0, 4)}` };
  }, [group?.memberProfiles]);

  const rawMessages: ThreadMessage[] = (messages || []).map((m: any) => ({
    id: m.id,
    senderId: m.senderId || m.userId,
    text: m.text || m.content || "",
    attachments: m.attachments,
    reactions: m.reactions,
    replyTo: m.replyTo,
    createdAt: m.createdAt || Date.now(),
    deleted: m.deleted,
  }));

  const memberProfiles = group?.memberProfiles || [];

  return (
    <>
      <GeneralInfoPanel
        title={group?.name || "Study Group"}
        subtitle={channel ? `#${channel.name}` : undefined}
        icon={<Users className="w-4 h-4 text-[#186a52]" />}
        messages={rawMessages}
        resolveSender={resolveSender}
        onClose={onClose}
        onOpenInvite={() => setIsInviteModalOpen(true)}
        about={
          <div className="space-y-4">
            {/* Group Profile Hero Card */}
            <div className="flex flex-col items-center text-center p-6 rounded-3xl bg-gradient-to-b from-slate-50 to-white dark:from-white/[0.04] dark:to-[#161619] border border-slate-200/80 dark:border-white/10 shadow-2xs">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-extrabold text-2xl flex items-center justify-center mb-3.5 shadow-md ring-4 ring-white dark:ring-[#141417]">
                {group?.name?.charAt(0) || "G"}
              </div>
              <h3 className="text-[17px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                {group?.name || "Study Group"}
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1 max-w-[220px] line-clamp-2">
                {group?.description || "Collaborative study circle for focused revision and doubts."}
              </p>

              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{members?.length || 1} Members</span>
              </div>
            </div>

            {/* Participants Bar */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Participants</h4>
                <button
                  onClick={() => setIsInviteModalOpen(true)}
                  className="text-[11.5px] font-bold text-[#186a52] dark:text-[#c8e558] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite</span>
                </button>
              </div>

              <div className="space-y-2">
                {memberProfiles.slice(0, 5).map((m) => (
                  <div
                    key={m.uid}
                    className="flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <PeerAvatar name={m.displayName} photoURL={m.photoURL} seed={m.uid} className="w-8 h-8 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-slate-900 dark:text-white truncate">{m.displayName}</p>
                      <p className="text-[10.5px] text-slate-400 dark:text-gray-500 capitalize">{m.role || "Member"}</p>
                    </div>
                    {m.role === "admin" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-500/20">
                        Admin
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      />

      {/* Group Invite & Participants Modal */}
      {isInviteModalOpen && group && (
        <GroupParticipantsModal
          group={group}
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onInvite={async (emails) => {
            await invite(emails);
          }}
        />
      )}
    </>
  );
}

/** Direct message info drawer / right panel */
export function DmInfoPanel({ otherId, onClose }: { otherId: string; onClose?: () => void }) {
  const { peer, messages } = useConversation(otherId);
  const { isOnline } = usePresence(otherId);

  const resolveSender = useMemo(() => {
    return (uid: string): Sender => {
      if (uid === otherId) {
        return { displayName: peer?.displayName || "Peer", photoURL: peer?.photoURL };
      }
      return { displayName: "You" };
    };
  }, [otherId, peer]);

  const rawMessages: ThreadMessage[] = (messages || []).map((m: any) => ({
    id: m.id,
    senderId: m.senderId,
    text: m.text || "",
    attachments: m.attachments,
    reactions: m.reactions,
    replyTo: m.replyTo,
    createdAt: m.createdAt || Date.now(),
    deleted: m.deleted,
  }));

  const peerName = peer?.displayName || "Peer Connection";

  return (
    <GeneralInfoPanel
      title={peerName}
      subtitle={isOnline ? "Online" : "Offline"}
      icon={<PeerAvatar name={peerName} photoURL={peer?.photoURL} seed={otherId} className="w-5 h-5 text-[10px]" />}
      messages={rawMessages}
      resolveSender={resolveSender}
      onClose={onClose}
      about={
        <div className="flex flex-col items-center text-center p-6 rounded-3xl bg-gradient-to-b from-slate-50 to-white dark:from-white/[0.04] dark:to-[#161619] border border-slate-200/80 dark:border-white/10 shadow-2xs">
          <div className="relative mb-3.5">
            <PeerAvatar
              name={peerName}
              photoURL={peer?.photoURL}
              seed={otherId}
              className="w-20 h-20 text-2xl font-extrabold shadow-md ring-4 ring-white dark:ring-[#141417]"
            />
            <span
              className={cn(
                "absolute bottom-1 right-1 w-4 h-4 rounded-full ring-3 ring-white dark:ring-[#141417]",
                isOnline ? "bg-emerald-500" : "bg-slate-400"
              )}
            />
          </div>
          <h3 className="text-[17px] font-extrabold text-slate-900 dark:text-white tracking-tight">
            {peerName}
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1">
            {peer?.email || "Peer Connection"}
          </p>

          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border",
              isOnline
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20"
                : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 border-slate-200/60 dark:border-white/10"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              )}
            />
            <span>{isOnline ? "Active Now" : "Offline"}</span>
          </div>
        </div>
      }
    />
  );
}
