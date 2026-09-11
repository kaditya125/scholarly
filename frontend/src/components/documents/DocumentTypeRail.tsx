import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The document-type switch.
 *
 * The page used to show one kind of thing — curriculum subjects — so it needed no navigation.
 * Now it shows several that share a search box and a grid, and those need a way to be told apart
 * that is cheaper than scrolling.
 *
 * A segmented control rather than tabs or a sidebar: the set is small and fixed, every option is
 * worth showing at once, and counts belong next to the label so an empty category is obvious
 * before it is clicked rather than after.
 */
export interface DocumentType {
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface Props {
  types: DocumentType[];
  active: string;
  onChange: (id: string) => void;
}

export function DocumentTypeRail({ types, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Document type"
      className="flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] overflow-x-auto"
    >
      {types.map(({ id, label, icon: Icon, count }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              'shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-medium',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ba32b]/30 dark:focus-visible:ring-[#c8e558]/30',
              'transition-colors duration-200 cursor-pointer',
              isActive
                // The accent is the only fill on the page, so it marks exactly one thing: where
                // you are. Slate-900 on lime rather than white — lime is light enough that white
                // text on it fails contrast.
                ? 'bg-[#c8e558] text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5',
            )}
          >
            <Icon className="w-[15px] h-[15px]" />
            <span>{label}</span>
            <span
              className={cn(
                'text-[11px] tabular-nums',
                isActive ? 'text-slate-900/55' : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
