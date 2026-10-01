"""
Track A, step 2 — the answer-page pass for the non-verbal figure questions.

extract_figures.py reads questions and crops their figures, but its answer reading was bolted onto
the same call and came back without exercise labels (551 of ~660 answers unlabelled), so almost
nothing could be joined to a key. This pass reads every VISIBLE page again with one job only: list
the page's blocks top to bottom — question runs, answer blocks, worked examples — so the join
(build_keys.py) can pair each answer block with the question run printed just before it.

The book prints keys two ways, and both are read here:
  - an ANSWERS grid after an exercise:            "1. (c)  2. (a)  3. (d) ..."
  - a solutions list, often spanning pages:       "17. (5): Two bent pins are added ..."

This source PDF is a preview copy: ~44% of the non-verbal pages are "Hidden page" placeholders.
Those are detected from pixels and recorded as hidden (no model call), because the join must know
where the gaps are.

Writes dataset_staging/<book>/figures/answers/p{page}.json. Nothing is uploaded.

  python read_answers.py --book schand_reasoning --from 741 --to 1176 [--force]
"""
import argparse, json, os, re, sys, time
import pymupdf
from google import genai
from google.genai import types

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'schand_reasoning': 'schand/reasoning'}

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='schand_reasoning')
ap.add_argument('--from', dest='frm', type=int, required=True)
ap.add_argument('--to', type=int, required=True)
ap.add_argument('--force', action='store_true', help='re-read pages that already have answers/p*.json')
ap.add_argument('--check', action='store_true',
                help='independent second read of pages the first pass found answers on, with a stronger model, '
                     'into answers_check/; build_keys.py keeps a key only when both reads agree')
args = ap.parse_args()

BOOK = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'))
FIRST = os.path.join(BOOK, 'figures', 'answers')
OUT = os.path.join(BOOK, 'figures', 'answers_check' if args.check else 'answers')
MODEL = 'gemini-2.5-pro' if args.check else 'gemini-2.5-flash'
os.makedirs(OUT, exist_ok=True)

# Same Vertex project/location/credentials as extract_figures.py.
env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=env.get('GOOGLE_VERTEX_LOCATION', 'asia-southeast1'))

PROMPT = """This is one page of a non-verbal (figure) reasoning book. List what is printed on it, TOP TO BOTTOM, as JSON:
{
 "runningHead": the running title printed at the very top of the page (a chapter name or the book part title), or "",
 "blocks": [ in the order they appear on the page, each one of:
   {"type": "questions", "exercise": the EXERCISE label printed just above these questions (e.g. "1B", "EXERCISE 3"), or "",
    "numbers": [the printed numbers of the numbered practice questions in this run, in order]},
   {"type": "answers", "heading": the heading printed above this block exactly (e.g. "ANSWERS", "EXERCISE 2A", "SOLUTIONS"), or "",
    "entries": [ {"number": printed question number, "key": the answer exactly as printed inside the parentheses, e.g. "c" or "3" or "b, d",
                  "explanation": the explanation text after the key, verbatim, or ""} ]},
   {"type": "examples"}  for worked examples ("Ex.", "Example", "Illustration") and their solutions
 ]
}
Answer blocks are either a grid of keys like "1. (c)  2. (a)  3. (d)" or a list of numbered solutions like "17. (5): explanation...".
A numbered solution with an explanation is an ANSWER entry, never a question.
Transcribe only what is printed. Use [] when there are no blocks."""


def is_hidden(page) -> bool:
    """The preview copy replaces withheld pages with a near-blank 'Hidden page' placeholder."""
    if page.get_text().strip().startswith('Hidden page'):
        return True
    pix = page.get_pixmap(dpi=20, colorspace=pymupdf.csGRAY)
    s = pix.samples
    return sum(1 for b in s if b < 128) / len(s) < 0.003


def call_model(png: bytes) -> dict:
    for attempt in range(6):
        try:
            res = client.models.generate_content(
                model=MODEL,
                contents=[types.Part.from_bytes(data=png, mime_type='image/png'), PROMPT],
                config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json',
                                                   thinking_config=types.ThinkingConfig(thinking_budget=2048)),
            )
            out = json.loads(res.text)
            if not isinstance(out, dict) or not isinstance(out.get('blocks', []), list):
                raise ValueError('unexpected shape')
            return out
        except Exception as e:  # rate limits share the project's Vertex quota with the live product
            msg = str(e)
            wait = min(15 * (attempt + 1), 90) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 3
            if attempt == 5: raise
            print(f'   retry {attempt + 1}: {msg[:100]} — wait {wait}s', flush=True)
            time.sleep(wait)


doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
t0 = time.time()
for p in range(args.frm, args.to + 1):
    pj = os.path.join(OUT, f'p{p:04d}.json')
    if os.path.exists(pj) and not args.force:
        continue
    if args.check:
        first = os.path.join(FIRST, f'p{p:04d}.json')
        if not os.path.exists(first) or not any(
                isinstance(b, dict) and b.get('type') == 'answers'
                for b in json.load(open(first, encoding='utf-8')).get('blocks') or []):
            continue
    page = doc[p - 1]
    if is_hidden(page):
        rec = {'page': p, 'hidden': True, 'runningHead': '', 'blocks': []}
    else:
        # 200 dpi: the ANSWERS grids are set in small type.
        rec = call_model(page.get_pixmap(dpi=200).tobytes('png'))
        rec['page'], rec['hidden'] = p, False
    json.dump(rec, open(pj, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    kinds = [b.get('type') for b in rec['blocks'] if isinstance(b, dict)]
    n_ans = sum(len(b.get('entries') or []) for b in rec['blocks'] if isinstance(b, dict) and b.get('type') == 'answers')
    print(f'p{p}: {"HIDDEN" if rec["hidden"] else ",".join(kinds) or "-"}'
          f'{f"  ({n_ans} keys)" if n_ans else ""}  [{time.time() - t0:.0f}s]', flush=True)
