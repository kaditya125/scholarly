import { Link } from 'react-router-dom';
import HeaderMotif from '@/components/HeaderMotif';
import PageHeader from '@/components/PageHeader';
import ContactCTA from '@/components/sections/ContactCTA';
import { CAPABILITIES } from '@/content/capabilities';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

export default function CapabilitiesPage() {
  useSeo({
    title: `Capabilities — ${COMPANY.name}`,
    description:
      'Digital product engineering, software development, technology consulting, applied AI, and product discovery and prototyping.',
    path: '/capabilities',
  });

  return (
    <>
      <PageHeader
        label="Capabilities"
        title="What we build, and how the work is usually shaped."
        lede="Five areas of capability. Most engagements draw on more than one — a consulting question tends to become a build, and a build tends to raise a question worth answering properly."
        aside={<HeaderMotif name="build" className="mx-auto max-w-[180px] text-accent" />}
      />

      {/* An in-page index. On a page of five long sections it is faster than
          scrolling, and it gives each capability a linkable address. */}
      <nav aria-label="Capabilities" className="border-b border-line">
        <div className="container-tl">
          <ol className="grid gap-x-8 gap-y-3 py-7 sm:grid-cols-2 lg:grid-cols-5 lg:py-6">
            {CAPABILITIES.map((capability) => (
              <li key={capability.id}>
                {/* A router Link rather than a bare anchor: a plain fragment link
                    changes the URL without notifying the router, so the app's own
                    scroll handling would never run for it. */}
                <Link
                  to={`#${capability.id}`}
                  className="group flex items-baseline gap-3 py-1 text-[0.875rem] text-ink-2 transition-colors duration-300 hover:text-ink"
                >
                  <span className="index-num">{capability.index}</span>
                  <span className="border-b border-transparent transition-colors duration-300 group-hover:border-ink">
                    {capability.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <div className="container-tl">
        {CAPABILITIES.map((capability) => (
          <section
            key={capability.id}
            id={capability.id}
            /* Offset the anchor so a linked section does not land underneath the
               sticky header. */
            className="scroll-mt-24 border-b border-line py-14 last:border-b-0 md:py-20"
            aria-labelledby={`${capability.id}-heading`}
            {...revealProps()}
          >
            <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
              <div className="md:col-span-3">
                <p className="index-num">{capability.index}</p>
                <h2
                  id={`${capability.id}-heading`}
                  className="display-3 mt-3 max-w-[14ch] md:sticky md:top-28"
                >
                  {capability.title}
                </h2>
              </div>

              <div className="md:col-span-5">
                <p className="lede max-w-[46ch]">{capability.detail}</p>
                <div className="mt-9 border-t border-line pt-5">
                  <p className="label">Typical engagement</p>
                  <p className="body-text mt-3 max-w-[46ch]">{capability.engagement}</p>
                </div>
              </div>

              <div className="md:col-span-4">
                <p className="label">What we help with</p>
                <ul className="mt-5 space-y-3">
                  {capability.helpWith.map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 border-b border-line pb-3 text-[0.9375rem] leading-relaxed text-ink-2 last:border-b-0"
                    >
                      <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-line-2" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      <ContactCTA />
    </>
  );
}
