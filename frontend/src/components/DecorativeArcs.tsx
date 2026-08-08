import { cn } from "../lib/utils";

/**
 * Decorative animated arcs used as a subtle brand backdrop across the app — the same motif as the
 * dashboard hero, pinned to the top-right of the page. The `.arc-line` draw animation lives in
 * index.css. Rendered behind page content (keep siblings at a higher stacking level).
 */
export function DecorativeArcs({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute top-0 right-0 w-[55%] h-[340px] pointer-events-none overflow-hidden opacity-60 dark:opacity-30",
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 800 420" fill="none" className="w-full h-full" preserveAspectRatio="xMaxYMin slice">
        <path d="M350 -60 Q620 80 780 340" stroke="#4285F4" strokeWidth="8" strokeLinecap="round" fill="none" className="arc-line" />
        <path d="M500 -80 Q720 60 820 260" stroke="#FBBC04" strokeWidth="8" strokeLinecap="round" fill="none" className="arc-line arc-line-delay-1" />
        <path d="M300 120 Q580 200 820 400" stroke="#34A853" strokeWidth="8" strokeLinecap="round" fill="none" className="arc-line arc-line-delay-2" />
        <path d="M450 -40 Q560 30 640 180" stroke="#EA4335" strokeWidth="6" strokeLinecap="round" fill="none" className="arc-line arc-line-delay-3" opacity="0.5" />
      </svg>
    </div>
  );
}
