import type { ReactNode } from 'react';
import { revealProps } from '@/lib/reveal';

/**
 * A titled block of prose on the editorial grid: label left, content right, one
 * hairline above. Used for every long-form page so About, the product write-up
 * and the legal notices all read on the same axis.
 */
export default function TextSection({
  label,
  title,
  children,
  id,
  size = 'large',
}: {
  label?: string;
  title: ReactNode;
  children: ReactNode;
  id?: string;
  /** `small` keeps dense pages (legal notices) from shouting. */
  size?: 'large' | 'small';
}) {
  return (
    <section id={id} className="border-t border-line py-12 md:py-16" {...revealProps()}>
      <div className="grid gap-y-5 md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-3">{label ? <p className="label">{label}</p> : null}</div>
        <div className="md:col-span-8">
          <h2 className={size === 'large' ? 'display-3 max-w-[20ch]' : 'heading-4 text-ink'}>
            {title}
          </h2>
          <div className="mt-6 max-w-[62ch] space-y-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
