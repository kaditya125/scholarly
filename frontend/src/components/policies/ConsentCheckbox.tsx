import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * The tick-box on a consent surface, shared by the onboarding gate and the /policies page.
 *
 * A native checkbox cannot take the lime fill — `accent-color` is the only hook, and it does
 * not accept the dark checkmark this palette needs on top of #c8e558 (white on this lime is
 * ~1.7:1). The moment you reach for `appearance-none` to fix that, you are writing this anyway.
 *
 * The real input is still here and still a checkbox: sr-only rather than hidden, so it keeps
 * its focus behaviour, its label association and its role for assistive tech. The visible box
 * is a sibling driven by `peer-*`, which is why the focus ring lands on the thing you can see.
 *
 * Both callers had grown their own copy of this markup. One definition instead.
 */
export function ConsentCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The label text. Links inside it stay clickable — the label wraps the box, not them. */
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={[
          'mt-px shrink-0 w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[#c8e558] peer-focus-visible:ring-offset-2',
          'dark:peer-focus-visible:ring-offset-[#0b0b0c]',
          checked
            ? 'bg-[#c8e558] border-[#c8e558]'
            : 'border-slate-300 dark:border-white/20 group-hover:border-slate-400 dark:group-hover:border-white/35',
        ].join(' ')}
      >
        {checked && <Check className="w-3 h-3 text-slate-900" strokeWidth={3} />}
      </span>
      <span className="text-[13.5px] leading-snug text-slate-600 dark:text-gray-300">{children}</span>
    </label>
  );
}
