import type { ReactNode } from 'react';
import { revealProps } from '@/lib/reveal';

/**
 * The opening block of every interior page. Same left edge, same rhythm and the
 * same label-then-headline order as a section on the home page, so moving
 * between pages does not feel like moving between sites.
 */
export default function PageHeader({
  label,
  title,
  lede,
  meta,
  aside,
}: {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  /** Optional right-hand column — a short standfirst or a fact, never a stat. */
  meta?: ReactNode;
  /** Optional artwork, in the column the lede leaves empty. Decorative only. */
  aside?: ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <div className="container-tl pb-14 pt-14 md:pb-20 md:pt-20">
        <p className="label" {...revealProps()}>
          {label}
        </p>
        <div className="mt-6 grid gap-y-8 md:grid-cols-12 md:gap-x-10">
          <div className={meta ? 'md:col-span-7' : 'md:col-span-9'} {...revealProps(60)}>
            <h1 className="display-1 max-w-[16ch]">{title}</h1>
          </div>
          {meta ? (
            <div className="flex items-end md:col-span-5" {...revealProps(120)}>
              <div className="w-full border-t border-line pt-6">{meta}</div>
            </div>
          ) : null}
        </div>
        {lede || aside ? (
          <div className="mt-10 md:grid md:grid-cols-12 md:gap-x-10">
            {lede ? (
              <p className="lede md:col-span-7 md:col-start-1" {...revealProps(160)}>
                {lede}
              </p>
            ) : null}
            {aside ? (
              /* Columns 9-12, which the lede leaves empty. Hidden below md
                 rather than stacked: on a phone it would push the first real
                 section a screen further down to say nothing. */
              <div
                className="hidden md:col-span-4 md:col-start-9 md:block"
                {...revealProps(220)}
              >
                {aside}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
