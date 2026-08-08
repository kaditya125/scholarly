import React from "react";
import { cn } from "../../lib/utils";

interface Book3DProps {
  /** Front-cover content (fills the cover face) — usually a <BookCover />. */
  cover: React.ReactNode;
  /** Tailwind gradient classes for the spine, e.g. "from-blue-400 to-indigo-600". */
  spineGradient: string;
  /** Vertical text printed on the spine. */
  spineLabel: string;
  /** Optional overlay pinned to the top of the cover (e.g. a count/class badge). */
  badge?: React.ReactNode;
  width?: number;
  height?: number;
  depth?: number;
  className?: string;
}

/**
 * A hardback book rendered in real CSS 3D: a front cover, a coloured spine on the left with
 * vertical title text, and a back board giving it thickness — tilted in perspective and easing
 * toward the reader on hover, echoing the book-mockup aesthetic. The cover face accepts any node
 * (we pass the real book cover), so covers stay authentic while the object reads as a physical book.
 */
export function Book3D({
  cover,
  spineGradient,
  spineLabel,
  badge,
  width = 168,
  height = 226,
  depth = 32,
  className,
}: Book3DProps) {
  return (
    <div
      className={cn("group/b3d relative z-0 hover:z-20 [perspective:1600px] shrink-0", className)}
      style={{ width, height }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500 ease-out will-change-transform [transform:rotateY(-26deg)] group-hover/b3d:[transform:translateZ(55px)_translateY(-16px)_rotateY(-40deg)]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Back board — gives the book its thickness. */}
        <div
          className="absolute inset-0 rounded-r-lg bg-slate-800 dark:bg-black"
          style={{ transform: `translateZ(-${depth / 2}px)` }}
        />

        {/* Spine (left face) with vertical title. */}
        <div
          className={cn(
            "absolute top-0 left-0 h-full flex items-center justify-center overflow-hidden bg-gradient-to-b",
            spineGradient
          )}
          style={{ width: depth, transform: `translateX(-${depth / 2}px) rotateY(90deg)` }}
        >
          <span
            className="max-h-full overflow-hidden text-white/95 text-[9.5px] font-bold uppercase tracking-wider whitespace-nowrap px-1"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {spineLabel}
          </span>
          {/* spine creases */}
          <span className="absolute inset-y-0 left-0 w-px bg-white/25" />
          <span className="absolute inset-y-0 right-0 w-px bg-black/30" />
        </div>

        {/* Front cover. */}
        <div
          className="absolute inset-0 rounded-r-lg overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)]"
          style={{ transform: `translateZ(${depth / 2}px)` }}
        >
          {cover}
          {/* spine crease shadow along the bound (left) edge */}
          <span className="absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-black/45 via-black/10 to-transparent pointer-events-none" />
          {/* thin page edge along the right */}
          <span className="absolute inset-y-[3px] right-0 w-[3px] bg-gradient-to-l from-white/80 to-white/10 pointer-events-none" />
          {/* soft gloss */}
          <span className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 pointer-events-none" />
          {badge}
        </div>
      </div>

      {/* Ground shadow — grows and softens as the book lifts off the shelf. */}
      <div className="mx-auto mt-2 h-2.5 w-[72%] rounded-[50%] bg-black/30 blur-md transition-all duration-500 group-hover/b3d:mt-4 group-hover/b3d:w-[94%] group-hover/b3d:bg-black/25 group-hover/b3d:blur-lg" />
    </div>
  );
}
