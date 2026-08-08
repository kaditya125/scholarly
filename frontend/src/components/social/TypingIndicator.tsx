import { TypingUser } from '../../hooks/useTyping';

/** Animated "… is typing" line. Renders nothing when no one is typing. */
export function TypingIndicator({ users, className }: { users: TypingUser[]; className?: string }) {
  if (users.length === 0) return null;

  const label =
    users.length === 1
      ? `${users[0].name} is typing`
      : users.length === 2
      ? `${users[0].name} and ${users[1].name} are typing`
      : `${users[0].name} and ${users.length - 1} others are typing`;

  return (
    <div
      className={`flex items-center gap-2 px-1 pb-1 text-[12px] text-slate-400 dark:text-gray-500 ${className || ''}`}
    >
      <span className="flex gap-0.5 items-end">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce" />
      </span>
      {label}…
    </div>
  );
}
