"""
Re-read book pages whose questions lost text in the first OCR (any book; targets from reread-targets.ts).
Each page is read twice, independently: gemini-2.5-pro (pages_pro/) and gemini-2.5-flash (pages_flash/)
— the second read is the cross-check for rows the first OCR left nothing to compare with.

  python reread_pages.py <bookKey>        (resumable)

Originally written for S. Chand Reasoning:

S. Chand prints options as a 2×2 grid — "(a) …   (b) …" over "(c) …   (d) …" — and the first pass
often kept only the left column. Each target page is re-read alone, at 200 dpi, by gemini-2.5-pro,
told about the grid, and returns every numbered question as JSON:
  {"questions": [{"number": 28, "stem": "Stare : Glance", "options": {"a": "...", "b": "...", ...}}]}
Nothing is decided here: schand-reocr-apply.ts matches and cross-checks.

  python schand_reocr.py            (reads reocr/targets.json, writes reocr/pages/pNNNN.json; resumable)
"""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import pymupdf
from google import genai
from google.genai import types

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DIRS = {'schand_reasoning': 'schand/reasoning', 'schand_quant': 'schand/quant', 'ry_ssc_reasoning': 'rakesh_yadav/ssc_reasoning',
        'lucent_english': 'lucent/english', 'lucent_science': 'lucent/science'}
BOOK = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging', *DIRS[sys.argv[1]].split('/')))
PRIMARY = os.environ.get('PRIMARY_MODEL', 'gemini-2.5-pro')     # the 'pages_pro' read; each file records its model
SECOND = os.environ.get('SECOND_MODEL', 'gemini-2.5-flash')
OUTS = {m: os.path.join(BOOK, 'reread', d) for m, d in ((PRIMARY, 'pages_pro'), (SECOND, 'pages_flash'))}
for o in OUTS.values():
    os.makedirs(o, exist_ok=True)

env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=os.environ.get('REREAD_LOCATION', 'global'))   # batch work: not the region live chat uses

PROMPT = """This is one scanned page of a reasoning book. Transcribe EVERY numbered question on it.
Options are often printed as a 2x2 grid: "(a) ...   (b) ..." on one line and "(c) ...   (d) ..." on
the next, so (b) and (d) sit in the RIGHT half of the line — read both halves of every option line.
Some questions have 5 options (a)-(e). Copy text exactly as printed (keep ":" in word pairs); do not
fix, guess or complete anything. If an option is not legible or not on this page, leave it out.
Skip answer keys, solutions and worked examples. Return JSON:
{"questions": [{"number": <int>, "stem": "<question text>", "options": {"a": "...", "b": "...", "c": "...", "d": "...", "e": "..."}}]}"""


def read(png: bytes, model: str) -> dict:
    for attempt in range(6):
        try:
            res = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=png, mime_type='image/png'), PROMPT],
                config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json'))
            out = json.loads(res.text)
            return {'questions': out} if isinstance(out, list) else out
        except Exception as e:
            msg = str(e); wait = min(20 * (attempt + 1), 120) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 5
            if attempt == 5:
                raise
            print(f'   retry {attempt + 1}: {msg[:80]} — wait {wait}s', flush=True); time.sleep(wait)


def main():
    targets = json.load(open(os.path.join(BOOK, 'reread', 'targets.json'), encoding='utf-8'))
    pages = sorted({p for t in targets for p in t['pdfPages']})
    jobs = [(p, m) for p in pages for m in OUTS if not os.path.exists(os.path.join(OUTS[m], f'p{p:04d}.json'))]
    print(f'{len(pages)} pages, {len(jobs)} reads to do', flush=True)
    doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))

    def one(job):
        p, m = job
        try:
            out = read(doc[p - 1].get_pixmap(dpi=200).tobytes('png'), m)
        except Exception as e:      # a page that keeps failing is left for the next run, not fatal
            print(f'p{p} {m}: gave up for now ({str(e)[:60]})', flush=True); return
        json.dump({'pdfPage': p, 'model': m, **out},
                  open(os.path.join(OUTS[m], f'p{p:04d}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        print(f'p{p} {m}: {len(out.get("questions") or [])} questions', flush=True)

    # Vertex quota is shared with live chat: two at a time.
    with ThreadPoolExecutor(max_workers=int(os.environ.get('REREAD_WORKERS', '2'))) as ex:
        list(ex.map(one, jobs))


main()
