import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Search,
  MessageSquare,
  Hash,
  ExternalLink,
  Trash2,
  Loader2,
  Mic,
  ImageIcon,
  FileText,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSavedMessages } from '../../hooks/api/useSavedMessages';
import { MessageAttachments } from './MessageAttachments';
import { PeerAvatar } from './PeerAvatar';
import { shortAgo, clockTime, dayLabel } from '../chats/format';

type FilterCategory = 'all' | 'audio' | 'diagram' | 'file';

export function SavedMessagesView() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');

  const { savedMessages, isLoading, remove } = useSavedMessages({
    q: search || undefined,
    category: category !== 'all' ? category : undefined,
  });

  const jumpToSource = (item: any) => {
    if (item.sourceType === 'dm' && item.peerUid) {
      navigate(`/community?tab=chats&dm=${item.peerUid}`);
    } else if (item.sourceType === 'channel' && item.groupId && item.channelId) {
      navigate(`/community?tab=chats&g=${item.groupId}&c=${item.channelId}`);
    } else if (item.sourceType === 'discussion' && item.discussionId) {
      navigate(`/community?tab=discussions`);
    } else {
      navigate(`/community?tab=chats`);
    }
  };

  const CATEGORY_TABS: { id: FilterCategory; label: string; icon: React.ElementType }[] = [
    { id: 'all', label: 'All Notes', icon: Bookmark },
    { id: 'diagram', label: 'Diagrams & Images', icon: ImageIcon },
    { id: 'audio', label: 'Voice Notes', icon: Mic },
    { id: 'file', label: 'Documents & Files', icon: FileText },
  ];

  return (
    <div className="max-w-[960px] mx-auto py-6 px-4 md:px-6 font-sans space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#141416] p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Bookmark className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Saved Study Notes &amp; Formulas
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your personal revision vault of saved explanations, doubts, voice memos, and solution diagrams.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
            {savedMessages.length} {savedMessages.length === 1 ? 'item' : 'items'} saved
          </span>
        </div>
      </div>

      {/* Search & Category Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-full px-4 py-2 shadow-2xs focus-within:border-slate-400">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved solutions, formulas, questions..."
            className="w-full bg-transparent text-[13px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCategory(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shadow-2xs',
                  active
                    ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900'
                    : 'bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-[#8ba32b] dark:text-[#c8e558] animate-spin" />
        </div>
      ) : savedMessages.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-400">
            <Bookmark className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {search ? `No saved items matching "${search}"` : 'No saved messages yet'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {search
              ? 'Try another search keyword or clear filters.'
              : 'Save important exam formulas, doubts, solutions, or voice memos by clicking the "Save to Notes" action on any message.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {savedMessages.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 p-4 shadow-2xs hover:border-slate-300 dark:hover:border-white/20 transition-all space-y-3"
            >
              {/* Card Header: Sender & Source Metadata */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PeerAvatar
                    name={item.senderName}
                    seed={item.senderId}
                    className="w-8 h-8 text-xs shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                      {item.senderName}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span>{shortAgo(item.messageCreatedAt)}</span>
                      <span>•</span>
                      {item.sourceType === 'dm' ? (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-indigo-500" /> Direct Message
                        </span>
                      ) : item.sourceType === 'channel' ? (
                        <span className="flex items-center gap-1 truncate">
                          <Hash className="w-3 h-3 text-emerald-500" />
                          {item.groupName || 'Group'} / {item.channelName || 'channel'}
                        </span>
                      ) : (
                        <span>Discussion Post</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top Actions: Jump to conversation & Unsave */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => jumpToSource(item)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 transition-colors cursor-pointer"
                    title="Jump to original conversation"
                  >
                    <span>View in Chat</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => remove(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Remove from saved notes"
                    aria-label="Remove from saved notes"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Message Content: Attachments & Text */}
              <div className="space-y-2 pt-1">
                {item.attachments && item.attachments.length > 0 && (
                  <MessageAttachments attachments={item.attachments} />
                )}
                {item.text && (
                  <p className="text-[13.5px] leading-relaxed text-slate-800 dark:text-gray-200 whitespace-pre-wrap">
                    {item.text}
                  </p>
                )}
              </div>

              {/* Footer: Saved watermark */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/5 text-[10.5px] text-slate-400">
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <Bookmark className="w-3 h-3 fill-current" /> Saved to revision vault
                </span>
                <span>Saved {shortAgo(item.savedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
