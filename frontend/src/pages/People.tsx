import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  Users,
  Sparkles,
  MoreHorizontal,
  UserMinus,
  UserX,
  ShieldOff,
  Loader2,
  Rss,
  Inbox,
  MessageCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useConnections, usePeopleSearch } from '../hooks/api/useConnections';
import { useOnlineStatuses } from '../hooks/usePresence';
import { connectionsApi, PeerCard } from '../lib/api/connections';
import { PeerAvatar } from '../components/social/PeerAvatar';

type Tab = 'discover' | 'requests' | 'network';

/** The one-line subtitle under a peer's name — goal first, then a sensible fallback. */
function subtitleFor(peer: PeerCard): string {
  if (peer.goal) return peer.goal;
  if (peer.stream) return peer.stream;
  if (peer.classLevel) return `Class ${peer.classLevel}`;
  if (peer.board) return peer.board;
  return peer.email || 'Scholarly learner';
}

export default function People() {
  const navigate = useNavigate();
  const {
    connections,
    requests,
    suggestions,
    isLoading,
    refetch,
    sendRequest,
    accept,
    decline,
    cancelRequest,
    removeConnection,
    follow,
    unfollow,
    block,
    unblock,
  } = useConnections();

  const [tab, setTab] = useState<Tab>('discover');
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Ensure the current user is discoverable by others on first visit, then refresh matches.
  useEffect(() => {
    let active = true;
    connectionsApi
      .sync()
      .then(() => {
        if (active) refetch();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search term so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const { results, isSearching, hasQuery } = usePeopleSearch(search);

  const trackedUids = useMemo(() => {
    const s = new Set<string>();
    suggestions.forEach((p) => s.add(p.uid));
    connections.forEach((p) => s.add(p.uid));
    requests.incoming.forEach((p) => s.add(p.uid));
    requests.outgoing.forEach((p) => s.add(p.uid));
    results.forEach((p) => s.add(p.uid));
    return [...s];
  }, [suggestions, connections, requests, results]);
  const onlineUids = useOnlineStatuses(trackedUids);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const run = async (id: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusyId(id);
    setMenuId(null);
    try {
      await fn();
      if (okMsg) notify(okMsg);
    } catch (e: any) {
      notify(e?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const onBlock = (peer: PeerCard) => {
    if (!window.confirm(`Block ${peer.displayName}? This removes any connection between you.`)) return;
    run(peer.uid, () => block(peer.uid), `${peer.displayName} blocked`);
  };

  const incomingCount = requests.incoming.length;

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'discover', label: 'Discover', icon: Sparkles },
    { id: 'requests', label: 'Requests', icon: Inbox, count: incomingCount },
    { id: 'network', label: 'My network', icon: Users, count: connections.length },
  ];

  // ─── Card ────────────────────────────────────────────────────────────────────
  const PeerCardView = ({ peer }: { peer: PeerCard }) => {
    const busy = busyId === peer.uid;
    const rel = peer.relationship;
    const reasons = (peer.matchReasons || []).slice(0, 3);

    return (
      <div className="relative bg-white dark:bg-[#141416] rounded-2xl p-4 border border-slate-200/90 dark:border-white/10 shadow-2xs flex flex-col font-sans">
        <div className="flex items-start gap-3">
          <PeerAvatar
            name={peer.displayName}
            photoURL={peer.photoURL}
            seed={peer.uid}
            online={onlineUids.has(peer.uid)}
            className="w-12 h-12 text-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                  {peer.displayName}
                </p>
                <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500 truncate">
                  {subtitleFor(peer)}
                </p>
              </div>

              {rel !== 'blocked' && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenuId(menuId === peer.uid ? null : peer.uid)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuId === peer.uid && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 top-8 z-20 w-48 rounded-xl bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 shadow-xl py-1 text-[12.5px]">
                        <button
                          onClick={() =>
                            run(
                              peer.uid,
                              () => (peer.isFollowing ? unfollow(peer.uid) : follow(peer.uid)),
                              peer.isFollowing ? 'Unfollowed' : `Following ${peer.displayName}`
                            )
                          }
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          <Rss className="w-3.5 h-3.5" />
                          {peer.isFollowing ? 'Unfollow' : 'Follow'}
                        </button>
                        <button
                          onClick={() =>
                            run(
                              peer.uid,
                              () => removeConnection(peer.uid),
                              'Removed from connections'
                            )
                          }
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                          <UserMinus className="w-3.5 h-3.5 text-slate-400" />
                          Remove connection
                        </button>
                        <button
                          onClick={() => onBlock(peer)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Block
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {reasons.map((r, i) => (
              <span
                key={i}
                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#8ba32b]/10 text-[#8ba32b] dark:bg-[#c8e558]/10 dark:text-[#c8e558] border border-[#8ba32b]/20 dark:border-[#c8e558]/20"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {peer.mutuals > 0 && (
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-2">
            {peer.mutuals} mutual connection{peer.mutuals > 1 ? 's' : ''}
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
          {rel === 'none' && (
            <button
              disabled={busy}
              onClick={() => run(peer.uid, () => sendRequest(peer.uid), 'Request sent')}
              className="flex-1 flex items-center justify-center gap-1.5 h-8.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[12px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Connect
            </button>
          )}

          {rel === 'outgoing' && (
            <button
              disabled={busy}
              onClick={() => run(peer.uid, () => cancelRequest(peer.uid), 'Request canceled')}
              className="flex-1 flex items-center justify-center gap-1.5 h-8.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 text-[12px] font-semibold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
              title="Cancel request"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Requested
            </button>
          )}

          {rel === 'incoming' && (
            <>
              <button
                disabled={busy}
                onClick={() => run(peer.uid, () => accept(peer.uid), 'Connected')}
                className="flex-1 flex items-center justify-center gap-1.5 h-8.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[12px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Accept
              </button>
              <button
                disabled={busy}
                onClick={() => run(peer.uid, () => decline(peer.uid))}
                className="h-8.5 px-3 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400 text-[12px] font-semibold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {rel === 'connected' && (
            <button
              onClick={() => navigate(`/community?tab=chats&dm=${peer.uid}`)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[12px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Message
            </button>
          )}

          {rel === 'blocked' && (
            <button
              disabled={busy}
              onClick={() => run(peer.uid, () => unblock(peer.uid), 'Unblocked')}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 text-[12.5px] font-bold hover:bg-slate-200 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              Unblock
            </button>
          )}
        </div>
      </div>
    );
  };

  const CardGrid = ({ peers }: { peers: PeerCard[] }) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {peers.map((p) => (
        <PeerCardView key={p.uid} peer={p} />
      ))}
    </div>
  );

  const EmptyState = ({
    icon: Icon,
    title,
    body,
    action,
  }: {
    icon: React.ElementType;
    title: string;
    body: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="max-w-md w-full p-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#141416] shadow-2xs space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mx-auto border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
          <Icon className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
        </div>
        {action && (
          <div className="pt-2">
            <button
              onClick={action.onClick}
              className="px-5 py-2 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[12px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const SkeletonGrid = () => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-[#141416] rounded-2xl p-4 border border-slate-200/80 dark:border-white/10 shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-white/10 animate-pulse" />
            </div>
          </div>
          <div className="h-9 mt-4 rounded-full bg-slate-100 dark:bg-white/5 animate-pulse" />
        </div>
      ))}
    </div>
  );

  const outgoing = requests.outgoing;
  const incoming = requests.incoming;

  const content = useMemo(() => {
    if (hasQuery) {
      if (isSearching) return <SkeletonGrid />;
      if (results.length === 0)
        return (
          <EmptyState
            icon={Search}
            title="No people found"
            body={`No one matches "${search}". Try a different name or email.`}
          />
        );
      return <CardGrid peers={results} />;
    }

    if (isLoading) return <SkeletonGrid />;

    if (tab === 'discover') {
      if (suggestions.length === 0)
        return (
          <EmptyState
            icon={Sparkles}
            title="No suggestions yet"
            body="Complete your learning profile — your goal, subjects and focus areas — so we can match you with the right study partners."
            action={{ label: 'Complete your profile', onClick: () => navigate('/profile') }}
          />
        );
      return <CardGrid peers={suggestions} />;
    }

    if (tab === 'requests') {
      if (incoming.length === 0 && outgoing.length === 0)
        return (
          <EmptyState
            icon={Inbox}
            title="No pending requests"
            body="When someone sends you a connection request, it'll show up here."
          />
        );
      return (
        <div className="space-y-8">
          {incoming.length > 0 && (
            <section>
              <h2 className="text-[13px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Incoming · {incoming.length}
              </h2>
              <CardGrid peers={incoming} />
            </section>
          )}
          {outgoing.length > 0 && (
            <section>
              <h2 className="text-[13px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Sent · {outgoing.length}
              </h2>
              <CardGrid peers={outgoing} />
            </section>
          )}
        </div>
      );
    }

    // network
    if (connections.length === 0)
      return (
        <EmptyState
          icon={Users}
          title="No connections yet"
          body="Discover study partners who share your goal and send your first connection request."
          action={{ label: 'Discover partners', onClick: () => setTab('discover') }}
        />
      );
    return <CardGrid peers={connections} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasQuery, isSearching, results, search, isLoading, tab, suggestions, incoming, outgoing, connections, busyId, menuId]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar font-sans bg-[#fafbfc] dark:bg-[#0b0b0c]">
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1100px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">People</h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              Find study partners who share your goal, subjects and focus areas.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search people by name or email..."
              className="w-full h-9 pl-9 pr-8 rounded-full bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-[12px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all shadow-2xs"
            />
            {rawSearch && (
              <button
                onClick={() => setRawSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[11px] font-bold"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tabs (hidden while searching) */}
        {!hasQuery && (
          <div className="flex items-center gap-1.5 mb-6">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer',
                    active
                      ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  {typeof t.count === 'number' && t.count > 0 && (
                    <span
                      className={cn(
                        'text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center',
                        active
                          ? 'bg-white/20 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {hasQuery && (
          <h2 className="text-[13px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Search results
          </h2>
        )}

        {content}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
