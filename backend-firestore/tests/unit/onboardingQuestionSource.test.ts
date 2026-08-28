/**
 * Onboarding question provenance.
 *
 * This exists because the same four static questions have now been removed TWICE. They were
 * deleted from the frontend in e13154ab, and the identical four were still sitting in the
 * backend's INSTANT_QUESTION_BANK, reachable on the onboarding path, live in production. Deleting
 * one copy moved the problem rather than fixing it.
 *
 * These tests fail if any static assessment question can reach a student again, from any layer.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICE = path.join(__dirname, '../../src/services/adaptiveCat.service.ts');
const FRONTEND_API = path.join(__dirname, '../../../frontend/src/lib/api/studentDigitalTwin.ts');

/** The four that were served to every student regardless of exam. None may return, anywhere. */
const BANNED_QUESTIONS = [
  'physical quantities is a vector quantity',
  'acceleration produced',
  'exothermic reaction',
  'discriminant of a quadratic',
];

describe('no static question source exists on the onboarding path', () => {
  const source = fs.readFileSync(SERVICE, 'utf8');
  /** Comments explain why the bank is gone; only executable code may be judged. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('the generator declares no INSTANT_QUESTION_BANK', () => {
    expect(code).not.toMatch(/const\s+INSTANT_QUESTION_BANK/);
  });

  it('the generator references no question bank at all', () => {
    expect(code).not.toMatch(/INSTANT_QUESTION_BANK/);
  });

  it.each(BANNED_QUESTIONS)('does not contain the retired question: %s', (q) => {
    expect(code.toLowerCase()).not.toContain(q.toLowerCase());
  });

  it('carries no static array of question objects', () => {
    // A question literal is recognisable by a `question:` key sitting beside an `options:` key.
    const literalPairs = code.match(/question:\s*['"`][^'"`]{15,}/g) || [];
    expect(literalPairs).toHaveLength(0);
  });

  it('does not ASSIGN placeholder options as a repair', () => {
    /*
     * The old mapper did `: ['Option A','Option B','Option C','Option D']` whenever the model's
     * options were malformed, shipping an unanswerable question as a real one.
     *
     * Deliberately narrow, and keyed on QUOTE STYLE. The same literal appears inside the PROMPT
     * as the JSON schema example shown to the model — legitimate, and written with double quotes
     * because it is JSON. TypeScript source uses single quotes, so only the single-quoted form is
     * banned. An earlier version of this test matched both and failed on correct code.
     */
    expect(code).not.toMatch(/[:=]\s*\[\s*'Option A'\s*,\s*'Option B'/);
  });

  it('rejects the prompt template echoed back as options', () => {
    // A model that copies the schema instead of filling it in passes every structural check.
    expect(code).toMatch(/Option \$\{String\.fromCharCode\(65 \+ i\)\}/);
  });

  it('does not fall back to options[0] when the answer matches nothing', () => {
    // This one graded students against an invented key.
    expect(code).not.toMatch(/opts\.includes\(correct\)\s*\?\s*correct\s*:\s*opts\[0\]/);
  });
});

describe('failure is surfaced, not disguised', () => {
  const code = fs.readFileSync(SERVICE, 'utf8');

  it('throws a typed error when a batch cannot be produced', () => {
    expect(code).toMatch(/class AdaptiveGenerationError/);
    expect(code).toMatch(/throw new AdaptiveGenerationError/);
  });

  it('retries generation rather than substituting', () => {
    expect(code).toMatch(/MAX_GENERATION_ATTEMPTS/);
    expect(code).toMatch(/for \(let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS/);
  });

  it('has no catch that returns questions instead of rethrowing', () => {
    // The shape being banned: catch (...) { ... return [ ... ] } / return SOMETHING_BANK
    expect(code).not.toMatch(/catch[\s\S]{0,200}?return\s+(INSTANT_QUESTION_BANK|DEFAULT_[A-Z_]*BATCH)/);
  });

  it('stamps provenance on every question it emits', () => {
    expect(code).toMatch(/generatedBy: 'gemini'/);
    expect(code).toMatch(/generatedAt: Date\.now\(\)/);
  });
});

describe('the frontend cannot reintroduce one either', () => {
  const fe = fs.existsSync(FRONTEND_API) ? fs.readFileSync(FRONTEND_API, 'utf8') : '';

  it('the API layer is present to test', () => {
    expect(fe.length).toBeGreaterThan(0);
  });

  it('declares no DEFAULT_FALLBACK_BATCH', () => {
    const code = fe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/const\s+DEFAULT_FALLBACK_BATCH/);
  });

  it.each(BANNED_QUESTIONS)('does not contain the retired question: %s', (q) => {
    const code = fe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.toLowerCase()).not.toContain(q.toLowerCase());
  });

  it('addresses the mounted backend route, not the 404 path that caused all this', () => {
    // /assessment/baseline/* 404'd for ten days; the fallback hid it. Guard the corrected path.
    expect(fe).toMatch(/\/baseline-assessment\/start\//);
    expect(fe).not.toMatch(/`\/assessment\/baseline\/start\//);
  });
});
