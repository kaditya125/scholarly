/**
 * Large header artwork for the pages whose argument a drawing can carry.
 *
 * WHICH PAGES GET ONE, AND WHY NOT ALL OF THEM
 *
 * The plant on About is the company's own idea at full size. These are the same
 * language scaled up for three other pages: what we build, what we have built,
 * and the gap between an idea and a product.
 *
 * Company, Contact, Privacy, Terms, Security and Help get nothing. Those are
 * reference pages — someone arrives at them with a question and wants the answer
 * in the fewest possible seconds. Artwork there is a thing to scroll past. A
 * site with a drawing at the top of every page has decided that consistency
 * matters more than the reader, which is how a template looks.
 *
 * Each is a scaled relative of the small motif beside the matching section on
 * the home page, so a reader who has seen one recognises the other.
 *
 * Same failure rule as everything else here: the resting state is the finished
 * drawing, the animation runs hidden -> drawn inside a no-preference block with
 * `backwards` fill, and it fires on `data-revealed` from the existing observer.
 */

export type HeaderMotifName = 'build' | 'studio' | 'transform';

export default function HeaderMotif({
  name,
  className = '',
}: {
  name: HeaderMotifName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 180 300"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`hmotif h-auto w-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {name === 'build' ? (
        <>
          {/* Courses of a wall, laid bottom up and narrowing. The plumb line
              drops first: you establish true before you lay anything on it. */}
          <path d="M90 18v252" className="hm-plumb" pathLength={1} opacity={0.35} />
          <path d="M22 262h136" className="hm-course hm-c1" pathLength={1} />
          <path d="M30 226h120" className="hm-course hm-c2" pathLength={1} />
          <path d="M38 190h104" className="hm-course hm-c3" pathLength={1} />
          <path d="M46 154h88" className="hm-course hm-c4" pathLength={1} />
          <path d="M54 118h72" className="hm-course hm-c5" pathLength={1} />
          <path d="M62 82h56" className="hm-course hm-c6" pathLength={1} />
          <path d="M72 46h36" className="hm-course hm-c7" pathLength={1} />
          {/* The weight the courses carry, arriving last. */}
          <circle cx="90" cy="26" r="6" className="hm-node hm-n1" />
        </>
      ) : null}

      {name === 'studio' ? (
        <>
          {/* A frame, a frame inside it, and something of our own at the centre.
              The outer draws first — you build the place before the thing that
              lives in it, and then the thing that lives in that. */}
          <path d="M20 40h140v220H20z" className="hm-frame hm-f1" pathLength={1} />
          <path d="M44 74h92v152H44z" className="hm-frame hm-f2" pathLength={1} />
          <circle cx="90" cy="150" r="20" className="hm-node hm-n1" />
          <circle cx="90" cy="150" r="7" className="hm-node hm-n2" />
        </>
      ) : null}

      {name === 'transform' ? (
        <>
          {/* Top to bottom, because the column is tall: a point, the distance,
              and a made thing. The distance is the company. */}
          <circle cx="90" cy="34" r="7" className="hm-node hm-n1" />
          <path d="M90 52v150" className="hm-run" pathLength={1} />
          {/* Ticks along the way — the four stages, without labelling them. */}
          <path d="M80 92h20" className="hm-tick hm-t1" pathLength={1} opacity={0.4} />
          <path d="M80 122h20" className="hm-tick hm-t2" pathLength={1} opacity={0.4} />
          <path d="M80 152h20" className="hm-tick hm-t3" pathLength={1} opacity={0.4} />
          <path d="M80 182h20" className="hm-tick hm-t4" pathLength={1} opacity={0.4} />
          <path d="M80 194l10 12 10-12" className="hm-run hm-arrow" pathLength={1} />
          <path d="M50 224h80v46H50z" className="hm-frame hm-f1" pathLength={1} />
        </>
      ) : null}
    </svg>
  );
}
