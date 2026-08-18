import { Response } from 'express';
import { GeminiProvider } from './ai/gemini.provider';
import { retrievalService } from './rag/retrieval.service';
import { studentContextService } from './studentContext.service';
import { buildSadhyaSystemPrompt } from '../config/prompts';
import { logger } from '../utils/logger';

/**
 * ScanService — the AI Question Scanner pipeline. Given a cropped region of a chapter PDF, it:
 *   1) transcribes the question with Gemini Vision (OCR preview),
 *   2) retrieves supporting passages HARD-SCOPED to exactly that chapter (reusing the sourceId
 *      Pinecone filter),
 *   3) aggregates the student's learning profile,
 *   4) streams a multimodal answer (the image + a system prompt fused from profile + chapter
 *      context) via SSE.
 * It intentionally reuses the same retrieval + student-context + prompt-building layers as chat,
 * so a scanned answer is grounded and personalized exactly like the tutor.
 */
export type ScanAction = 'solve' | 'explain' | 'teach' | 'similar';

export interface ScanInput {
  notebookId: string;
  sourceId: string;
  action: ScanAction;
  imageBase64: string; // raw base64 or a data: URL
  mimeType?: string;
  page?: number;
  chapterTitle?: string;
  bookTitle?: string;
  subject?: string;
}

const ACTIONS: ScanAction[] = ['solve', 'explain', 'teach', 'similar'];

const ACTION_INSTRUCTIONS: Record<ScanAction, string> = {
  solve: 'Provide a complete, correct, step-by-step solution to the scanned question. Show the reasoning for each step and state the FINAL ANSWER clearly at the end. If it is a multiple-choice question, identify the correct option AND briefly say why each other option is wrong.',
  explain: 'Explain the concept this question tests, then solve it step by step as if guiding a student who is stuck. Keep each step short and clear.',
  teach: 'Teach the concept behind this question starting from the fundamentals, then work through the question. Progress from basics to the full solution, using a simple analogy and one worked example.',
  similar: 'Do NOT solve the original question. Instead, generate 5 NEW practice questions on the SAME concept, ordered from easy to hard. After the 5 questions, add a concise answer key.',
};

/** Accept either a data: URL or raw base64 and return raw base64 for the Gemini inlineData part. */
function toRawBase64(s: string): string {
  const comma = s.indexOf(',');
  return s.startsWith('data:') && comma >= 0 ? s.slice(comma + 1) : s;
}

export class ScanService {
  private gemini = new GeminiProvider();

  async streamScan(userId: string, input: ScanInput, res: Response): Promise<void> {
    const write = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const action: ScanAction = ACTIONS.includes(input.action) ? input.action : 'solve';
    const mimeType = input.mimeType || 'image/png';
    const imageData = toRawBase64(input.imageBase64);

    try {
      // 1) Vision transcription (OCR preview) — also becomes the retrieval query.
      write({ type: 'progress', message: 'Reading the selected region…' });
      let questionText = '';
      try {
        questionText = (await this.gemini.extractQuestionFromImage(imageData, mimeType)).trim();
      } catch (e) {
        logger.warn('scan: extractQuestionFromImage failed (continuing with image only)', { err: String(e) });
      }
      write({
        type: 'extracted',
        questionText,
        source: { book: input.bookTitle || '', chapter: input.chapterTitle || '', subject: input.subject || '' },
      });

      // 2) Retrieval — HARD-SCOPED to this chapter's sourceId (genuinely grounds the answer).
      write({ type: 'progress', message: 'Searching this chapter…' });
      let retrievedContext = '';
      try {
        const results = await retrievalService.retrieveContext(
          questionText || `${input.chapterTitle || ''}`.trim() || 'question',
          input.notebookId, undefined, 6, [], [input.sourceId],
        );
        retrievedContext = retrievalService.formatContextForPrompt(results);
        for (const r of results.slice(0, 4)) {
          write({ type: 'citation', citation: { source: r.source, text: r.text, score: r.score } });
        }
      } catch (e) {
        logger.warn('scan: retrieval failed (continuing without RAG)', { err: String(e) });
      }

      // 3) Student profile → enriched system prompt (same builder chat uses).
      let studentContext: any = undefined;
      try { studentContext = await studentContextService.aggregateContext(userId); } catch { /* non-fatal */ }
      const hasCtx = retrievedContext.length > 50;
      let systemPrompt = buildSadhyaSystemPrompt({ mode: 'TEACHER', studentContext, retrievedContext, hasNotebookContext: hasCtx });

      const locator = [
        input.bookTitle, input.subject,
        input.chapterTitle ? `Chapter: ${input.chapterTitle}` : '',
        input.page ? `Page ${input.page}` : '',
      ].filter(Boolean).join(' · ');
      systemPrompt += `\n\n## Scanned Question\nThe student scanned a question from their textbook${locator ? ` (${locator})` : ''}. The attached image is the exact selection. Ground your response in the retrieved chapter context above and the student's profile. Render mathematics with LaTeX ($...$ inline, $$...$$ block) and chemical equations with \\ce{...}. Be precise; if the image is unclear or cut off, state your assumption before answering.`;

      // 4) Stream the multimodal answer (image + enriched system prompt).
      write({ type: 'progress', message: 'Working it out…' });
      const userText = `${ACTION_INSTRUCTIONS[action]}${questionText ? `\n\nTranscribed question (verify against the attached image):\n${questionText}` : ''}`;
      for await (const chunk of this.gemini.generateVisionStream(userText, systemPrompt, { data: imageData, mimeType }, { userId })) {
        write({ type: 'chunk', content: chunk });
      }

      write({ type: 'done' });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      logger.error('scan stream failed', { err: error?.message || String(error) });
      const msg = error?.message || 'Scan failed';
      if (!res.headersSent) res.status(500).json({ error: msg });
      else { write({ type: 'error', error: msg }); res.end(); }
    }
  }
}

export const scanService = new ScanService();
