import { useMemo, useState } from 'react';
import { Loader2, Megaphone, MessageCircle, Send, CornerDownRight, X } from 'lucide-react';
import { useClassPosts, useClassPostMutations } from '../hooks/api/useClassPosts';
import type { ClassPost, PostKind } from '../lib/api/classPosts';
import { cn } from '../lib/utils';

/**
 * The announcements + discussion feed for a single class (Phase 3H).
 *
 * Shared between the teacher's class page and a student's expandable class row — the server
 * decides visibility (owner or ACTIVE member) and who may post an announcement, so this component
 * only needs to know which composer to offer: a teacher gets the announcement/discussion choice,
 * a student always posts discussion.
 */

function formatPostTime(value: unknown): string {
  let date: Date | null = null;
  if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else if (value && typeof value === 'object' && '_seconds' in (value as any)) {
    date = new Date((value as any)._seconds * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function PostBubble({
  post, isReply, onReply,
}: { post: ClassPost; isReply: boolean; onReply: () => void }) {
  return (
    <div className={cn('flex gap-2.5', isReply && 'ml-8')}>
      <span
        className={cn(
          'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[10.5px] font-semibold',
          post.authorRole === 'teacher'
            ? 'bg-[#c8e558]/25 text-[#5f7516] dark:text-[#c8e558]'
            : 'bg-slate-100 dark:bg-white/[0.08] text-slate-600 dark:text-gray-300',
        )}
      >
        {post.authorRole === 'teacher' ? 'T' : 'S'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-gray-200">
            {post.authorRole === 'teacher' ? 'Teacher' : 'Student'}
          </span>
          {post.kind === 'announcement' && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5f7516] dark:text-[#c8e558]">
              <Megaphone className="w-3 h-3" strokeWidth={2} aria-hidden /> Announcement
            </span>
          )}
          <span className="text-[11.5px] text-slate-400 dark:text-gray-500">{formatPostTime(post.createdAt)}</span>
        </div>
        {post.title && <p className="mt-0.5 text-[13.5px] font-semibold">{post.title}</p>}
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate-700 dark:text-gray-200 whitespace-pre-wrap">{post.body}</p>
        {!isReply && (
          <button
            onClick={onReply}
            className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <CornerDownRight className="w-3 h-3" strokeWidth={2} aria-hidden /> Reply
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClassFeed({ classId, viewerRole }: { classId: string; viewerRole: 'teacher' | 'student' }) {
  const { data: posts, isLoading, isError } = useClassPosts(classId);
  const { create } = useClassPostMutations(classId);

  const [kind, setKind] = useState<PostKind>('discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<ClassPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  const threads = useMemo(() => {
    const all = posts ?? [];
    const byParent = new Map<string, ClassPost[]>();
    for (const p of all) {
      if (!p.parentId) continue;
      const arr = byParent.get(p.parentId) ?? [];
      arr.push(p);
      byParent.set(p.parentId, arr);
    }
    const collect = (id: string, acc: ClassPost[]) => {
      for (const child of byParent.get(id) ?? []) {
        acc.push(child);
        collect(child.id, acc);
      }
    };
    return all
      .filter((p) => !p.parentId)
      .map((top) => {
        const replies: ClassPost[] = [];
        collect(top.id, replies);
        return { top, replies };
      });
  }, [posts]);

  const submit = async () => {
    setError(null);
    if (!body.trim()) return;
    try {
      await create.mutateAsync({
        kind: replyingTo ? 'discussion' : kind,
        title: kind === 'announcement' && !replyingTo ? title.trim() || undefined : undefined,
        body: body.trim(),
        parentId: replyingTo?.id ?? null,
      });
      setBody('');
      setTitle('');
      setReplyingTo(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That post could not be sent.');
    }
  };

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading…
        </div>
      )}
      {isError && <p className="text-[12.5px] text-red-700 dark:text-red-400 py-2">Couldn&rsquo;t load this class&rsquo;s discussion.</p>}
      {!isLoading && !isError && threads.length === 0 && (
        <p className="text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
          {viewerRole === 'teacher' ? 'Nothing posted yet — say hello.' : 'No announcements or discussion yet.'}
        </p>
      )}

      {threads.length > 0 && (
        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {threads.map(({ top, replies }) => (
            <div key={top.id} className="space-y-2.5">
              <PostBubble post={top} isReply={false} onReply={() => setReplyingTo(top)} />
              {replies.map((r) => (
                <PostBubble key={r.id} post={r} isReply onReply={() => setReplyingTo(top)} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 space-y-2">
        {error && <p className="text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}

        {replyingTo && (
          <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-gray-400">
            <CornerDownRight className="w-3 h-3" strokeWidth={2} aria-hidden />
            Replying to {replyingTo.authorRole === 'teacher' ? 'the teacher' : 'a student'}
            <button onClick={() => setReplyingTo(null)} className="ml-auto p-0.5 hover:text-slate-800 dark:hover:text-white">
              <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}

        {viewerRole === 'teacher' && !replyingTo && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setKind('discussion')}
              className={cn(
                'h-7 px-2.5 rounded-md text-[11.5px] font-medium border',
                kind === 'discussion' ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'border-slate-200 dark:border-white/12 text-slate-500 dark:text-gray-400',
              )}
            >
              <MessageCircle className="w-3 h-3 inline mr-1" strokeWidth={2} aria-hidden /> Discussion
            </button>
            <button
              onClick={() => setKind('announcement')}
              className={cn(
                'h-7 px-2.5 rounded-md text-[11.5px] font-medium border',
                kind === 'announcement' ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'border-slate-200 dark:border-white/12 text-slate-500 dark:text-gray-400',
              )}
            >
              <Megaphone className="w-3 h-3 inline mr-1" strokeWidth={2} aria-hidden /> Announcement
            </button>
          </div>
        )}

        {viewerRole === 'teacher' && kind === 'announcement' && !replyingTo && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            maxLength={160}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[13px]"
          />
        )}

        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              replyingTo ? 'Write a reply…' : viewerRole === 'teacher' && kind === 'announcement' ? "What's the announcement?" : 'Ask a question or start a discussion…'
            }
            rows={2}
            maxLength={4000}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[13px] resize-none"
          />
          <button
            onClick={submit}
            disabled={create.isPending || !body.trim()}
            className="self-end h-9 px-3.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Send className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
