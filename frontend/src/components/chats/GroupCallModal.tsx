import React, { useState, useEffect } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Volume1,
  Users,
  Maximize2,
  Minimize2,
  Radio,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface GroupCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  isGroup?: boolean;
}

export function GroupCallModal({
  isOpen,
  onClose,
  title,
  subtitle = "Live Group Study Room",
  isGroup = true,
}: GroupCallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState<"up" | "down" | "mute">("up");
  const [seconds, setSeconds] = useState(2280); // 38:00
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const sampleParticipants = [
    { name: "Cameron", role: "Aspirant", seed: "cameron", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80" },
    { name: "Aditya (You)", role: "Aspirant", seed: "aditya", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80" },
    { name: "Kiara", role: "Mentor", seed: "kiara", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80" },
    { name: "Jasmine", role: "Study Buddy", seed: "jasmine", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&auto=format&fit=crop&q=80" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div
        className={cn(
          "w-full bg-[#161619] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 relative",
          isFullscreen ? "h-full max-h-screen rounded-none" : "max-w-4xl h-[88vh] max-h-[780px]"
        )}
      >
        {/* Top Session Callout Banner */}
        <div className="px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-500/20 flex items-center justify-between text-[12.5px]">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span>Live study session connected: <strong>{title}</strong></span>
          </div>

          <div className="flex items-center gap-4 text-emerald-400 font-mono font-bold">
            <span>{formatTimer(seconds)}</span>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Video Grid Area */}
        <div className="flex-1 p-4 sm:p-6 flex flex-col gap-3 min-h-0 bg-[#0f0f12] overflow-hidden">
          {/* Main Speaker Stage */}
          <div className="flex-1 relative rounded-2xl overflow-hidden bg-slate-900 border border-white/10 flex items-center justify-center group">
            <img
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1200&auto=format&fit=crop&q=80"
              alt="Main speaker"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
            
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-white text-[12px] font-semibold">Kristin Watson (Presenter)</span>
            </div>

            {/* Self Camera PiP */}
            <div className="absolute top-4 right-4 w-28 sm:w-36 h-20 sm:h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl bg-slate-800">
              {isVideoOff ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-400 text-[11px]">
                  <VideoOff className="w-5 h-5 mb-1 text-slate-500" />
                  <span>Camera off</span>
                </div>
              ) : (
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80"
                  alt="You"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-semibold text-white">
                You
              </div>
            </div>

            <div className="absolute bottom-4 left-4 text-white">
              <p className="text-[14px] font-bold">Concept Review: Quantitative Aptitude & Kinematics</p>
              <p className="text-[11.5px] text-gray-300">Live whiteboard and interactive doubt clearing</p>
            </div>
          </div>

          {/* Bottom Participant Camera Strip */}
          <div className="h-24 sm:h-28 grid grid-cols-4 gap-2.5 shrink-0">
            {sampleParticipants.map((p, idx) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden bg-slate-800/90 border border-white/10 flex items-center justify-center group"
              >
                <img
                  src={p.avatar}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white truncate drop-shadow-md">
                    {p.name}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-xs" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Bottom Control Dock */}
        <div className="px-6 py-4 bg-[#141417] border-t border-white/10 flex items-center justify-center gap-3 sm:gap-4 shrink-0">
          {/* Mute toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all cursor-pointer",
              isMuted ? "text-rose-400 bg-rose-500/15" : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </div>
            <span className="text-[10.5px] font-medium">{isMuted ? "Unmute" : "Muted"}</span>
          </button>

          {/* Audio volume down */}
          <button
            onClick={() => setVolumeLevel("down")}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Volume1 className="w-4 h-4" />
            </div>
            <span className="text-[10.5px] font-medium">Down</span>
          </button>

          {/* Audio volume up */}
          <button
            onClick={() => setVolumeLevel("up")}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
            <span className="text-[10.5px] font-medium">Up</span>
          </button>

          {/* End Call Pill Button (Red) */}
          <button
            onClick={onClose}
            className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl text-white group transition-all cursor-pointer"
          >
            <div className="px-5 h-10 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 group-hover:scale-105 transition-transform">
              <PhoneOff className="w-4 h-4" />
              <span className="text-[12px] font-bold">End Call</span>
            </div>
            <span className="text-[10.5px] font-medium text-rose-400">Leave</span>
          </button>

          {/* Video Camera Toggle */}
          <button
            onClick={() => setIsVideoOff(!isVideoOff)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all cursor-pointer",
              isVideoOff ? "text-amber-400 bg-amber-500/15" : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </div>
            <span className="text-[10.5px] font-medium">{isVideoOff ? "Start Video" : "Video"}</span>
          </button>

          {/* People list toggle */}
          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10.5px] font-medium">People (5)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
