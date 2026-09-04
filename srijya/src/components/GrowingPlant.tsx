/**
 * The seedling, at a size that can carry real structure.
 *
 * The mark beside the company name is four strokes at 34px, because that is all
 * that survives at 34px. This is the same idea given room: broken ground with a
 * little texture, a seed sitting in it, a taproot with laterals, a stem that
 * wavers, two seed leaves, two pairs of true leaves with midribs and lateral
 * veins, and a furled tip that has not opened yet.
 *
 * WHY IT IS STILL LINE WORK
 *
 * "Realistic" here means botanically right, not photographic. The order is what
 * makes it read as a plant rather than a plant-shaped graphic: root before
 * shoot, cotyledons before true leaves, veins on the leaves that are actually
 * leaves. A rendered or shaded illustration would be more literal and would look
 * pasted onto a site made entirely of hairlines.
 *
 * The tip is deliberately unopened. The page it sits on is about a company that
 * says it is emerging rather than established, and a finished plant would
 * contradict the paragraph beside it.
 *
 * FAILURE BEHAVIOUR
 *
 * As with every other mark here, the resting state is the finished drawing. The
 * growth sequence lives inside `prefers-reduced-motion: no-preference` and runs
 * hidden -> drawn with `backwards` fill, so an animation that never fires leaves
 * a whole plant rather than a seed.
 */
export default function GrowingPlant({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 300"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`plant h-auto w-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Ground, broken either side of the stem. */}
      <path d="M18 250h54M108 250h54" className="plant-soil" pathLength={1} />
      <g className="plant-grit" opacity={0.5}>
        <path d="M34 254l-3 6" pathLength={1} />
        <path d="M58 255l-2 5" pathLength={1} />
        <path d="M122 254l3 6" pathLength={1} />
        <path d="M146 255l2 5" pathLength={1} />
      </g>

      {/* The seed, tilted, sitting in the soil rather than on it. */}
      <ellipse cx="90" cy="250" rx="7" ry="5.4" transform="rotate(-12 90 250)" className="plant-seed" />

      {/* Root before shoot. A taproot with three laterals — the thing every
          plant icon leaves out, and the half that does the work. */}
      <path d="M90 256c0 12-3 22-6 36" className="plant-root plant-root-0" pathLength={1} />
      <path d="M89 266c-5 4-11 6-18 7" className="plant-root plant-root-1" pathLength={1} />
      <path d="M90.5 276c5.5 3 10.5 5 16.5 6" className="plant-root plant-root-2" pathLength={1} />
      <path d="M88 286c-4 3-8 5-12 7" className="plant-root plant-root-3" pathLength={1} />

      {/* Stem. Wavers, and thins as it rises — nothing that grew is a ruler. */}
      <path
        d="M90 246c-2-26 2-46 0-70s2-48 0-72c-1-16 0-28 0-42"
        className="plant-stem"
        pathLength={1}
      />

      {/* Cotyledons — the seed's own halves. Small, low, and unequal. */}
      <g className="plant-cot plant-cot-1">
        <path d="M89 218c-15 2-27-5-31-18 14-4 27 4 31 18Z" />
      </g>
      <g className="plant-cot plant-cot-2">
        <path d="M91 210c15-2 27-10 30-23-14-3-27 6-30 23Z" />
      </g>

      {/* First true leaves, with a midrib and two laterals each. The veins are
          most of what separates a leaf from a petal. */}
      <g className="plant-leaf plant-leaf-1">
        <path d="M89 169c-20 4-37-5-43-22 19-6 36 4 43 22Z" />
        <path d="M89 169c-11-6-22-12-35-18" opacity={0.5} />
        <path d="M77 162l-7-8" opacity={0.4} />
        <path d="M68 157l-6-7" opacity={0.4} />
      </g>
      <g className="plant-leaf plant-leaf-2">
        <path d="M91 159c20 2 37-8 42-25-19-5-35 7-42 25Z" />
        <path d="M91 159c11-7 22-13 33-19" opacity={0.5} />
        <path d="M104 151l6-8" opacity={0.4} />
        <path d="M113 146l6-7" opacity={0.4} />
      </g>

      {/* Second pair, higher and slightly smaller — still opening. */}
      <g className="plant-leaf plant-leaf-3">
        <path d="M89 120c-17 4-31-4-36-19 16-5 30 4 36 19Z" />
        <path d="M89 120c-9-6-19-11-29-15" opacity={0.5} />
      </g>
      <g className="plant-leaf plant-leaf-4">
        <path d="M91 112c17-2 31-11 35-26-16-4-29 7-35 26Z" />
        <path d="M91 112c9-6 19-12 28-16" opacity={0.5} />
      </g>

      {/* The tip, still furled. This company is emerging, not finished, and the
          drawing should not claim otherwise. */}
      <path d="M90 66c-5-7-4-16 1-22 5 6 5 15-1 22Z" className="plant-tip" />
    </svg>
  );
}
