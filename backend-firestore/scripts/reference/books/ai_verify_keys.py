"""
AI-verified answer keys for book-bank rows the book left unkeyed (owner approval, 1 Oct 2026).

Two independent models from different families answer every question; ai-keys-apply.ts accepts a key
only when both name the same option. Either may answer null ("can't be answered from what's given":
a missing table, passage or figure) — null never counts as agreement.

  key   (targets.json, from ai-key-targets.ts) — an MCQ whose book printed no key:
        gemini-2.5-pro and qwen3-235b each pick an option.
  build (open.json, from ai-open-targets.ts) — an open exercise item (Lucent English "change the
        narration", "fill in the articles"…): gemini-2.5-pro writes the full question, its correct
        answer and three distractors (or rejects the item); qwen3-235b then answers the finished MCQ
        with shuffled options, blind to the intended answer.

Results append to dataset_staging/ai_keys/<mode>_<model>.jsonl (resumable by id).

  python ai_verify_keys.py key|build [--limit N]
"""
import json, os, random, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import google.auth, google.auth.transport.requests
from google import genai
from google.genai import types

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging', 'ai_keys'))
mode = sys.argv[1]
limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
# --shard k/n: this process builds only items whose id hashes to k (two regions = two quotas);
# each shard writes its own build_gemini.sN.jsonl, every reader takes them all.
shard = tuple(map(int, sys.argv[sys.argv.index('--shard') + 1].split('/'))) if '--shard' in sys.argv else None
import glob, zlib

env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
PROJECT = env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4')
gem = genai.Client(vertexai=True, project=PROJECT, location=os.environ.get('AI_KEYS_LOCATION', 'global'))   # batch work: not the region live chat uses
_cred, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
QWEN = 'qwen/qwen3-235b-a22b-instruct-2507-maas'
LETTERS = 'abcde'


def retry(fn):
    for attempt in range(6):
        try:
            return fn()
        except Exception as e:
            msg = str(e) + (e.read().decode()[:200] if hasattr(e, 'read') else '')
            wait = min(20 * (attempt + 1), 120) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 5
            if attempt == 5:
                raise
            print(f'   retry {attempt + 1}: {msg[:90]} — wait {wait}s', flush=True); time.sleep(wait)


def ask_gemini(prompt: str) -> dict:
    def go():
        r = gem.models.generate_content(model=GEMINI_MODEL, contents=[prompt],
                                        config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json'))
        return json.loads(r.text)
    return retry(go)


def ask_maas(model: str, prompt: str, max_tokens: int) -> dict:
    """A Model Garden model on Vertex's global OpenAI-compatible endpoint; JSON pulled from its reply."""
    def go():
        if not _cred.valid:
            _cred.refresh(google.auth.transport.requests.Request())
        req = urllib.request.Request(
            f'https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/endpoints/openapi/chat/completions',
            data=json.dumps({'model': model, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0, 'max_tokens': max_tokens}).encode(),
            headers={'Authorization': 'Bearer ' + _cred.token, 'Content-Type': 'application/json'})
        text = json.load(urllib.request.urlopen(req, timeout=600))['choices'][0]['message'].get('content') or ''
        m = re.search(r'\{.*\}', text, re.S)
        if not m:
            raise ValueError('no JSON in reply (empty or cut off)')
        return json.loads(m.group(0))
    return retry(go)


KIMI = 'moonshotai/kimi-k2-thinking-maas'
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-pro')


def ask_qwen(prompt: str) -> dict:
    def go():
        if not _cred.valid:
            _cred.refresh(google.auth.transport.requests.Request())
        req = urllib.request.Request(
            f'https://aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/global/endpoints/openapi/chat/completions',
            data=json.dumps({'model': QWEN, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': 0, 'max_tokens': 4000}).encode(),
            headers={'Authorization': 'Bearer ' + _cred.token, 'Content-Type': 'application/json'})
        text = json.load(urllib.request.urlopen(req, timeout=180))['choices'][0]['message']['content']
        m = re.search(r'\{.*\}', text, re.S)
        return json.loads(m.group(0))
    return retry(go)


def mcq_text(q, options):
    head = f"[{q['id']}] ({q.get('subject', '')}, chapter: {q.get('chapterName', '')})\n"
    if q.get('directions'):
        head += f"Directions: {q['directions']}\n"
    return head + f"Q: {q['stem']}\n" + '\n'.join(f'({LETTERS[i]}) {o}' for i, o in enumerate(options))


KEY_PROMPT = """You are checking answer keys for competitive-exam MCQs (SSC/IBPS level) taken from a textbook.
For each question, work it out and choose the single correct option. If it cannot be answered from the
text given (it refers to a missing figure, table, passage or data), or no option is correct, or more
than one is, answer null. Return only JSON: {"answers": [{"id": "<id>", "answer": "a"|"b"|"c"|"d"|"e"|null}]}

"""

BUILD_PROMPT = """You are turning items from an English grammar textbook's open exercises into exam MCQs (SSC level).
Each item comes with its chapter (which tells the task: Narration = change the speech, Articles = fill
the blanks with a/an/the, Synthesis = combine into one sentence, Transformation = rewrite as instructed…)
and any printed directions. For each item:
 - if it is not a usable exercise item (a vocabulary list, a heading, a fragment, ambiguous task), return usable=false;
 - otherwise write the complete question (instruction + the item), the single correct answer exactly as
   a careful examiner would accept it, and three distractors that are plausible but clearly wrong
   (common learner errors), each a complete answer of the same kind and length as the correct one.
Return only JSON: {"items": [{"id": "<id>", "usable": true|false, "question": "...", "correct": "...", "distractors": ["...", "...", "..."]}]}

"""


def shard_files(path):
    base, ext = os.path.splitext(path)
    return [path] + sorted(glob.glob(base + '.s*' + ext))


def read_all(path):
    return [json.loads(l) for f in shard_files(path) if os.path.exists(f) for l in open(f, encoding='utf-8') if l.strip()]


def done_ids(path):
    return {r['id'] for r in read_all(path)}


def run_batches(items, size, workers, fn, path):
    batches = [items[i:i + size] for i in range(0, len(items), size)]

    def one(b):
        try:
            res = fn(b)
        except Exception as e:
            print(f'   batch failed: {str(e)[:100]}', flush=True); return
        with open(path, 'a', encoding='utf-8') as f:
            for r in res:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for k, _ in enumerate(ex.map(one, batches)):
            if k % 10 == 0:
                print(f'  {path.split(os.sep)[-1]}: batch {k + 1}/{len(batches)}', flush=True)


def keys(src='targets.json', prefix='key'):
    """Blind answers from gemini and qwen. audit mode: the same, over printed-key rows (audit_<book>.json)."""
    targets = json.load(open(os.path.join(OUT, src), encoding='utf-8'))[:limit]
    workers_g = int(os.environ.get('BUILD_WORKERS', '2'))
    only = os.environ.get('ONLY_MODEL')   # run one side alone (the other's stragglers needn't block it)
    for model, ask, workers in (('gemini', ask_gemini, workers_g), ('qwen', ask_qwen, 4)):
        if only and model != only:
            continue
        path = os.path.join(OUT, f'{prefix}_{model}.jsonl')
        seen = done_ids(path)
        todo = [t for t in targets if t['id'] not in seen]
        print(f'{model}: {len(todo)} to answer', flush=True)

        def fn(b, ask=ask):
            out = ask(KEY_PROMPT + '\n\n'.join(mcq_text(q, q['options']) for q in b))
            got = {str(a.get('id')): a.get('answer') for a in (out.get('answers') or [])}
            return [{'id': q['id'], 'answer': (str(got[q['id']]).lower() if got.get(q['id']) else None)} for q in b if q['id'] in got]
        run_batches(todo, 6, workers, fn, path)


def build():
    items = json.load(open(os.path.join(OUT, 'open.json'), encoding='utf-8'))[:limit]
    gpath = os.path.join(OUT, 'build_gemini.jsonl')
    seen = done_ids(gpath)
    todo = [t for t in items if t['id'] not in seen]
    if shard:
        todo = [t for t in todo if zlib.crc32(t['id'].encode()) % shard[1] == shard[0]]
        out_path = os.path.join(OUT, f'build_gemini.s{shard[0]}.jsonl')
    else:
        out_path = gpath
    print(f'gemini build: {len(todo)} items', flush=True)

    def gfn(b):
        out = ask_gemini(BUILD_PROMPT + '\n\n'.join(
            f"[{q['id']}] chapter: {q['chapterName']}\n" + (f"Directions: {q['directions']}\n" if q.get('directions') else '') + f"Item: {q['stem']}" for q in b))
        by = {str(x.get('id')): x for x in (out.get('items') or [])}
        return [{'id': q['id'], 'model': GEMINI_MODEL, **{k: by[q['id']].get(k) for k in ('usable', 'question', 'correct', 'distractors')}} for q in b if q['id'] in by]
    run_batches(todo, 6, int(os.environ.get('BUILD_WORKERS', '2')), gfn, out_path)
    if shard:
        return   # the blind check runs once, unsharded, after every shard is done

    built = read_all(gpath)
    qpath = os.path.join(OUT, 'build_qwen.jsonl')
    seen = done_ids(qpath)
    mcqs = []
    for b in built:
        if b['id'] in seen or not b.get('usable') or not b.get('question') or not b.get('correct') or len(b.get('distractors') or []) != 3:
            continue
        opts = [b['correct']] + list(b['distractors'])
        random.Random(b['id']).shuffle(opts)        # fixed per item, so a rerun asks the same thing
        mcqs.append({'id': b['id'], 'stem': b['question'], 'options': opts})
    print(f'qwen blind check: {len(mcqs)} MCQs', flush=True)

    def qfn(b):
        out = ask_qwen(KEY_PROMPT + '\n\n'.join(mcq_text(q, q['options']) for q in b))
        got = {str(a.get('id')): a.get('answer') for a in (out.get('answers') or [])}
        return [{'id': q['id'], 'options': q['options'], 'answer': (str(got[q['id']]).lower() if got.get(q['id']) else None)} for q in b if q['id'] in got]
    run_batches(mcqs, 6, 4, qfn, qpath)


def tiebreak():
    """A third family (Kimi K2, thinking) answers only where gemini and qwen did not agree."""
    targets = json.load(open(os.path.join(OUT, 'targets.json'), encoding='utf-8'))
    g = {r['id']: r.get('answer') for r in read_all(os.path.join(OUT, 'key_gemini.jsonl'))}
    q = {r['id']: r.get('answer') for r in read_all(os.path.join(OUT, 'key_qwen.jsonl'))}
    disputed = [t for t in targets if t['id'] in g and t['id'] in q and not (g[t['id']] and g[t['id']] == q[t['id']])]
    path = os.path.join(OUT, 'key_kimi.jsonl')
    seen = done_ids(path)
    todo = [t for t in disputed if t['id'] not in seen]
    print(f'kimi tiebreak: {len(todo)} of {len(disputed)} disputed', flush=True)

    def fn(b):
        out = ask_maas(KIMI, KEY_PROMPT + '\n\n'.join(mcq_text(x, x['options']) for x in b), 32000)
        got = {str(a.get('id')): a.get('answer') for a in (out.get('answers') or [])}
        return [{'id': x['id'], 'answer': (str(got[x['id']]).lower() if got.get(x['id']) else None)} for x in b if x['id'] in got]
    run_batches(todo, 3, 3, fn, path)


def audit():
    book = os.environ['AUDIT_BOOK']
    keys(src=f'audit_{book}.json', prefix=f'audit_{book}')


{'key': keys, 'build': build, 'tiebreak': tiebreak, 'audit': audit}[mode]()
