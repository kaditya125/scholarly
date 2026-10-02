import { StepState } from '../runtime/agent.types';

/** The labels of completed and failed steps, as every workflow's evaluate reports them. */
export function stepOutcomes(steps: ReadonlyMap<string, StepState>): { completed: string[]; failed: string[] } {
  const completed: string[] = [];
  const failed: string[] = [];
  for (const s of steps.values()) {
    if (s.status === 'completed') completed.push(s.label);
    else if (s.status === 'failed') failed.push(`${s.label} — ${s.error?.message ?? 'failed'}`);
  }
  return { completed, failed };
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '–': '⁻', '−': '⁻', '+': '⁺' };
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', s: 'ₛ', t: 'ₜ', x: 'ₓ',
};

/**
 * The tools' formula markup (`v^2`, `F_x`, `s^{-2}`) as plain text for a chat summary, which is
 * markdown rather than rendered notation: Unicode super/subscripts where they exist, and the
 * markup left as it is where they do not (there is no subscript "c"), so nothing is lost.
 */
export function plainNotation(text: string): string {
  return String(text ?? '').replace(/([_^])(\{([^{}]*)\}|[-–−+]?[A-Za-z0-9]+)/g, (whole, mark: string, _g: string, braced?: string) => {
    const body = braced ?? whole.slice(1);
    const table = mark === '^' ? SUP : SUB;
    const chars = [...body];
    return chars.every((c) => table[c]) ? chars.map((c) => table[c]).join('') : whole;
  });
}
