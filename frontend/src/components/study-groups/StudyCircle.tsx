import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  Plus,
  BookOpen,
  Brain,
  MessageSquareText,
  AlertCircle,
  Network,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { useStudyCircle } from "../../hooks/api/useStudyCircle";
import type { CircleKnowledgeSource } from "../../lib/api/studyCircle";
import MarkdownMessage from "../chat/MarkdownMessage";
import { CircleConceptGraph } from "./CircleConceptGraph";

const SOURCE_OPTIONS: { value: CircleKnowledgeSource; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "summary", label: "Summary" },
  { value: "resource", label: "Resource" },
];

const SOURCE_LABEL: Record<CircleKnowledgeSource, string> = {
  note: "Note",
  summary: "Summary",
  resource: "Resource",
  message: "From chat",
};

const SUGGESTIONS = [
  "Summarize what our circle knows so far",
  "Quiz us on our weak areas",
  "Explain the hardest concept simply",
];

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface StudyCircleProps {
  groupId: string;
  isAdmin: boolean;
}

/**
 * The AI Study Circle for a group: a shared, streaming AI conversation grounded in a persistent,
 * member-curated knowledge base. Left column = conversation + ask composer; right column = the
 * knowledge base (add + list). Responsive: the two columns stack behind a switch on small screens.
 */
export function StudyCircle({ groupId, isAdmin }: StudyCircleProps) {
  const { user } = useAuth();
  const {
    knowledge,
    isLoadingKnowledge,
    chatTurns,
    ask,
    isStreaming,
    liveQuestion,
    liveAnswer,
    askError,
    addKnowledge,
    isAddingKnowledge,
    deleteKnowledge,
    concepts,
    isLoadingConcepts,
    synthesize,
    isSynthesizing,
  } = useStudyCircle(groupId);

  const [panel, setPanel] = useState<"chat" | "knowledge">("chat");
  const [mode, setMode] = useState<"assistant" | "graph">("assistant");
  const [question, setQuestion] = useState("");
  const [kTitle, setKTitle] = useState("");
  const [kText, setKText] = useState("");
  const [kSource, setKSource] = useState<CircleKnowledgeSource>("note");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chatTurns.length, liveAnswer, isStreaming]);

  const onAsk = async () => {
    const q = question.trim();
    if (!q || isStreaming) return;
    setQuestion("");
    await ask(q);
  };

  const onAddKnowledge = async () => {
    const text = kText.trim();
    if (!text || isAddingKnowledge) return;
    try {
      await addKnowledge({ text, title: kTitle.trim() || undefined, source: kSource });
      setKTitle("");
      setKText("");
      setKSource("note");
    } catch {
      /* keep the draft so the member can retry */
    }
  };

  const hasConversation = chatTurns.length > 0 || isStreaming;

  const knowledgeCount = knowledge.length;
  const emptyKnowledge = !isLoadingKnowledge && knowledgeCount === 0;

  const aiAvatar = (
    <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
      <Sparkles className="w-4 h-4" />
    </div>
  );

  const conversation = (
    <div className={cn("flex-1 min-w-0 flex-col", panel === "chat" ? "flex" : "hidden", "md:flex")}>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-5">
        {!hasConversation && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <p className="text-[15px] font-bold text-slate-900 dark:text-white mb-1.5">
              Ask your Study Circle
            </p>
            <p className="text-[12.5px] text-slate-400 dark:text-gray-500 max-w-xs mb-5 leading-relaxed">
              A shared AI companion grounded in your group's goals and the knowledge you add
              together. Everyone sees the conversation.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestion(s)}
                  className="text-left text-[12.5px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-500/40 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatTurns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%] md:max-w-[75%]">
                <div className="rounded-2xl rounded-br-md bg-indigo-600 text-white px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                  {turn.question}
                </div>
                <p className="text-[10.5px] text-slate-400 dark:text-gray-500 mt-1 text-right mr-1">
                  {turn.askedBy === user?.uid ? "You" : turn.askedByName || "Member"} ·{" "}
                  {clockTime(turn.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              {aiAvatar}
              <div className="min-w-0 flex-1 max-w-[85%] md:max-w-[75%]">
                <div className="rounded-2xl rounded-bl-md bg-slate-100 dark:bg-[#1e1e1f] px-4 py-3 text-[13.5px] leading-relaxed text-slate-800 dark:text-gray-100 prose-chat break-words overflow-x-auto">
                  <MarkdownMessage content={turn.answer} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="space-y-3">
            {liveQuestion && (
              <div className="flex justify-end">
                <div className="max-w-[85%] md:max-w-[75%]">
                  <div className="rounded-2xl rounded-br-md bg-indigo-600 text-white px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                    {liveQuestion}
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2.5">
              {aiAvatar}
              <div className="min-w-0 flex-1 max-w-[85%] md:max-w-[75%]">
                <div className="rounded-2xl rounded-bl-md bg-slate-100 dark:bg-[#1e1e1f] px-4 py-3 text-[13.5px] leading-relaxed text-slate-800 dark:text-gray-100 prose-chat break-words overflow-x-auto">
                  {liveAnswer ? (
                    <MarkdownMessage content={liveAnswer} />
                  ) : (
                    <span className="flex items-center gap-2 text-slate-400 dark:text-gray-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking with your circle…
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {askError && (
          <div className="flex gap-2.5">
            {aiAvatar}
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-3.5 py-2.5 text-[12.5px] text-rose-600 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {askError}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Ask composer */}
      <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/60 p-3">
        <div className="flex items-end gap-2 bg-slate-50 dark:bg-[#1C1C1E] rounded-2xl border border-slate-200 dark:border-white/10 px-3 py-2 focus-within:border-violet-400 dark:focus-within:border-violet-500/40 transition-colors">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onAsk();
              }
            }}
            rows={1}
            placeholder="Ask the Study Circle anything…"
            disabled={isStreaming}
            className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-slate-800 dark:text-gray-100 placeholder:text-slate-400 max-h-32 py-1 disabled:opacity-60"
          />
          <button
            onClick={onAsk}
            disabled={!question.trim() || isStreaming}
            className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Ask the Study Circle"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10.5px] text-slate-400 dark:text-gray-500 mt-1.5 px-1">
          Grounded in {knowledgeCount} shared {knowledgeCount === 1 ? "note" : "notes"} and your
          group's goals.
        </p>
      </div>
    </div>
  );

  const knowledgePanel = (
    <div
      className={cn(
        "w-full md:w-80 lg:w-96 shrink-0 flex-col md:border-l border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-black/10",
        panel === "knowledge" ? "flex" : "hidden",
        "md:flex"
      )}
    >
      <div className="shrink-0 px-4 py-3 border-b border-slate-100 dark:border-slate-800/60 flex items-center gap-2">
        <Brain className="w-4 h-4 text-violet-500" />
        <p className="text-[13px] font-bold text-slate-900 dark:text-white">Circle knowledge</p>
        <span className="ml-auto text-[11px] font-semibold text-slate-400 dark:text-gray-500 bg-slate-100 dark:bg-white/5 rounded-full px-2 py-0.5">
          {knowledgeCount}
        </span>
      </div>

      {/* Add-knowledge composer */}
      <div className="shrink-0 p-3 border-b border-slate-100 dark:border-slate-800/60 space-y-2">
        <input
          value={kTitle}
          onChange={(e) => setKTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full bg-white dark:bg-[#1C1C1E] rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] outline-none text-slate-800 dark:text-gray-100 placeholder:text-slate-400 focus:border-violet-400 dark:focus:border-violet-500/40 transition-colors"
        />
        <textarea
          value={kText}
          onChange={(e) => setKText(e.target.value)}
          rows={3}
          placeholder="Share a key fact, formula, summary, or resource for the whole circle…"
          className="w-full bg-white dark:bg-[#1C1C1E] rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] outline-none text-slate-800 dark:text-gray-100 placeholder:text-slate-400 resize-none focus:border-violet-400 dark:focus:border-violet-500/40 transition-colors"
        />
        <div className="flex items-center gap-2">
          <select
            value={kSource}
            onChange={(e) => setKSource(e.target.value as CircleKnowledgeSource)}
            className="bg-white dark:bg-[#1C1C1E] rounded-lg border border-slate-200 dark:border-white/10 px-2 py-1.5 text-[12px] outline-none text-slate-600 dark:text-gray-300 focus:border-violet-400 dark:focus:border-violet-500/40"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={onAddKnowledge}
            disabled={!kText.trim() || isAddingKnowledge}
            className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAddingKnowledge ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add
          </button>
        </div>
      </div>

      {/* Knowledge list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {isLoadingKnowledge && knowledgeCount === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-300 dark:text-white/20 animate-spin" />
          </div>
        ) : emptyKnowledge ? (
          <div className="flex flex-col items-center justify-center text-center py-8 px-4">
            <BookOpen className="w-8 h-8 text-slate-300 dark:text-white/15 mb-2" />
            <p className="text-[12px] text-slate-400 dark:text-gray-500 leading-relaxed">
              No shared knowledge yet. Add notes, summaries, and resources — the AI grounds every
              answer in them.
            </p>
          </div>
        ) : (
          knowledge.map((item) => {
            const canDelete = item.addedBy === user?.uid || isAdmin;
            return (
              <div
                key={item.id}
                className="group rounded-xl bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {item.title && (
                      <p className="text-[12.5px] font-bold text-slate-900 dark:text-white mb-0.5 break-words">
                        {item.title}
                      </p>
                    )}
                    <p className="text-[12.5px] text-slate-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                      {item.text}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => deleteKnowledge(item.id)}
                      className="shrink-0 p-1 rounded-md text-slate-300 dark:text-gray-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 md:opacity-0 md:group-hover:opacity-100 transition-all"
                      aria-label="Remove knowledge"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-slate-400 dark:text-gray-500">
                  <span className="rounded-full bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 font-semibold">
                    {SOURCE_LABEL[item.source]}
                  </span>
                  <span className="truncate">
                    {item.addedBy === user?.uid ? "You" : item.addedByName || "Member"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Mode tabs: Assistant vs Concept map */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800/60">
        <button
          onClick={() => setMode("assistant")}
          className={cn(
            "flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold transition-colors",
            mode === "assistant"
              ? "bg-violet-600 text-white"
              : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/15"
          )}
        >
          <Sparkles className="w-3.5 h-3.5" /> Assistant
        </button>
        <button
          onClick={() => setMode("graph")}
          className={cn(
            "flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-semibold transition-colors",
            mode === "graph"
              ? "bg-violet-600 text-white"
              : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/15"
          )}
        >
          <Network className="w-3.5 h-3.5" /> Concept map
        </button>
      </div>

      {mode === "graph" ? (
        <CircleConceptGraph
          concepts={concepts}
          isLoading={isLoadingConcepts}
          isSynthesizing={isSynthesizing}
          onSynthesize={() => synthesize()}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
      {/* Mobile switch between conversation and knowledge */}
      <div className="md:hidden shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800/60">
        <button
          onClick={() => setPanel("chat")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12.5px] font-semibold transition-colors",
            panel === "chat"
              ? "bg-violet-600 text-white"
              : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300"
          )}
        >
          <MessageSquareText className="w-3.5 h-3.5" /> Ask
        </button>
        <button
          onClick={() => setPanel("knowledge")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12.5px] font-semibold transition-colors",
            panel === "knowledge"
              ? "bg-violet-600 text-white"
              : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300"
          )}
        >
          <Brain className="w-3.5 h-3.5" /> Knowledge ({knowledgeCount})
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {conversation}
        {knowledgePanel}
      </div>
        </div>
      )}
    </div>
  );
}
