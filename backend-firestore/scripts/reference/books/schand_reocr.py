"""
Re-read S. Chand Reasoning pages whose verbal questions lost options in the first OCR.

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
BOOK = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging', 'schand', 'reasoning'))
OUT = os.path.join(BOOK, 'reocr', 'pages')
os.makedirs(OUT, exist_ok=True)

env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=env.get('GOOGLE_VERTEX_LOCATION', 'asia-southeast1'))

PROMPT = """This is one scanned page of a reasoning book. Transcribe EVERY numbered question on it.
Options are often printed as a 2x2 grid: "(a) ...   (b) ..." on one line and "(c) ...   (d) ..." on
the next, so (b) and (d) sit in the RIGHT half of the line — read both halves of every option line.
Some questions have 5 options (a)-(e). Copy text exactly as printed (keep ":" in word pairs); do not
fix, guess or complete anything. If an option is not legible or not on this page, leave it out.
Skip answer keys, solutions and worked examples. Return JSON:
{"questions": [{"number": <int>, "stem": "<question text>", "options": {"a": "...", "b": "...", "c": "...", "d": "...", "e": "..."}}]}"""


def read(png: bytes) -> dict:
    for attempt in range(6):
        try:
            res = client.models.generate_content(
                model='gemini-2.5-pro',
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
    targets = json.load(open(os.path.join(BOOK, 'reocr', 'targets.json'), encoding='utf-8'))
    pages = sorted({p for t in targets for p in t['pdfPages']})
    todo = [p for p in pages if not os.path.exists(os.path.join(OUT, f'p{p:04d}.json'))]
    print(f'{len(pages)} pages, {len(todo)} to read', flush=True)
    doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
    pngs = {p: doc[p - 1].get_pixmap(dpi=200).tobytes('png') for p in todo}

    def one(p):
        out = read(pngs[p])
        json.dump({'pdfPage': p, 'model': 'gemini-2.5-pro', **out},
                  open(os.path.join(OUT, f'p{p:04d}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        print(f'p{p}: {len(out.get("questions") or [])} questions', flush=True)

    # Vertex quota is shared with live chat: two at a time.
    with ThreadPoolExecutor(max_workers=2) as ex:
        list(ex.map(one, todo))


main()
