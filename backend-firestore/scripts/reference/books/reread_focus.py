"""
Focused second pass for rows the page re-read could not repair (reread-apply.ts → reread/failures.json).

One question at a time: its page AND the next (a question can run over), at 300 dpi, with the
question's number and the start of its stem in the prompt — so a page-mapping miss, a column split or
options carried to the next page no longer lose it. Read twice, independently, by gemini-2.5-pro and
gemini-2.5-flash; reread-apply.ts --focus applies the same cross-checks as before (text layer /
first-pass order / exact agreement of the two reads, symbols kept).

  python reread_focus.py <bookKey>      → reread/focus_{pro,flash}.jsonl (resumable)
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
env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=os.environ.get('REREAD_LOCATION', 'us-central1'))   # batch work: not live chat's region

PROMPT = """These are consecutive scanned pages of a textbook. Find question number {n} whose text begins
roughly "{start}" (it may continue onto the next page; options are often a 2x2 grid "(a) ... (b) ..." /
"(c) ... (d) ...", so read the RIGHT half of each line too). Transcribe it exactly as printed — keep
every sign, fraction (write 1/36, -1/36), symbol (÷, ×, +, -) and colon; do not fix, guess or complete.
If an option is a picture, write "PICTURE". If you cannot find that question, return found=false.
Return JSON: {{"found": true|false, "number": {n}, "stem": "...", "options": {{"a": "...", "b": "...", "c": "...", "d": "...", "e": "..."}}}}"""


# Each model can have its own region (quota) — e.g. MODEL_LOCATIONS="gemini-2.5-flash=us-east1,gemini-2.5-flash-lite=europe-west4";
# transcription needs no reasoning, so 2.5 models run with thinking off (3x faster, same text).
_clients = {}


def client_for(model):
    locs = dict(x.split('=', 1) for x in os.environ.get('MODEL_LOCATIONS', '').split(',') if '=' in x)
    loc = locs.get(model)
    if not loc:
        return client
    if loc not in _clients:
        _clients[loc] = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'), location=loc)
    return _clients[loc]


def call(model, parts):
    extra = {'thinking_config': types.ThinkingConfig(thinking_budget=0)} if model.startswith('gemini-2.5') else {}
    for attempt in range(6):
        try:
            r = client_for(model).models.generate_content(model=model, contents=parts,
                                               config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json', **extra))
            out = json.loads(r.text)
            return out[0] if isinstance(out, list) and out else out
        except Exception as e:
            msg = str(e); wait = min(20 * (attempt + 1), 120) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 5
            if attempt == 5:
                raise
            time.sleep(wait)


def main():
    fails = json.load(open(os.path.join(BOOK, 'reread', 'failures.json'), encoding='utf-8'))
    doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
    primary, second = os.environ.get('PRIMARY_MODEL', 'gemini-2.5-pro'), os.environ.get('SECOND_MODEL', 'gemini-2.5-flash')
    outs = {m: os.path.join(BOOK, 'reread', f'focus_{tag}.jsonl') for m, tag in ((primary, 'pro'), (second, 'flash'))}
    seen = {m: ({json.loads(l)['id'] for l in open(p, encoding='utf-8') if l.strip()} if os.path.exists(p) else set()) for m, p in outs.items()}
    jobs = [(f['t'], m) for f in fails for m in outs if f['t']['id'] not in seen[m]]
    print(f'{len(fails)} rows, {len(jobs)} reads to do', flush=True)

    def one(job):
        t, m = job
        pages = sorted(set(t['pdfPages'] + [t['pdfPages'][-1] + 1]))
        pages = [p for p in pages if 1 <= p <= doc.page_count]
        start = ' '.join(str(t['stem']).split()[:8])
        parts = [types.Part.from_bytes(data=doc[p - 1].get_pixmap(dpi=300).tobytes('png'), mime_type='image/png') for p in pages]
        try:
            out = call(m, parts + [PROMPT.format(n=t['questionNumber'], start=start.replace('"', "'"))])
        except Exception as e:
            print(f'   {t["id"]} {m}: failed {str(e)[:80]}', flush=True); return
        with open(outs[m], 'a', encoding='utf-8') as f:
            f.write(json.dumps({'id': t['id'], 'pages': pages, 'model': m, **(out or {})}, ensure_ascii=False) + '\n')

    with ThreadPoolExecutor(max_workers=int(os.environ.get('FOCUS_WORKERS', '3'))) as ex:
        for k, _ in enumerate(ex.map(one, jobs)):
            if k % 25 == 0:
                print(f'  {k + 1}/{len(jobs)}', flush=True)


main()
