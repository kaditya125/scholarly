import { cn } from '../../lib/utils';

interface AvatarStackProps {
  className?: string;
  avatars?: string[];
}

export default function AvatarStack({ className, avatars }: AvatarStackProps) {
  // If avatars are empty, we just don't render anything, or we could render a default single generic avatar
  if (!avatars || avatars.length === 0) return null;
  
  return (
    <div className={cn('flex -space-x-1.5 shrink-0', className)}>
      {avatars.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`User ${i + 1}`}
          className="w-5 h-5 rounded-full border border-slate-50 dark:border-[#141416] object-cover shadow-sm bg-slate-200 dark:bg-slate-800"
          style={{ zIndex: avatars.length - i }}
          onError={(e) => {
            // If a real profile pic fails to load, fallback to a dynamic initial-based one
            // We use generic 'U' because we don't have the user's name here
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=U&background=random&color=000&rounded=true&bold=true`;
          }}
        />
      ))}
    </div>
  );
}
