import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import { revealProps } from '@/lib/reveal';
import { COMPANY } from '@/site.config';

/**
 * The closing invitation. One heading, one line, one action — the last thing on
 * the page should not be a form with six fields; that lives on /contact.
 */
export default function ContactCTA({ className = '' }: { className?: string }) {
  return (
    <section className={`section border-t border-line ${className}`} aria-labelledby="cta-heading">
      <div className="container-tl">
        <div className="grid gap-y-10 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-7" {...revealProps()}>
            <h2 id="cta-heading" className="display-2 max-w-[16ch]">
              Have something worth building?
            </h2>
            <p className="lede mt-7 max-w-[46ch]">
              Tell us what you&rsquo;re working on. We&rsquo;ll start with the problem, not the
              pitch.
            </p>
          </div>

          <div className="flex flex-col justify-end md:col-span-5 md:items-end" {...revealProps(80)}>
            <Link to="/contact" className="btn btn-primary self-start md:self-end">
              Start a conversation
              <ArrowRight />
            </Link>
            <div className="mt-6 flex flex-col gap-1 text-[0.875rem] text-ink-2 md:text-right">
              {COMPANY.email ? (
                <p>
                  Or write to{' '}
                  <a
                    href={`mailto:${COMPANY.email}`}
                    className="underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-ink"
                  >
                    {COMPANY.email}
                  </a>
                </p>
              ) : null}
              {COMPANY.whatsapp ? (
                <p>
                  Quick questions?{' '}
                  <a
                    href={COMPANY.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-ink"
                  >
                    WhatsApp us
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
