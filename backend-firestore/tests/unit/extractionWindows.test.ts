import { buildExtractionWindows, buildRepresentativeSample } from '../../src/utils/extractionWindows';

describe('buildExtractionWindows', () => {
  it('returns no windows for empty text', () => {
    expect(buildExtractionWindows('', 100, 3)).toEqual([]);
    expect(buildExtractionWindows('   ', 100, 3)).toEqual([]);
  });

  it('returns a single window when the text is shorter than one window', () => {
    const w = buildExtractionWindows('short text', 100, 3);
    expect(w).toHaveLength(1);
    expect(w[0]).toBe('short text');
  });

  it('scans the whole document contiguously when it fits within the cap', () => {
    const text = 'a'.repeat(250); // 3 windows of 100 -> needed 3, cap 3
    const w = buildExtractionWindows(text, 100, 3);
    expect(w).toHaveLength(3);
    // Contiguous coverage: joining the windows reconstructs the full text.
    expect(w.join('')).toBe(text);
  });

  it('spreads windows across the whole document when it exceeds the cap', () => {
    // 1000 chars, window 100, cap 3 -> needed 10, count 3, spread start..end.
    const text = Array.from({ length: 1000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
    const w = buildExtractionWindows(text, 100, 3);
    expect(w).toHaveLength(3);
    // First window starts at the beginning, last window ends at the document end.
    expect(text.startsWith(w[0])).toBe(true);
    expect(text.endsWith(w[w.length - 1])).toBe(true);
    // The last window is NOT the front (proves back-half coverage, unlike the old front-only logic).
    expect(w[w.length - 1]).not.toBe(w[0]);
  });

  it('honors a cap of 1 by taking the front window', () => {
    const text = 'x'.repeat(500);
    const w = buildExtractionWindows(text, 100, 1);
    expect(w).toHaveLength(1);
    expect(w[0]).toBe('x'.repeat(100));
  });

  it('never produces windows larger than windowChars', () => {
    const text = 'y'.repeat(777);
    for (const win of buildExtractionWindows(text, 100, 4)) {
      expect(win.length).toBeLessThanOrEqual(100);
    }
  });
});

describe('buildRepresentativeSample', () => {
  it('returns empty string for empty/blank text', () => {
    expect(buildRepresentativeSample('', 100, 3)).toBe('');
    expect(buildRepresentativeSample('   ', 100, 3)).toBe('');
  });

  it('returns the whole text unchanged when it fits within the budget', () => {
    const text = 'a short chapter';
    expect(buildRepresentativeSample(text, 18000, 3)).toBe(text);
  });

  it('returns the whole text (no gap marker) exactly at the budget boundary', () => {
    const text = 'z'.repeat(300);
    const out = buildRepresentativeSample(text, 300, 3);
    expect(out).toBe(text);
    expect(out).not.toContain('\u2026');
  });

  it('samples across the whole chapter when text exceeds the budget', () => {
    // 3000 chars, budget 300 (3 slices of 100) spread start..middle..end.
    const text = Array.from({ length: 3000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
    const out = buildRepresentativeSample(text, 300, 3);
    // Includes a gap marker between stitched slices.
    expect(out).toContain('\u2026');
    // First slice comes from the document start; a later slice comes from the end.
    expect(text.startsWith(out.split('\n\n[\u2026]\n\n')[0])).toBe(true);
    const parts = out.split('\n\n[\u2026]\n\n');
    expect(text.endsWith(parts[parts.length - 1])).toBe(true);
  });

  it('keeps the stitched content within roughly the budget (bounded cost)', () => {
    const text = 'q'.repeat(100000);
    const out = buildRepresentativeSample(text, 1800, 3);
    // Content chars (excluding gap markers) must not exceed the budget.
    const contentLen = out.split('\n\n[\u2026]\n\n').join('').length;
    expect(contentLen).toBeLessThanOrEqual(1800);
  });
});
