/**
 * Read every rendered GATE CS page with a vision model — resumable, paced, cost-tracked.
 *
 *   node tsx transcribe-all.ts --model=gemini-2.5-flash            # reader A: every page
 *   node tsx transcribe-all.ts --model=gemini-2.5-pro --scanned    # reader B: pages with no text layer
 *
 * Each page is written to out/gate-cs/transcripts/<model>/<fileKey>/pNNN.json as soon as it is
 * read, so an interruption loses at most one page. Pages already read successfully are skipped.
 * Runs one request at a time: the same Vertex project serves live student chat.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createGoogleGenAIClient } from '../../../../src/services/ai/googleGenAIClient';

const OUT = process.env.GATE_OUT || path.resolve(__dirname, '..', 'out', 'gate-cs');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const MODEL = String(args.model || 'gemini-2.5-flash');
const ONLY_SCANNED = args.scanned === 'true';
const ONLY_KEY = args.key ? String(args.key) : null;
const REVERSE = args.reverse === 'true'; // a second worker can start from the far end; pages already read are skipped by both
const PACE_MS = Number(args.pace || 800);

const PROMPT = `You are transcribing ONE page image of an official exam question paper (GATE, Computer Science and Information Technology).
Copy EXACTLY what is printed. You are a copyist, not an author.
Rules:
- Do NOT solve, answer, correct, paraphrase, complete, or add anything. Keep the paper's own wording, spelling, grammar and punctuation, including its mistakes.
- If any character or word is unreadable, write [?] in its place. Never guess.
- Ignore faint mirror-image/ghost text showing through from the other side of the paper, and ignore handwriting/stamps.
- Mathematics: LaTeX between $...$ exactly as printed (superscripts, subscripts, Greek letters, operators, overlines, set notation).
- Program code: verbatim inside a fenced block \`\`\` preserving line breaks and indentation.
- Tables (including match-the-following lists): a Markdown table.
- Figures, diagrams, graphs, circuits, automata, trees, timing charts that cannot be written as text: do not describe them; add an entry in "figures" with a tight box.
- The printed numeric-answer blank (e.g. "Answer: ____") is not part of the stem: set hasAnswerBlank=true instead.
Return JSON only, with this shape:
{
  "header": "page header text or null",
  "footer": "page footer text or null",
  "sectionNotes": ["section headings / marks instructions printed on this page, verbatim, e.g. 'Q.1 - Q.25 carry one mark each.'"],
  "questions": [
    {
      "number": <printed question number as an integer; null if this block continues a question from the previous page>,
      "isContinuation": <true if this text continues a question that started on an earlier page>,
      "continuesOnNextPage": <true if the question is visibly cut off at the bottom of this page>,
      "commonDataOrLinked": "verbatim 'Common Data for Questions ...' or 'Statement for Linked Answer Questions ...' heading that precedes this question, else null",
      "stem": "question text verbatim, including code/math/tables and any shared data statement printed directly above it",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."} or null when no options are printed,
      "hasAnswerBlank": <true or false>,
      "box_2d": [ymin, xmin, ymax, xmax],
      "figures": [{"role": "stem" or "A" or "B" or "C" or "D", "box_2d": [ymin, xmin, ymax, xmax]}],
      "unreadable": <true if [?] was used anywhere in this question>
    }
  ]
}
box_2d values are integers 0-1000 relative to the full page image (box_2d of a question covers its stem and options on this page). Use [] for no figures and [] for no questions (e.g. cover or instruction pages).`;

interface ManifestRow { key: string; file: string; pages: number; textLayerPages: number }

async function main() {
  const manifest: ManifestRow[] = JSON.parse(fs.readFileSync(path.join(OUT, 'render-manifest.json'), 'utf8'));
  const ai = createGoogleGenAIClient();
  const isPro = /pro/.test(MODEL);
  const totals = { pages: 0, skipped: 0, failed: 0, inTok: 0, outTok: 0, thinkTok: 0 };

  for (const row of REVERSE ? [...manifest].reverse() : manifest) {
    if (ONLY_KEY && row.key !== ONLY_KEY) continue;
    for (const p of Array.from({ length: row.pages }, (_, i) => (REVERSE ? row.pages - i : i + 1))) {
      const pageId = `p${String(p).padStart(3, '0')}`;
      if (ONLY_SCANNED) {
        const tl = JSON.parse(fs.readFileSync(path.join(OUT, 'textlayer', row.key, `${pageId}.json`), 'utf8'));
        if ((tl.words || []).length > 40) continue; // this page has a real text layer; the text layer is its check
      }
      const outFile = path.join(OUT, 'transcripts', MODEL, row.key, `${pageId}.json`);
      if (fs.existsSync(outFile)) {
        try { if (JSON.parse(fs.readFileSync(outFile, 'utf8')).result) { totals.skipped++; continue; } } catch { /* re-read */ }
      }
      const img = fs.readFileSync(path.join(OUT, 'pages', row.key, `${pageId}.jpg`)).toString('base64');
      let attempt = 0; let saved = false;
      while (attempt < 5 && !saved) {
        attempt++;
        const t = Date.now();
        try {
          const res: any = await ai.models.generateContent({
            model: MODEL,
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: img } }, { text: PROMPT }] }],
            config: {
              temperature: 0,
              responseMimeType: 'application/json',
              maxOutputTokens: 32768,
              ...(isPro ? { thinkingConfig: { thinkingBudget: 2048 } } : {}),
            },
          });
          const raw: string = res.text ?? '';
          const finish = res.candidates?.[0]?.finishReason;
          let result: any = null;
          try { result = JSON.parse(raw); } catch { result = null; }
          const u = res.usageMetadata || {};
          totals.inTok += u.promptTokenCount || 0; totals.outTok += u.candidatesTokenCount || 0; totals.thinkTok += u.thoughtsTokenCount || 0;
          fs.mkdirSync(path.dirname(outFile), { recursive: true });
          fs.writeFileSync(outFile, JSON.stringify({ model: MODEL, key: row.key, page: p, ms: Date.now() - t, finish, usage: u, result, raw: result ? undefined : raw }, null, 1));
          if (result) { saved = true; totals.pages++; }
          else if (attempt >= 2) { totals.failed++; saved = true; console.log(`  ${row.key} ${pageId}: unparseable after ${attempt} tries (finish=${finish})`); }
        } catch (e: any) {
          const msg = String(e?.message || e);
          const wait = /429|RESOURCE_EXHAUSTED|quota/i.test(msg) ? 30000 * attempt : 5000 * attempt;
          console.log(`  ${row.key} ${pageId}: error (attempt ${attempt}) ${msg.slice(0, 120)} — waiting ${wait / 1000}s`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      await new Promise((r) => setTimeout(r, PACE_MS));
    }
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${MODEL} ${row.key}: done | pages read ${totals.pages}, skipped ${totals.skipped}, failed ${totals.failed} | tokens in ${totals.inTok} out ${totals.outTok} thinking ${totals.thinkTok}`);
  }
  console.log('ALL DONE', JSON.stringify(totals));
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e?.message || e); process.exit(1); });
