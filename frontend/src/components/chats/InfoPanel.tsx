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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useStudyGroup } from "../../hooks/api/useStudyGroups";
import { useGroupChannels, useChannelMessages } from "../../hooks/api/useGroupChannels";
import { useConversation } from "../../hooks/api/useDirectMessages";
import { useOnlineStatuses } from "../../hooks/usePresence";
import { PeerAvatar } from "../social/PeerAvatar";
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
}
interface LinkItem {
  url: string;
  host: string;
  by: string;
}

/** Pulls media (images), files (non-images) and links out of a message list, newest first. */
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
        if (a.kind === "image") media.push({ id: a.id, url: a.url, name: a.name });
        else files.push({ id: a.id, url: a.url, name: a.name, by });
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
    <div className="flex items-center justify-between mb-2.5">
      <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</h4>
      {count > 0 && (
        <button
          onClick={onToggle}
          className="text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {expanded ? "Show less" : "See all"}
        </button>
      )}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-[12px] text-slate-400 dark:text-gray-500">{text}</p>;
}

/**
 * The right-hand "General" panel, modelled on the workspace template: stacked Media files, Shared
 * files and Shared Links sections (all derived from the conversation's real messages), preceded by
 * a small About/members block for channels or a peer card for DMs.
 */
function GeneralInfoPanel({
  title,
  subtitle,
  icon,
  messages,
  resolveSender,
  about,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  messages: ThreadMessage[];
  resolveSender: (uid: string) => Sender;
  about?: React.ReactNode;
  onClose?: () => void;
}) {
  const { media, files, links } = useSharedContent(messages, resolveSender);
  const [mediaAll, setMediaAll] = useState(false);
  const [filesAll, setFilesAll] = useState(false);
  const [linksAll, setLinksAll] = useState(false);

  const shownMedia = mediaAll ? media : media.slice(0, 6);
  const shownFiles = filesAll ? files : files.slice(0, 4);
  const shownLinks = linksAll ? links : links.slice(0, 4);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111111] border-l border-slate-200 dark:border-white/5">
      <div className="shrink-0 flex items-center gap-2 px-4 h-14 border-b border-slate-100 dark:border-white/5">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0 text-slate-500">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate leading-tight">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 dark:text-gray-500 truncate uppercase tracking-wide">
              {subtitle}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-6">
        {about}

        {/* Media files */}
        <div>
          <SectionHead
            title="Media files"
            count={media.length}
            expanded={mediaAll}
            onToggle={() => setMediaAll((v) => !v)}
          />
          {media.length === 0 ? (
            <EmptyLine text="Images shared in this conversation appear here." />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {shownMedia.map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-white/5 hover:opacity-90 transition-opacity"
                  title={m.name}
                >
                  <img src={m.url} alt={m.name} loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Shared files */}
        <div>
          <SectionHead
            title="Shared files"
            count={files.length}
            expanded={filesAll}
            onToggle={() => setFilesAll((v) => !v)}
          />
          {files.length === 0 ? (
            <EmptyLine text="File attachments show up here." />
          ) : (
            <div className="space-y-1.5">
              {shownFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  download={f.name}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 truncate">{f.name}</p>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500">Download</p>
                  </div>
                  <Download className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Shared links */}
        <div>
          <SectionHead
            title="Shared Links"
            count={links.length}
            expanded={linksAll}
            onToggle={() => setLinksAll((v) => !v)}
          />
          {links.length === 0 ? (
            <EmptyLine text="Links posted in messages are collected here." />
          ) : (
            <div className="space-y-1.5">
              {shownLinks.map((l, i) => (
                <a
                  key={`${l.url}-${i}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <LinkIcon className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 truncate">{l.host}</p>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500 truncate">{l.url}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Right-hand panel for a group channel. */
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
  const { group } = useStudyGroup(groupId);
  const { channels } = useGroupChannels(groupId);
  const { messages, senders } = useChannelMessages(groupId, channelId);

  const channel = channels.find((c) => c.id === channelId);
  const members = group?.memberProfiles || [];
  const online = useOnlineStatuses(members.map((m) => m.uid));

  const resolveSender = (uid: string): Sender => {
    const s = senders[uid];
    if (s) return { displayName: s.displayName, photoURL: s.photoURL };
    const m = members.find((mm) => mm.uid === uid);
    if (m) return { displayName: m.displayName, photoURL: m.photoURL };
    if (uid === user?.uid) return { displayName: "You", photoURL: user?.photoURL || undefined };
    return { displayName: "Member" };
  };

  const createdByName = channel
    ? members.find((m) => m.uid === channel.createdBy)?.displayName ||
      (channel.createdBy === user?.uid ? "You" : "A member")
    : "";

  const about = !group ? (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 text-slate-300 dark:text-white/20 animate-spin" />
    </div>
  ) : (
    <div className="space-y-4">
      {(channel?.description || group.description) && (
        <p className="text-[12.5px] text-slate-600 dark:text-gray-300 leading-relaxed">
          {channel?.description || group.description}
        </p>
      )}
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-slate-400 dark:text-gray-500">Created by</span>
        <span className="font-medium text-slate-700 dark:text-gray-200">{createdByName}</span>
      </div>
      {channel && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-slate-400 dark:text-gray-500">Created</span>
          <span className="font-medium text-slate-700 dark:text-gray-200">{longDate(channel.createdAt)}</span>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">Members</h4>
          <span className="text-[11px] text-slate-400">{members.length}</span>
        </div>
        <div className="space-y-1.5">
          {members.slice(0, 8).map((m) => (
            <div key={m.uid} className="flex items-center gap-2.5">
              <PeerAvatar
                name={m.displayName}
                photoURL={m.photoURL}
                seed={m.uid}
                online={online.has(m.uid)}
                className="w-7 h-7 text-[10px]"
              />
              <span className="text-[12.5px] text-slate-700 dark:text-gray-200 truncate flex-1">
                {m.uid === user?.uid ? "You" : m.displayName}
              </span>
              {m.isOwner ? (
                <Crown className="w-3.5 h-3.5 text-amber-500" />
              ) : m.role === "admin" ? (
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <GeneralInfoPanel
      title={channel ? `# ${channel.name}` : "Channel"}
      subtitle={group?.name}
      icon={<Hash className="w-4 h-4" />}
      messages={messages as ThreadMessage[]}
      resolveSender={resolveSender}
      about={about}
      onClose={onClose}
    />
  );
}

/** Right-hand panel for a direct message. */
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
    <div className="flex flex-col items-center text-center pb-1">
      <PeerAvatar
        name={peer?.displayName}
        photoURL={peer?.photoURL}
        seed={otherId}
        online={isOnline}
        className="w-16 h-16 text-xl mb-3"
      />
      <p className="text-[15px] font-bold text-slate-900 dark:text-white">{peer?.displayName || "User"}</p>
      <p className="text-[12px] text-slate-400 dark:text-gray-500">{isOnline ? "Online" : "Offline"}</p>
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
