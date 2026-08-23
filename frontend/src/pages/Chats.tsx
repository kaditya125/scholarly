import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, MessagesSquare, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { useStudyGroups } from "../hooks/api/useStudyGroups";
import { useConversations } from "../hooks/api/useDirectMessages";
import { useGroupChannels } from "../hooks/api/useGroupChannels";
import { ChatsSidebar, ChatsSelection } from "../components/chats/ChatsSidebar";
import { DmThread } from "../components/chats/DmThread";
import { ChannelThread } from "../components/chats/ChannelThread";
import { ChannelInfoPanel, DmInfoPanel } from "../components/chats/InfoPanel";
import { StudyCircle } from "../components/study-groups/StudyCircle";

/**
 * The unified messaging hub: one place for direct messages, study-group channels, and the AI Study
 * Circle. Three columns on desktop (conversation rail · active thread · info panel); on smaller
 * screens the rail and thread swap, and the info panel becomes a drawer. Selection lives in the URL
 * (?dm= / ?g=&c= / ?ai=) so conversations are deep-linkable.
 */
export default function Chats() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { groups } = useStudyGroups();
  const { conversations } = useConversations();

  const dm = params.get("dm") || undefined;
  const g = params.get("g") || undefined;
  const c = params.get("c") || undefined;
  const ai = params.get("ai") || undefined;

  // Preserve the Community hub's ?tab= when we update our own selection params, so switching
  // conversations doesn't kick the user out of the Chats tab.
  const withTab = (next: Record<string, string>) => {
    const tab = params.get("tab");
    return tab ? { ...next, tab } : next;
  };

  const selection: ChatsSelection = ai
    ? { kind: "ai", groupId: ai }
    : g && c
    ? { kind: "channel", groupId: g, channelId: c }
    : dm
    ? { kind: "dm", dmUid: dm }
    : { kind: null };

  const activeGroupId = selection.groupId;
  const activeGroup = useMemo(() => groups.find((gr) => gr.id === activeGroupId), [groups, activeGroupId]);
  const { channels } = useGroupChannels(activeGroupId);
  const activeChannel = channels.find((ch) => ch.id === selection.channelId);
  const isAdmin =
    !!activeGroup &&
    (activeGroup.ownerId === user?.uid ||
      activeGroup.members.find((m) => m.userId === user?.uid)?.role === "admin");

  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [infoOpen, setInfoOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );

  // Reset transient view state on mobile whenever the active conversation changes.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setInfoOpen(false);
    }
  }, [dm, g, c, ai]);

  // Default selection: prefer the most recent DM on desktop, else the first group.
  // On mobile screens (< 768px), keep list open by default (just like WhatsApp).
  useEffect(() => {
    if (selection.kind !== null) return;
    if (typeof window !== "undefined" && window.innerWidth < 768) return;

    if (conversations.length > 0) {
      setParams(withTab({ dm: conversations[0].peer.uid }), { replace: true });
    } else if (groups.length > 0) {
      setParams(withTab({ g: groups[0].id }), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.kind, conversations.length, groups.length]);

  // When a group is chosen without a channel, land on its default (or first) channel.
  useEffect(() => {
    if (g && !c && !ai && channels.length > 0) {
      const target = channels.find((ch) => ch.isDefault) || channels[0];
      setParams(withTab({ g, c: target.id }), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, c, ai, channels.length]);

  const selectDm = (uid: string) => {
    setParams(withTab({ dm: uid }));
    setMobilePane("thread");
  };
  const selectChannel = (groupId: string, channelId: string) => {
    setParams(withTab({ g: groupId, c: channelId }));
    setMobilePane("thread");
  };
  const openAssistant = (groupId: string) => {
    setParams(withTab({ ai: groupId }));
    setMobilePane("thread");
  };
  const closeAssistant = () => {
    const target = channels.find((ch) => ch.isDefault) || channels[0];
    if (activeGroupId && target) setParams(withTab({ g: activeGroupId, c: target.id }));
    else setParams(withTab({}));
  };

  const handleBack = () => {
    setMobilePane("list");
    setParams(withTab({}));
  };

  const hasInfo = selection.kind === "channel" || selection.kind === "dm";

  const center = (() => {
    if (selection.kind === "channel") {
      if (!activeChannel) {
        return (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#131314]">
            <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        );
      }
      return (
        <ChannelThread
          key={`${activeGroupId}:${activeChannel.id}`}
          groupId={activeGroupId as string}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          groupName={activeGroup?.name || "Group"}
          isAdmin={isAdmin}
          onBack={handleBack}
          onOpenInfo={() => setInfoOpen((prev) => !prev)}
          onOpenAI={() => openAssistant(activeGroupId as string)}
          isInfoOpen={infoOpen}
        />
      );
    }
    if (selection.kind === "dm" && dm) {
      return (
        <DmThread
          key={dm}
          otherId={dm}
          onBack={handleBack}
          onOpenInfo={() => setInfoOpen((prev) => !prev)}
          isInfoOpen={infoOpen}
        />
      );
    }
    if (selection.kind === "ai" && activeGroupId) {
      return (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#131314]">
          <div className="shrink-0 flex items-center gap-2.5 px-4 h-14 border-b border-slate-100 dark:border-slate-800/60">
            <button
              onClick={() => (mobilePane === "thread" ? setMobilePane("list") : closeAssistant())}
              className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate leading-tight">
                Study Circle AI
              </p>
              <p className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate">
                {activeGroup?.name || "Study group"}
              </p>
            </div>
          </div>
          <StudyCircle groupId={activeGroupId} isAdmin={isAdmin} />
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 bg-[#fafbfc] dark:bg-[#0b0b0c] font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#141416] shadow-2xs space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mx-auto border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
            <MessagesSquare className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
              Connect with Study Circles &amp; Peers
            </h3>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
              Select a conversation from the sidebar or start a new direct message to collaborate with classmates.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setParams({ tab: "people" })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <span>Find Classmates</span>
            </button>
            <button
              onClick={() => setParams({ tab: "discussions" })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span>Explore Discussions</span>
            </button>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-50 dark:bg-[#131314]">
      {/* Left rail */}
      <ChatsSidebar
        selection={selection}
        onSelectDm={selectDm}
        onSelectChannel={selectChannel}
        onOpenAssistant={openAssistant}
        className={cn(
          "w-full md:w-[300px] shrink-0",
          mobilePane === "thread" ? "hidden md:flex" : "flex"
        )}
      />

      {/* Center thread */}
      <div className={cn("flex-1 min-w-0", mobilePane === "thread" ? "flex" : "hidden md:flex")}>
        {center}
      </div>

      {/* Right info panel (desktop collapsible) */}
      {hasInfo && infoOpen && (
        <div className="hidden lg:flex w-[340px] shrink-0 transition-all duration-300">
          {selection.kind === "channel" && activeChannel ? (
            <ChannelInfoPanel
              groupId={activeGroupId as string}
              channelId={activeChannel.id}
              onClose={() => setInfoOpen(false)}
            />
          ) : selection.kind === "dm" && dm ? (
            <DmInfoPanel otherId={dm} onClose={() => setInfoOpen(false)} />
          ) : null}
        </div>
      )}

      {/* Right info panel (mobile / tablet drawer) */}
      {hasInfo && infoOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setInfoOpen(false)} />
          <div className="ml-auto relative w-[340px] max-w-[85%] h-full shadow-2xl">
            {selection.kind === "channel" && activeChannel ? (
              <ChannelInfoPanel
                groupId={activeGroupId as string}
                channelId={activeChannel.id}
                onClose={() => setInfoOpen(false)}
              />
            ) : selection.kind === "dm" && dm ? (
              <DmInfoPanel otherId={dm} onClose={() => setInfoOpen(false)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
