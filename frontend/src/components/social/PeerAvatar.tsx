import React, { useState } from 'react';
import { cn } from '../../lib/utils';

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

/** Deterministic tint from a stable seed (uid), so a user's fallback colour never changes. */
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * PeerAvatar that renders custom 3D avatar photoURL or falls back to a deterministic 3D character avatar
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
  // Otherwise use deterministic 3D character avatar seeded by their name/uid
  const default3DUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed || name || 'student')}`;
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
        className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#131314]"
        title="Online"
      />
    </span>
  );
}
