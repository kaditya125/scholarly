/**
 * Transcribe ONE rendered page of an official GATE paper with a vision model.
 *
 * The model is a copyist, not an author: it must reproduce what is printed and nothing else —
 * no solving, no "fixing" a typo, no completing a truncated line. Anything it cannot read is
 * written as [?] so a reviewer sees the gap instead of a plausible guess. Every page is read by
 * two different models and compared downstream; this script only produces one reading.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createGoogleGenAIClient } from '../../../../src/services/ai/googleGenAIClient';

export const TRANSCRIBE_PROMPT = `You are transcribing ONE page image of an official exam question paper (GATE, Computer Science).
Copy EXACTLY what is printed. You are a copyist, not an author.
Rules:
- Do NOT solve, answer, correct, paraphrase, complete, or add anything. Keep the paper's own wording, spelling and punctuation.
- If any character or word is unreadable, write [?] in its place. Never guess.
- Ignore faint mirror-image/ghost text showing through from the other side of the paper.
- Mathematics: write it in LaTeX between $...$ (inline) exactly as printed (superscripts, subscripts, Greek letters, operators).
- Program code: reproduce it verbatim inside a fenced block \`\`\`...\`\`\` preserving line breaks and indentation.
- Tables: reproduce as a Markdown table.
- Figures/diagrams/graphs/circuits that cannot be written as text: do not describe their content; instead add an entry in "figures" with a tight bounding box.
Return JSON only:
{
  "header": "page header text or null",
  "footer": "page footer text or null",
  "sectionNotes": ["any section headings/instructions printed on the page, verbatim"],
  "questions": [
    {
      "number": <printed question number as integer, or null if this block is a continuation of a question from the previous page>,
      "isContinuation": <true if this text continues a question that started on an earlier page>,
      "continuesOnNextPage": <true if the question is visibly cut off at the bottom of this page>,
      "stem": "question text verbatim (including code/math/tables)",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."} or null when the question has no printed options,
      "hasAnswerBlank": <true if a numeric answer blank like 'Answer: ____' is printed instead of options>,
      "figures": [{"role": "stem" | "A" | "B" | "C" | "D", "box_2d": [ymin, xmin, ymax, xmax]}],
      "unreadable": <true if any [?] was used>
    }
  ]
}
box_2d values are integers 0-1000 relative to the full page image. Use an empty "figures" array when there are none.`;

export async function transcribePage(pngPath: string, model: string): Promise<{ json: any; raw: string; usage: any; ms: number }> {
  const ai = createGoogleGenAIClient();
  const data = fs.readFileSync(pngPath).toString('base64');
  const t = Date.now();
  const res: any = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data } }, { text: TRANSCRIBE_PROMPT }] }],
    config: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 16384 },
  });
  const raw = res.text ?? '';
  let json: any = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  return { json, raw, usage: res.usageMetadata, ms: Date.now() - t };
}

if (require.main === module) {
  (async () => {
    const [pngPath, model, outPath] = process.argv.slice(2);
    const r = await transcribePage(pngPath, model);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ model, pngPath, ms: r.ms, usage: r.usage, parsed: r.json !== null, result: r.json, raw: r.json ? undefined : r.raw }, null, 2));
    console.log(`${model} ${path.basename(pngPath)}: ${r.ms} ms, parsed=${r.json !== null}, questions=${r.json?.questions?.length ?? '-'}, tokens in/out=${r.usage?.promptTokenCount}/${r.usage?.candidatesTokenCount}`);
    process.exit(0);
  })().catch((e) => { console.error('FAILED', e?.message || e); process.exit(1); });
}
