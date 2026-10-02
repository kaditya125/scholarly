"""
SSC-pattern General Awareness MCQs from Lucent's GK (owner request 1 Oct 2026: "ocr the gk also as per
the pattern of ssc syllabus"). The book has no objective questions of its own — it is the facts.

  1. write  — gemini-3-flash-preview writes 1–4 MCQs per passage (dataset_staging/lucent/gk/
              chunks.enriched.json, already OCR'd and sorted into History / Geography / Polity /
              Economy / General Science / Static GK), using ONLY facts the passage states, each with
              an exact quote from the passage that proves the answer.
  2. check  — qwen3-235b answers every finished MCQ blind (options as written, no evidence).
gk-mcq-apply.ts accepts an MCQ only if the quote is verbatim in the passage AND qwen picked the same
option. Results: dataset_staging/lucent/gk/mcq/{write,check}.jsonl (resumable by id).

  python gk_mcq_build.py write|check [--limit N]
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import google.auth, google.auth.transport.requests
from google import genai
from google.genai import types

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
GK = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging', 'lucent', 'gk'))
OUT = os.path.join(GK, 'mcq')
os.makedirs(OUT, exist_ok=True)
mode = sys.argv[1]
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None

env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
PROJECT = env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4')
WRITER = os.environ.get('GK_WRITER', 'gemini-3-flash-preview')
gem = genai.Client(vertexai=True, project=PROJECT, location=os.environ.get('GK_LOCATION', 'global'))   # batch work: not live chat's region
_cred, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
QWEN = 'qwen/qwen3-235b-a22b-instruct-2507-maas'
CATEGORIES = {'History', 'Geography', 'Indian Polity', 'Economy', 'General Science', 'Static GK'}

WRITE_PROMPT = """You write SSC CGL / CHSL "General Awareness" MCQs from one passage of Lucent's General Knowledge.
Rules:
- Use ONLY facts stated explicitly in the passage. Nothing from outside it, no inference, no current affairs.
- Write {n} questions in the SSC style: one short direct question, four options of the same kind
  (all persons, all years, all places, …), exactly one correct; distractors plausible to a candidate
  but clearly wrong per the passage. No "all/none of the above", no "both A and B", no negatives
  ("which is NOT") unless the passage lists the full set.
- Prefer facts SSC actually asks: who/what/where/when, firsts, articles and schedules, rivers and
  passes, organs and vitamins, units and inventors, committees and plans.
- "evidence": copy the exact words from the passage (8–35 words, verbatim, no changes) that prove the answer.
- If the passage has no examinable fact (a heading, a list fragment, a table header), return no items.
Return only JSON: {{"items": [{{"question": "...", "options": ["...", "...", "...", "..."], "answer": "a"|"b"|"c"|"d", "evidence": "..."}}]}}

Topic: {cat} — {where}
Passage:
{text}"""

CHECK_PROMPT = """Answer these General Awareness MCQs (SSC level). Choose the single correct option for each;
if a question is ambiguous or has no single correct option, answer null.
Return only JSON: {"answers": [{"id": "<id>", "answer": "a"|"b"|"c"|"d"|null}]}

"""


def retry(fn):
    for attempt in range(6):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            wait = min(20 * (attempt + 1), 120) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 5
            if attempt == 5:
                raise
            time.sleep(wait)


def ask_gemini(prompt):
    def go():
        r = gem.models.generate_content(model=WRITER, contents=[prompt],
                                        config=types.GenerateContentConfig(temperature=0.2, response_mime_type='application/json',
                                                                   **({'thinking_config': types.ThinkingConfig(thinking_budget=int(os.environ['GK_THINKING']))} if os.environ.get('GK_THINKING') else {})))
        return json.loads(r.text)
    return retry(go)


def ask_qwen(prompt):
    def go():
        if not _cred.valid:
            _cred.refresh(google.auth.transport.requests.Request())
        req = urllib.request.Request(
            f'https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/endpoints/openapi/chat/completions',
            data=json.dumps({'model': QWEN, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0, 'max_tokens': 3000}).encode(),
            headers={'Authorization': 'Bearer ' + _cred.token, 'Content-Type': 'application/json'})
        text = json.load(urllib.request.urlopen(req, timeout=180))['choices'][0]['message']['content']
        return json.loads(re.search(r'\{.*\}', text, re.S).group(0))
    return retry(go)


def all_lines(path):
    """A results file plus its shard files (write.jsonl, write.s0.jsonl, …)."""
    import glob
    base, ext = os.path.splitext(path)
    return [json.loads(l) for f in [path] + sorted(glob.glob(base + '.s*' + ext)) if os.path.exists(f)
            for l in open(f, encoding='utf-8') if l.strip()]


def done(path):
    return {r['id'] for r in all_lines(path)}


def passages():
    chunks = json.load(open(os.path.join(GK, 'chunks.enriched.json'), encoding='utf-8'))
    chunks = chunks if isinstance(chunks, list) else chunks.get('chunks', chunks)
    out = []
    for c in chunks:
        text = str(c.get('text') or '').strip()
        if c.get('category') not in CATEGORIES or c.get('relevance') == 'navigation' or len(text) < 400:
            continue
        out.append(c)
    return out


def write():
    path = os.path.join(OUT, 'write.jsonl')
    seen = done(path)
    if os.environ.get('GK_SHARD'):
        path = os.path.join(OUT, f"write.s{os.environ['GK_SHARD'].split('/')[0]}.jsonl")
    todo = [c for c in passages() if c['chunk_id'] not in seen][:limit]
    if os.environ.get('GK_SHARD'):   # "k/n": this process writes only its share (two regions = two quotas)
        import zlib
        k, n = map(int, os.environ['GK_SHARD'].split('/'))
        todo = [c for c in todo if zlib.crc32(c['chunk_id'].encode()) % n == k]
    print(f'{len(todo)} passages to write from', flush=True)

    def one(c):
        text = str(c['text']).strip()
        n = max(1, min(4, len(text) // 700))
        where = ' / '.join(x for x in (c.get('chapter'), c.get('topic'), c.get('subtopic')) if x)
        try:
            out = ask_gemini(WRITE_PROMPT.format(n=n, cat=c['category'], where=where, text=text[:6000]))
        except Exception as e:
            print(f'   {c["chunk_id"]}: failed {str(e)[:80]}', flush=True); return
        items = out.get('items') if isinstance(out, dict) else out
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'id': c['chunk_id'], 'model': WRITER, 'items': items or []}, ensure_ascii=False) + '\n')

    with ThreadPoolExecutor(max_workers=int(os.environ.get('GK_WORKERS', '6'))) as ex:
        for k, _ in enumerate(ex.map(one, todo)):
            if k % 50 == 0:
                print(f'  {k + 1}/{len(todo)}', flush=True)


def check():
    wpath, cpath = os.path.join(OUT, 'write.jsonl'), os.path.join(OUT, 'check.jsonl')
    seen = done(cpath)
    mcqs = []
    for w in all_lines(wpath):
        for i, it in enumerate(w.get('items') or []):
            mid = f"{w['id']}#{i}"
            if mid not in seen and len(it.get('options') or []) == 4:
                mcqs.append({'id': mid, 'q': it['question'], 'options': it['options']})
    print(f'{len(mcqs)} MCQs to check blind', flush=True)
    batches = [mcqs[i:i + 8] for i in range(0, len(mcqs), 8)]

    def one(b):
        try:
            out = ask_qwen(CHECK_PROMPT + '\n\n'.join(f"[{m['id']}] {m['q']}\n" + '\n'.join(f"({'abcd'[i]}) {o}" for i, o in enumerate(m['options'])) for m in b))
        except Exception as e:
            print(f'   batch failed {str(e)[:80]}', flush=True); return
        got = {str(a.get('id')): a.get('answer') for a in (out.get('answers') or [])}
        with open(cpath, 'a', encoding='utf-8') as f:
            for m in b:
                if m['id'] in got:
                    f.write(json.dumps({'id': m['id'], 'answer': (str(got[m['id']]).lower() if got[m['id']] else None)}) + '\n')

    with ThreadPoolExecutor(max_workers=4) as ex:
        for k, _ in enumerate(ex.map(one, batches)):
            if k % 25 == 0:
                print(f'  batch {k + 1}/{len(batches)}', flush=True)


{'write': write, 'check': check}[mode]()
