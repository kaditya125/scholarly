/**
 * TTS SSML Builder
 *
 * OPTIONAL layer for voices that accept SSML input. As of the current
 * config, Chirp 3 HD is the primary voice tier and per Google's docs it
 * REJECTS SSML input entirely
 * (https://cloud.google.com/text-to-speech/docs/list-voices-and-types).
 *
 * That means SSML is NOT the primary quality lever — text preprocessing is
 * (see tts.preprocessor.ts). This module exists so that when a script uses
 * an SSML-capable voice family (Wavenet, Neural2, Studio, Standard,
 * Polyglot), the same speaker roles can benefit from `<break>`,
 * `<emphasis>`, `<prosody>`, and `<say-as>` cues.
 *
 * Usage:
 *   const ssml = buildSSML(cleanedText, { role: 'Teacher', voiceName });
 *   if (ssml) {
 *     payload.input = { ssml };
 *   } else {
 *     payload.input = { text: cleanedText };
 *   }
 *
 * The tts.service.ts flow could adopt this later — kept out of the main
 * path today to avoid regressions on Chirp 3 HD (which is already the best
 * available tier and doesn't need SSML).
 */

import { voiceSupportsProsody } from './tts.service';

export interface SSMLOptions {
  /** Speaker role (Teacher, Student, Host, …). Drives prosody defaults. */
  role: string;
  /** The exact Google voice name — used to skip SSML on non-supporting voices. */
  voiceName: string;
  /**
   * Break duration inserted between sentences. Google TTS handles most
   * pauses from punctuation already, so we only insert a short reinforcement.
   * Default: 200ms.
   */
  sentenceBreakMs?: number;
  /** Break duration between paragraphs. Default: 400ms. */
  paragraphBreakMs?: number;
}

const ROLE_PROSODY: Record<string, { rate: string; pitch: string }> = {
  Teacher: { rate: '0.95', pitch: '-1st' },
  'AI Tutor': { rate: '0.97', pitch: '-1st' },
  Host: { rate: '1.0', pitch: '0st' },
  Student: { rate: '1.03', pitch: '+1st' },
  'Subject Expert': { rate: '0.95', pitch: '-1st' },
  'Exam Coach': { rate: '1.0', pitch: '0st' },
};

/**
 * Wrap already-preprocessed text in SSML tuned for the speaker role. Returns
 * `null` when the target voice can't consume SSML — the caller should fall
 * back to plain-text input in that case.
 */
export function buildSSML(cleanedText: string, options: SSMLOptions): string | null {
  if (!cleanedText) return null;
  if (!voiceSupportsProsody(options.voiceName)) return null;

  const sentenceBreak = options.sentenceBreakMs ?? 200;
  const paragraphBreak = options.paragraphBreakMs ?? 400;
  const prosody = ROLE_PROSODY[options.role] ?? ROLE_PROSODY.Host;

  // Split into paragraphs first, then sentences within each paragraph. This
  // is intentionally conservative — the input text has already been
  // normalized so sentence terminators are dependable.
  const paragraphs = cleanedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const wrappedParagraphs = paragraphs.map((paragraph) => {
    const sentences = splitSentences(paragraph);
    const inner = sentences
      .map((s) => `<s>${escapeSSML(s)}</s>`)
      .join(`<break time="${sentenceBreak}ms"/>`);
    return `<p>${inner}</p>`;
  });

  const body = wrappedParagraphs.join(`<break time="${paragraphBreak}ms"/>`);
  return `<speak><prosody rate="${prosody.rate}" pitch="${prosody.pitch}">${body}</prosody></speak>`;
}

/** Rough sentence split — good enough for TTS chunking. */
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Escape the five XML characters that would break SSML if left raw. */
function escapeSSML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
