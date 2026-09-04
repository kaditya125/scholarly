/**
 * The seedling.
 *
 * Srijya is from सृज् — to create, to bring forth. This is that, drawn as a
 * thing that actually grew: a seed under the soil line, a root going down before
 * anything goes up, a stem that does not rise perfectly straight, two cotyledons
 * — the seed's own first leaves — and then two true leaves above them.
 *
 * That order is the point. A seedling puts out a root first, and its first pair
 * of leaves are not leaves it made but the halves of the seed opening. Drawing
 * it in that sequence is the difference between a plant and a plant-shaped icon.
 *
 * VISUAL LANGUAGE
 *
 * Single-weight strokes on a 48-unit grid, `currentColor`, same family as the
 * mark in Logo.tsx. Deliberately not photographic: every other graphic on this
 * site is one-colour line work, and a rendered plant would read as clip art
 * pasted onto someone else's design.
 *
 * FAILURE BEHAVIOUR
 *
 * The resting state is a fully drawn seedling. The growth animation lives
 * entirely in a `prefers-reduced-motion: no-preference` block and runs from
 * hidden to drawn, so an animation that never fires — throttled tab, partial
 * stylesheet, reduced-motion — leaves the whole plant visible rather than a seed
 * on its own.
 */
export default function Sprout({
  size = 34,
  className = '',
  animate = true,
}: {
  size?: number;
  className?: string;
  /** Set false where a second animation would be noise rather than emphasis. */
  animate?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${animate ? 'sprout-grow' : ''} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Soil line, broken either side of the stem so it reads as ground rather
          than as a rule the plant is standing on. */}
      <path d="M7 35.5h9.5M31.5 35.5H41" className="sprout-soil" opacity={0.45} pathLength={1} />

      {/* The seed, sitting in the soil. Slightly ovoid, slightly tilted — a
          circle here reads as a bullet point. */}
      <ellipse
        cx="24"
        cy="35.8"
        rx="3"
        ry="2.3"
        transform="rotate(-14 24 35.8)"
        className="sprout-seed"
      />

      {/* Root. Down before up, and forked, because a single taproot drawn as one
          line is the thing every icon does. */}
      <path d="M24 38.1c0 2.6-.5 4.2-1.6 5.9" className="sprout-root sprout-root-1" pathLength={1} />
      <path d="M24.4 40.2c.9 1.3 1.9 2 3.3 2.7" className="sprout-root sprout-root-2" pathLength={1} />

      {/* Stem. A slack S rather than a straight line — nothing that grew is
          straight, and the curve is what stops this reading as a lollipop. */}
      <path
        d="M24 33.6c-.5-4 .4-6.9 1-9.6.7-3.1.3-5.6-.4-8.2"
        className="sprout-stem"
        pathLength={1}
      />

      {/* Cotyledons — the seed leaves. Small, rounded, opposite, low on the
          stem, and slightly unequal because they always are. */}
      <path
        d="M24.6 26.3c-2.9.5-5.4-.6-6.6-3.1 2.6-1.2 5.3-.3 6.6 3.1Z"
        className="sprout-cot sprout-cot-1"
      />
      <path
        d="M24.9 24.4c2.7-.1 4.7-1.6 5.3-4.2-2.7-.6-4.9.9-5.3 4.2Z"
        className="sprout-cot sprout-cot-2"
      />

      {/* True leaves. Larger, pointed, each with a midrib — the vein is most of
          what separates a leaf from a petal at this size. */}
      <g className="sprout-leaf sprout-leaf-1">
        <path d="M24.2 17.4c-3.7.6-7-1-8.5-4.4 3.4-1.7 7 0 8.5 4.4Z" />
        <path d="M24.2 17.4c-2.2-1-3.9-2.2-5.6-3.6" opacity={0.55} />
      </g>
      <g className="sprout-leaf sprout-leaf-2">
        <path d="M24.7 14.1c3.5-.5 6.3-2.6 7.3-6.2-3.6-.9-6.6 1.4-7.3 6.2Z" />
        <path d="M24.7 14.1c1.9-1.4 3.4-2.9 4.8-4.7" opacity={0.55} />
      </g>
    </svg>
  );
}
