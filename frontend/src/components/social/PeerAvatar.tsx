import React, { useState } from 'react';
import { cn } from '../../lib/utils';

export const CINEMATIC_3D_AVATARS = [
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_1.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_2.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_3.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_4.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_5.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_6.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_7.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_8.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_9.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_10.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_11.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_12.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_13.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_14.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_15.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_16.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_17.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_18.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_19.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_20.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_21.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_22.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_23.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_24.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_25.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_26.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_27.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_28.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_29.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/memo_30.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_1.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_2.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_3.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_4.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_5.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_6.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_7.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_8.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_9.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_10.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_11.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_12.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_13.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_14.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_15.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_16.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_17.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_18.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_19.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_20.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_21.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_22.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_23.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_24.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_25.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_26.png',
  'https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_27.png',
];

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-fuchsia-500',
  'bg-cyan-500',
  'bg-sky-500',
];

/** Up to two initials from a display name. */
export function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic 3D Cinematic Avatar from seed */
export function getDeterministic3DAvatar(seed?: string, name?: string): string {
  const str = seed || name || 'student';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return CINEMATIC_3D_AVATARS[h % CINEMATIC_3D_AVATARS.length];
}

/** Deterministic tint from a stable seed (uid) */
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * PeerAvatar that renders ultra-realistic cinematic 3D cartoon avatars by default
 */
export function PeerAvatar({
  name,
  photoURL,
  seed,
  className,
  online,
}: {
  name?: string;
  photoURL?: string;
  seed?: string;
  className?: string;
  online?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  // If user provided a photoURL, use that.
  // Otherwise use deterministic ultra-realistic 3D cartoon character avatar
  const default3DUrl = getDeterministic3DAvatar(seed, name);
  const effectiveSrc = photoURL || default3DUrl;

  const avatar = !imgError ? (
    <img
      src={effectiveSrc}
      alt={name || 'User'}
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={cn('rounded-full object-cover shrink-0 bg-slate-100 dark:bg-white/10 shadow-2xs', className)}
      loading="lazy"
    />
  ) : (
    <div
      aria-hidden
      className={cn(
        'rounded-full shrink-0 flex items-center justify-center font-semibold text-white select-none',
        colorFor(seed || name || '?'),
        className
      )}
    >
      {initials(name)}
    </div>
  );

  if (!online) return avatar;
  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span
        className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131314]"
        title="Online"
      />
    </span>
  );
}
