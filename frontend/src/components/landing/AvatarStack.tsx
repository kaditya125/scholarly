import { cn } from '../../lib/utils';

interface AvatarStackProps {
  className?: string;
  avatars?: string[];
}

const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&h=64&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&h=64&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=64&h=64&q=80',
];

export default function AvatarStack({ className, avatars }: AvatarStackProps) {
  // Use provided avatars, fallback to default if empty or not provided
  const displayAvatars = avatars && avatars.length > 0 ? avatars : DEFAULT_AVATARS;
  
  return (
    <div className={cn('flex -space-x-1.5 shrink-0', className)}>
      {displayAvatars.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`User ${i + 1}`}
          className="w-5 h-5 rounded-full border border-slate-50 dark:border-[#141416] object-cover shadow-sm bg-slate-200 dark:bg-slate-800"
          style={{ zIndex: displayAvatars.length - i }}
          onError={(e) => {
            // If a real profile pic fails to load, fallback to a default one
            (e.target as HTMLImageElement).src = DEFAULT_AVATARS[i % DEFAULT_AVATARS.length];
          }}
        />
      ))}
    </div>
  );
}
