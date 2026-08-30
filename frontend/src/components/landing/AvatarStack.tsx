import { cn } from '../../lib/utils';

interface AvatarStackProps {
  className?: string;
  avatars?: string[];
}

export default function AvatarStack({ className, avatars }: AvatarStackProps) {
  const displayAvatars = (avatars && avatars.length > 0) ? avatars.slice(0, 3) : [
    'https://lh3.googleusercontent.com/a/ACg8ocKAzheBPpqS7hokGk7Jph2pxnHPxEp7flbqQQ5k-7pj9yp5rus=s96-c',
    'https://lh3.googleusercontent.com/a/ACg8ocITomVr-Weu-QNw1_ZmRGs3EhmP_S7mQrbo916Hesp2yAf7WA=s96-c',
    'https://lh3.googleusercontent.com/a/ACg8ocLiiLcQtN9TguBm8svmA4TvWAth2gVXvIT4l9DErvCmM_QSgQ=s96-c'
  ];
  
  return (
    <div className={cn('flex -space-x-1 shrink-0 items-center', className)}>
      {displayAvatars.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`Scholar ${i + 1}`}
          width={16}
          height={16}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-4 h-4 rounded-full border border-white dark:border-[#131314] object-cover shadow-2xs bg-slate-200 dark:bg-slate-700 shrink-0"
          style={{ zIndex: displayAvatars.length - i }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=S&background=c8e558&color=0f172a&rounded=true&bold=true`;
          }}
        />
      ))}
    </div>
  );
}
