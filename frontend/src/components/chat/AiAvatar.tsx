import React, { useState } from "react";
import { cn } from "../../lib/utils";

// Drop your avatar file here → frontend/public/ai-avatar.gif  (served at /ai-avatar.gif).
// Until it exists, the animated SVG bot below is shown as a graceful fallback.
const AVATAR_SRC = "/ai-avatar.gif";

/**
 * AI avatar for chat. Renders the GIF at /ai-avatar.gif; if that file isn't present
 * it falls back to a stylised animated bot face (looks down → reads → makes eye
 * contact → blinks → looks back down, looping). Colour follows currentColor (indigo).
 */
export default function AiAvatar({ className, src = AVATAR_SRC }: { className?: string; src?: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    // If it is the default AI avatar (which is red), shift its hue to indigo to match the theme
    const isRedAvatar = src === '/ai-avatar.gif';
    return (
      <img
        src={src}
        alt="AI"
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className={cn("inline-block object-contain rounded-full", className)}
        style={isRedAvatar ? { filter: 'hue-rotate(250deg)' } : undefined}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span className={cn("inline-block text-indigo-600 dark:text-indigo-400", className)}>
      <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible" aria-hidden="true">
        <g className="ai-avatar-head">
          <line x1="24" y1="9" x2="24" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="24" cy="3.4" r="2.3" fill="currentColor" />
          <circle cx="24" cy="27" r="15" fill="currentColor" />
          <circle cx="25.6" cy="25.6" r="10.6" fill="#fff" />
          <path d="M17 31 L12 37.5 L21.5 33 Z" fill="#fff" />
          <g className="ai-avatar-eyes">
            <circle cx="21.6" cy="25.6" r="2.05" fill="currentColor" />
            <circle cx="29.6" cy="25.6" r="2.05" fill="currentColor" />
          </g>
        </g>
      </svg>
    </span>
  );
}
