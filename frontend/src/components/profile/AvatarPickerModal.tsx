import React, { useState } from "react";
import { X, Sparkles, Check, RefreshCw, Wand2, User, Upload, ArrowRight } from "lucide-react";
import { updateProfile } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import { cn } from "../../lib/utils";

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAvatar?: (url: string) => void;
}

const PRESET_3D_AVATARS = [
  { id: "alex", name: "Alex (Headset)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Alex&glasses=variant02&skinColor=f2d3b1" },
  { id: "maya", name: "Maya (Beanie)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Maya&hair=short01&skinColor=ecad80" },
  { id: "jordan", name: "Jordan (Tech)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Jordan&glasses=variant05&skinColor=9e5622" },
  { id: "sophia", name: "Sophia (Creative)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Sophia&hair=long02&skinColor=f2d3b1" },
  { id: "leo", name: "Leo (Gamer)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Leo&hair=short05&skinColor=d08b5b" },
  { id: "kiara", name: "Kiara (Scholar)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Kiara&hair=long05&skinColor=ecad80" },
  { id: "thomas", name: "Thomas (Thinker)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Thomas&hair=short02&skinColor=f2d3b1" },
  { id: "jasmine", name: "Jasmine (Artist)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Jasmine&hair=long03&skinColor=763900" },
  { id: "cameron", name: "Cameron (Books)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Cameron&glasses=variant01&skinColor=f2d3b1" },
  { id: "elena", name: "Elena (Coder)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Elena&glasses=variant03&skinColor=ecad80" },
  { id: "aryan", name: "Aryan (Engineer)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Aryan&hair=short03&skinColor=9e5622" },
  { id: "zoe", name: "Zoe (Explorer)", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Zoe&hair=long06&skinColor=f2d3b1" },
  { id: "bot1", name: "Cyber Student", url: "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Nova" },
  { id: "bot2", name: "AI Assistant", url: "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Quantum" },
  { id: "lore1", name: "Aria (Anime 3D)", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Aria" },
  { id: "lore2", name: "Kai (Anime 3D)", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Kai" },
];

const AVATAR_STYLES = [
  { id: "adventurer", label: "3D Adventurer" },
  { id: "lorelei", label: "3D Anime" },
  { id: "bottts-neutral", label: "3D Cyber Bot" },
  { id: "big-smile", label: "3D Cheerful" },
  { id: "personas", label: "3D Persona" },
];

export function AvatarPickerModal({ isOpen, onClose, onSelectAvatar }: AvatarPickerModalProps) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<"preset" | "generate">("preset");
  const [selectedUrl, setSelectedUrl] = useState<string>(user?.photoURL || PRESET_3D_AVATARS[0].url);
  const [prompt, setPrompt] = useState(user?.displayName || "Student");
  const [style, setStyle] = useState("adventurer");
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const generatedUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(prompt.trim() || "student")}`;

  const handleSaveAvatar = async (avatarUrl: string) => {
    setIsSaving(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          photoURL: avatarUrl,
        });
        await refreshUser();
      }
      if (onSelectAvatar) {
        onSelectAvatar(avatarUrl);
      }
      onClose();
    } catch (err) {
      console.error("Failed to update avatar:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-white dark:bg-[#161619] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden font-sans flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-[#186a52] dark:text-[#c8e558] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
                Choose Your 3D Profile Avatar
              </h3>
              <p className="text-[11.5px] text-slate-400 dark:text-gray-400">
                Select from our 3D character collection or create your own
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="px-6 pt-4 pb-2">
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-[12.5px] font-semibold">
            <button
              type="button"
              onClick={() => setTab("preset")}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer",
                tab === "preset"
                  ? "bg-white dark:bg-[#202024] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              3D Character Gallery
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("generate");
                setSelectedUrl(generatedUrl);
              }}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5",
                tab === "generate"
                  ? "bg-white dark:bg-[#202024] text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Generate 3D Avatar
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2">
          {tab === "preset" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 sm:grid-cols-4 gap-3">
                {PRESET_3D_AVATARS.map((avatar) => {
                  const isSelected = selectedUrl === avatar.url;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedUrl(avatar.url)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-2.5 rounded-2xl border transition-all cursor-pointer group",
                        isSelected
                          ? "bg-emerald-50/50 dark:bg-[#186a52]/15 border-[#186a52] dark:border-[#c8e558] ring-2 ring-[#186a52]/20 shadow-sm"
                          : "bg-slate-50/70 dark:bg-white/[0.02] border-slate-200/70 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20"
                      )}
                    >
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-white dark:bg-white/10 p-1 shadow-2xs group-hover:scale-105 transition-transform">
                        <img
                          src={avatar.url}
                          alt={avatar.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#186a52]/20 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-[#186a52] text-white flex items-center justify-center shadow-xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-[10.5px] font-bold text-slate-700 dark:text-gray-300 truncate w-full text-center">
                        {avatar.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Live 3D Preview Box */}
              <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5">
                <div className="w-24 h-24 rounded-3xl bg-white dark:bg-white/10 p-2 shadow-md ring-4 ring-white dark:ring-white/5 flex items-center justify-center overflow-hidden mb-3">
                  <img
                    src={generatedUrl}
                    alt="Generated 3D Avatar"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                  3D Custom {style.charAt(0).toUpperCase() + style.slice(1)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
                  Generated in real-time
                </p>
              </div>

              {/* Custom Prompt / Seed Input */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-700 dark:text-gray-300">
                  Avatar Name or Prompt
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      setSelectedUrl(`https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(e.target.value || "student")}`);
                    }}
                    placeholder="e.g. Thomas, Maya, Scholar, Superhero..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#18181b] text-[13px] text-slate-900 dark:text-white outline-none focus:border-[#186a52] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const randomSeeds = ["Champion", "SuperStar", "Einstein", "ScholarX", "PixelNinja", "Maverick", "Sage", "Hero"];
                      const rnd = randomSeeds[Math.floor(Math.random() * randomSeeds.length)] + Math.floor(Math.random() * 100);
                      setPrompt(rnd);
                      setSelectedUrl(`https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(rnd)}`);
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#18181b] text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="Randomize avatar"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Style Selector */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-700 dark:text-gray-300">
                  Avatar Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {AVATAR_STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setStyle(st.id);
                        setSelectedUrl(`https://api.dicebear.com/7.x/${st.id}/svg?seed=${encodeURIComponent(prompt || "student")}`);
                      }}
                      className={cn(
                        "py-2 px-3 rounded-xl border text-[11.5px] font-bold transition-all cursor-pointer text-center",
                        style === st.id
                          ? "bg-[#186a52] text-white dark:bg-[#c8e558] dark:text-slate-900 border-transparent shadow-xs"
                          : "bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-gray-300 border-slate-200/70 dark:border-white/5 hover:border-slate-300"
                      )}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-between p-4 px-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-[12.5px] font-bold text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveAvatar(tab === "generate" ? generatedUrl : selectedUrl)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12.5px] font-bold bg-[#186a52] text-white hover:bg-[#125340] dark:bg-[#c8e558] dark:text-slate-900 dark:hover:bg-[#b5d342] shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <span>{isSaving ? "Saving..." : "Set as 3D Profile Avatar"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
