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
}: {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  /** Optional right-hand column — a short standfirst or a fact, never a stat. */
  meta?: ReactNode;
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
        {lede ? (
          <div className="mt-10 md:grid md:grid-cols-12 md:gap-x-10">
            <p className="lede md:col-span-7 md:col-start-1" {...revealProps(160)}>
              {lede}
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
