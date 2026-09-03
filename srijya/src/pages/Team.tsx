import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import { TEAM } from '@/content/team';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * The people at Srijya.
 *
 * This page is only routed while `TEAM` has entries — see src/content/team.ts.
 * It therefore never renders an empty state, and there is no "team coming soon"
 * anywhere on the site, because a page that announces its own emptiness is worse
 * than the absence it is apologising for.
 *
 * Optional fields are omitted rather than filled. Someone with no public profile
 * simply has no links under their name, which is a normal thing for a person to
 * want and should not read as a gap.
 */
export default function Team() {
  useSeo({
    title: `Team — ${COMPANY.name}`,
    description: `The people behind ${COMPANY.name}.`,
    path: '/team',
  });

  return (
    <>
      <PageHeader
        label="Team"
        title="The people doing the work."
        lede="Srijya is an emerging company rather than a large one. What that buys you is direct access to the people who actually build the thing."
      />

      <div className="container-tl py-14 md:py-20">
        <ul className="border-t border-line">
          {TEAM.map((member, index) => (
            <li
              key={member.id}
              id={member.id}
              className="scroll-mt-28 border-b border-line py-8 md:py-10"
              {...revealProps(Math.min(index * 70, 240))}
            >
              <div className="grid gap-y-4 md:grid-cols-12 md:gap-x-10">
                <div className="flex items-baseline gap-4 md:col-span-4">
                  <span className="index-num" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h2 className="heading-4 text-ink">{member.name}</h2>
                    <p className="mt-1 text-[0.875rem] text-ink-3">{member.role}</p>
                  </div>
                </div>

                <div className="md:col-span-8">
                  {member.focus ? (
                    <p className="body-text max-w-[60ch]">{member.focus}</p>
                  ) : null}

                  {member.links && member.links.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                      {member.links.map((link) => (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-arrow text-[0.875rem]"
                          >
                            {link.label}
                            <ArrowUpRight size={13} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="py-12 md:py-16" {...revealProps()}>
          <h2 className="display-3 max-w-[18ch]">Want to work with us?</h2>
          <p className="body-text mt-5 max-w-[52ch]">
            We are not advertising roles at the moment, and we would rather say so than list
            openings that do not exist. If you are working on something you think we would find
            interesting, write to us anyway.
          </p>
          <div className="mt-8">
            <Link to="/contact" className="link-arrow">
              Get in touch
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
