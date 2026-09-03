import { ENGINEERING_QUALITIES } from '@/content/engineering';
import { revealProps } from '@/lib/reveal';

/**
 * The four properties the work is measured by, set as an editorial list.
 *
 * These are properties of the *result*, not virtues the company claims to have —
 * every one of them can be checked against a system after it ships, which is the
 * only place any of them can honestly be judged. The sentence completes across
 * the heading and the list, so it reads as one statement rather than four cards.
 */
export default function EngineeringPrinciples() {
  return (
    <section className="section" aria-labelledby="engineering-heading">
      <div className="container-tl">
        <div className="grid gap-y-10 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-4" {...revealProps()}>
            <p className="label">Engineering</p>
            <h2 id="engineering-heading" className="display-3 mt-6 max-w-[12ch]">
              Good technology should be&hellip;
            </h2>
          </div>

          <div className="md:col-span-8">
            <dl className="border-t border-line">
              {ENGINEERING_QUALITIES.map((quality, index) => (
                <div
                  key={quality.title}
                  className="grid gap-y-2 border-b border-line py-7 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-x-10"
                  {...revealProps(index * 80)}
                >
                  <dt className="heading-4 text-ink">{quality.title}</dt>
                  <dd className="body-text max-w-[56ch] sm:pt-1">{quality.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
