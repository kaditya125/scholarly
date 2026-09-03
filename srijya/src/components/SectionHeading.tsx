import type { ReactNode } from 'react';
import { revealProps } from '@/lib/reveal';

/**
 * The section opener used everywhere on the site.
 *
 * Asymmetric on purpose: the label sits in the first three columns and the
 * heading starts at column four, which gives every section the same left edge
 * for its type and lets the eye run down the page on a single axis. On a phone
 * the two simply stack.
 */
export default function SectionHeading({
  label,
  title,
  lede,
  action,
  id,
  as: Heading = 'h2',
}: {
  label?: string;
  title: ReactNode;
  lede?: ReactNode;
  /** A link or button that belongs to the section, placed under the lede. */
  action?: ReactNode;
  id?: string;
  as?: 'h1' | 'h2';
}) {
  return (
    <div className="grid gap-y-5 md:grid-cols-12 md:gap-x-10" {...revealProps()}>
      {label ? (
        <div className="md:col-span-3">
          <p className="label">{label}</p>
        </div>
      ) : null}
      <div className={label ? 'md:col-span-9' : 'md:col-span-12'}>
        <Heading id={id} className={Heading === 'h1' ? 'display-1' : 'display-2'}>
          {title}
        </Heading>
        {lede ? <p className="lede mt-7 max-w-[52ch]">{lede}</p> : null}
        {action ? <div className="mt-9">{action}</div> : null}
      </div>
    </div>
  );
}
