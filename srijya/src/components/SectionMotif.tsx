/**
 * Small line motifs beside the argument sections.
 *
 * WHAT THESE ARE FOR, AND WHERE THEY STOP
 *
 * The seedling beside the company name works because it says something the
 * words do not. These do the same job for the sections that carry the argument:
 * the four stages, what gets built, what it is built with, and what "good" means
 * once it ships.
 *
 * They deliberately do NOT go beside every label on the site. Most labels here
 * are field names in definition lists — "Email", "Based in", "Registered",
 * "Role" — and an animated icon next to those is decoration pretending to be
 * meaning. A site with a glyph beside every heading is the agency template this
 * one was built to not look like.
 *
 * SAME FAMILY AS EVERYTHING ELSE
 *
 * 24-unit grid, single weight, `currentColor`, square-ish geometry — the mark in
 * Logo.tsx, the seedling and these all read as one hand.
 *
 * ANIMATION
 *
 * Each motif animates when its section scrolls into view, driven by the
 * `data-revealed` attribute the existing IntersectionObserver already sets. No
 * second observer, no scroll listener. As with the seedling, the resting state
 * is the finished drawing: the animation only ever runs from hidden to drawn, so
 * nothing that fails to fire can subtract the shape.
 */

export type MotifName = 'process' | 'build' | 'technology' | 'measure';

export default function SectionMotif({
  name,
  size = 22,
  className = '',
}: {
  name: MotifName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`motif motif-${name} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {name === 'process' ? (
        <>
          {/* Four stages on a rail — the same shape as the section it sits on. */}
          <path d="M3 12h18" className="motif-rail" pathLength={1} />
          <circle cx="4.6" cy="12" r="1.5" className="motif-node motif-node-1" />
          <circle cx="9.5" cy="12" r="1.5" className="motif-node motif-node-2" />
          <circle cx="14.4" cy="12" r="1.5" className="motif-node motif-node-3" />
          <circle cx="19.3" cy="12" r="1.5" className="motif-node motif-node-4" />
        </>
      ) : null}

      {name === 'build' ? (
        <>
          {/* Courses of a wall, laid bottom up. Not a stack of cards — the
              lower ones are wider because they carry the ones above. */}
          <path d="M3.5 18.5h17" className="motif-course motif-course-1" pathLength={1} />
          <path d="M5.5 13.5h13" className="motif-course motif-course-2" pathLength={1} />
          <path d="M7.5 8.5h9" className="motif-course motif-course-3" pathLength={1} />
          <path d="M12 6V4.5" className="motif-course motif-course-4" pathLength={1} />
        </>
      ) : null}

      {name === 'technology' ? (
        <>
          {/* Three things joined. The edges draw before the nodes land, because
              what matters here is the connection rather than the parts. */}
          <path d="M6 17.5 12 6.5l6 11" className="motif-edge" pathLength={1} />
          <path d="M6 17.5h12" className="motif-edge motif-edge-2" pathLength={1} />
          <circle cx="12" cy="6.5" r="1.6" className="motif-node motif-node-1" />
          <circle cx="6" cy="17.5" r="1.6" className="motif-node motif-node-2" />
          <circle cx="18" cy="17.5" r="1.6" className="motif-node motif-node-3" />
        </>
      ) : null}

      {name === 'measure' ? (
        <>
          {/* A rule. The section is about properties you can check after the
              thing ships, and this is the object you check them with. */}
          <path d="M3 15h18" className="motif-rail" pathLength={1} />
          <path d="M6.5 15v-3" className="motif-tick motif-tick-1" pathLength={1} />
          <path d="M12 15V9.5" className="motif-tick motif-tick-2" pathLength={1} />
          <path d="M17.5 15v-3" className="motif-tick motif-tick-3" pathLength={1} />
        </>
      ) : null}
    </svg>
  );
}
