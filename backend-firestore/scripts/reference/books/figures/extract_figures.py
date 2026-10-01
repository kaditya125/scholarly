"""
Non-verbal (figure) question extraction — Track A of the non-verbal plan (owner-approved 29 Sep 2026).

Text OCR cannot capture picture reasoning, so this works from the page images:

  1. READ (model)   — per page: running chapter, the exercise in force, directions, and for each
                      question its number, how many problem / answer figures it has and their labels.
                      On ANSWERS pages: the key and the book's explanation per question, by exercise.
                      The model is trusted only for what it reads well — never for coordinates.
  2. LOCATE (pixels) — each question's row band from the page's ink profile, then each figure box
                      from its top/bottom border ink. Boxes are widened to mid-gap so dashed
                      half-boxes (paper folding) are kept, and outer edges are trimmed back to border
                      ink so exam tags are not.
  3. ACCEPT         — a question's crops are written only when the pixel segmentation finds exactly
                      the number of figures the model read. Anything else is status REVIEW, never a
                      guessed crop.

Writes, per book, under dataset_staging/<book>/figures/:
  crops/p{page}_q{n}_{prob1..|optX}.png, pages/p{page}.json (raw read), manifest.json
Nothing is uploaded or written to Firestore here; see 12-ingest-figure-questions.ts.

  python extract_figures.py --book schand_reasoning --from 741 --to 1176 [--force]
"""
import argparse, io, json, os, re, sys, time
import pymupdf
from PIL import Image
from google import genai
from google.genai import types

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'schand_reasoning': 'schand/reasoning', 'ry_ssc_reasoning': 'rakesh_yadav/ssc_reasoning'}

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='schand_reasoning')
ap.add_argument('--from', dest='frm', type=int, required=True)
ap.add_argument('--to', type=int, required=True)
ap.add_argument('--force', action='store_true', help='re-read pages that already have a pages/p*.json')
args = ap.parse_args()

BOOK = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'))
OUT = os.path.join(BOOK, 'figures')
for d in ('crops', 'pages'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

# Same Vertex project/location/credentials as src/services/ai/googleGenAIClient.ts.
env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=env.get('GOOGLE_VERTEX_LOCATION', 'asia-southeast1'))

READ_PROMPT = """This is one page of a non-verbal (figure) reasoning book. Read it and return JSON:
{
 "chapter": running chapter title at the top of the page, or "",
 "exercise": the EXERCISE label printed on this page (e.g. "1A", "10") if one starts here, else "",
 "exerciseAtTop": true if the questions at the top of the page continue an exercise from an earlier page (no EXERCISE heading above them),
 "directions": the directions text printed on this page for the exercise questions, or "",
 "questions": [ for each numbered EXERCISE question on the page (skip worked "Example" blocks), top to bottom:
    {"number": printed number, "problemCount": how many problem/question figures, "optionLabels": the printed labels of the answer/response figures in order e.g. ["1","2","3","4","5"] or ["A","B","C","D"], "tag": exam tag such as "(Bank P.O. 1993)" or ""} ],
 "answers": [ if this page has an ANSWERS section: {"exercise": the exercise it names e.g. "1D", "number": question number, "key": the answer as printed inside the parentheses e.g. "3" or "B", "explanation": the explanation text after the key, verbatim} ]
}
Transcribe only what is printed. Use [] for lists that don't apply."""


def call_model(png: bytes) -> dict:
    for attempt in range(6):
        try:
            res = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[types.Part.from_bytes(data=png, mime_type='image/png'), READ_PROMPT],
                config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json',
                                                   thinking_config=types.ThinkingConfig(thinking_budget=2048)),
            )
            return json.loads(res.text)
        except Exception as e:  # rate limits share the project's Vertex quota with the live product
            msg = str(e)
            wait = min(15 * (attempt + 1), 90) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 3
            if attempt == 5: raise
            print(f'   retry {attempt + 1}: {msg[:100]} — wait {wait}s', flush=True)
            time.sleep(wait)


def locate(page, qs):
    """Pixel segmentation. Returns {number: (status, problemRects, optionRects)}."""
    W, H = page.rect.width, page.rect.height
    img = Image.open(io.BytesIO(page.get_pixmap(dpi=150).tobytes('png'))).convert('L')
    iw, ih = img.size
    px = img.load()
    cols = [x for x in range(iw) if sum(px[x, y] < 100 for y in range(0, ih, 7)) < (ih / 7) * 0.5]
    if not cols:
        return {q['number']: ('REVIEW: no light columns', [], {}) for q in qs}
    x0c, x1c = min(cols), max(cols)
    dark = [sum(px[x, y] < 128 for x in range(x0c, x1c, 2)) for y in range(ih)]
    thr = sorted(dark)[int(len(dark) * 0.15)] + 6  # blank-row baseline of THIS page
    bands, start = [], None
    for y, d in enumerate(dark + [0]):
        if d > thr and start is None: start = y
        elif d <= thr and start is not None: bands.append([start, y]); start = None
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < 6: merged[-1][1] = b[1]
        else: merged.append(b)
    fig_bands = [b for b in merged if b[1] - b[0] >= 40]
    # Worked examples and headings sit above the exercise; keep the last len(qs) figure bands.
    if len(fig_bands) < len(qs):
        return {q['number']: (f'REVIEW: {len(fig_bands)} bands for {len(qs)} questions', [], {}) for q in qs}
    fig_bands = fig_bands[len(fig_bands) - len(qs):]

    out = {}
    for q, (by0, by1) in zip(qs, fig_bands):
        want_p, labels = int(q.get('problemCount') or 0), [str(l) for l in (q.get('optionLabels') or [])]
        want_o = len(labels)
        frac = [sum(px[x, y] < 128 for y in range(by0, by1)) / (by1 - by0) for x in range(iw)]
        def edge_ink(y0, y1):
            return [any(px[x, y] < 128 for y in range(max(0, y0), min(ih, y1))) for x in range(iw)]
        top, bot = edge_ink(by0, by0 + 5), edge_ink(by1 - 5, by1)
        groups, s, gap = [], None, 0
        for x in range(x0c, x1c + 1):
            if top[x] and bot[x]:
                if s is None: s = x
                gap = 0
            elif s is not None:
                gap += 1
                if gap >= 14: groups.append([s, x - gap]); s = None; gap = 0
        if s is not None: groups.append([s, x1c])
        # Figure boxes are mostly white inside; a mostly-dark group is the scan's black side bar.
        groups = [g for g in groups if g[1] - g[0] >= 40 and sum(frac[g[0]:g[1]]) / (g[1] - g[0]) < 0.5]

        def split(g0, g1, k):
            if k <= 1: return [(g0, g1)]
            edges, e = [], None
            for x in range(g0, g1 + 1):
                if frac[x] >= 0.6:
                    if e is None: e = x
                elif e is not None: edges.append((e + x - 1) // 2); e = None
            if e is not None: edges.append((e + g1) // 2)
            step, cuts = (g1 - g0) / k, []
            for i in range(1, k):
                t = g0 + i * step
                near = [c for c in edges if abs(c - t) < step * 0.35 and c not in cuts]
                if not near: return None
                cuts.append(min(near, key=lambda c: abs(c - t)))
            bnd = [g0] + sorted(cuts) + [g1]
            return list(zip(bnd, bnd[1:]))

        total = want_p + want_o
        if want_p == 0 or want_o == 0:
            out[q['number']] = (f'REVIEW: model read {want_p} problem / {want_o} option figures', [], {}); continue
        if len(groups) == total:
            boxes = [tuple(g) for g in groups]
        elif len(groups) == 2:
            a, b = split(*groups[0], want_p), split(*groups[1], want_o)
            boxes = (a + b) if a and b else []
        else:
            boxes = []
        if len(boxes) != total:
            out[q['number']] = (f'REVIEW: segmented {len(groups)} groups for {want_p}+{want_o} figures', [], {}); continue

        boxes = sorted(boxes)
        gaps = [boxes[i + 1][0] - boxes[i][1] for i in range(len(boxes) - 1)]
        inner = sorted(g for g in gaps if g > 0)
        edge_pad = inner[len(inner) // 2] if inner else 0
        topink = [any(px[x, y] < 128 for y in range(by0, min(ih, by0 + 6))) for x in range(iw)]
        widened = []
        for i, (a, b) in enumerate(boxes):
            left = max(x0c, a - (gaps[i - 1] // 2 if i > 0 else edge_pad))
            right = min(x1c, b + (gaps[i] // 2 if i < len(gaps) else edge_pad))
            if i == 0:
                while left < a and not any(topink[x] for x in range(left, min(a, left + 12) + 1)): left += 1
            if i == len(boxes) - 1:
                while right > b and not any(topink[x] for x in range(max(b, right - 12), right + 1)): right -= 1
            widened.append((left, right))
        rect = lambda a, b: [a / iw * W - 1, by0 / ih * H - 1, b / iw * W + 1, by1 / ih * H + 1]
        out[q['number']] = ('OK', [rect(a, b) for a, b in widened[:want_p]],
                            {lab: rect(a, b) for lab, (a, b) in zip(labels, widened[want_p:])})
    return out


doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
t0 = time.time()
for p in range(args.frm, args.to + 1):
    pj = os.path.join(OUT, 'pages', f'p{p:04d}.json')
    if os.path.exists(pj) and not args.force:
        continue
    page = doc[p - 1]
    read = call_model(page.get_pixmap(dpi=150).tobytes('png'))
    def as_int(v):  # the model returns 32, "32" or "32." interchangeably
        m = re.match(r'^\s*(\d{1,3})\s*\.?\s*$', str(v)) if v is not None else None
        return int(m.group(1)) if m else None
    qs = []
    for q in (read.get('questions') or []):
        if isinstance(q, dict) and as_int(q.get('number')) is not None:
            q['number'] = as_int(q['number']); qs.append(q)
    located = locate(page, qs) if qs else {}
    for q in qs:
        status, prob, opts = located.get(q['number'], ('REVIEW: not located', [], {}))
        q['status'], q['problemRects'], q['optionRects'] = status, prob, opts
        q['crops'] = {}
        if status == 'OK':
            for i, r in enumerate(prob):
                f = f'p{p:04d}_q{q["number"]}_prob{i + 1}.png'
                page.get_pixmap(dpi=200, clip=pymupdf.Rect(r)).save(os.path.join(OUT, 'crops', f)); q['crops'][f'prob{i + 1}'] = f
            for lab, r in opts.items():
                f = f'p{p:04d}_q{q["number"]}_opt{lab}.png'
                page.get_pixmap(dpi=200, clip=pymupdf.Rect(r)).save(os.path.join(OUT, 'crops', f)); q['crops'][f'opt{lab}'] = f
    read['questions'], read['page'] = qs, p
    json.dump(read, open(pj, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    ok = sum(q['status'] == 'OK' for q in qs)
    print(f'p{p}: {len(qs)} questions, {ok} OK, {len(read.get("answers") or [])} keys'
          f'{" | ex " + read["exercise"] if read.get("exercise") else ""}  [{time.time() - t0:.0f}s]', flush=True)

# ── manifest: exercises, keys, join ──────────────────────────────────────────────────────────
pages = sorted((json.load(open(os.path.join(OUT, 'pages', f), encoding='utf-8'))
                for f in os.listdir(os.path.join(OUT, 'pages')) if f.endswith('.json')), key=lambda d: d['page'])

def norm(e):
    """'EXERCISE 9' / 'Exercise 1b' / '1 B' -> '9' / '1B'. Anything else (e.g. 'Sol. 4') -> ''."""
    t = re.sub(r'(?i)exercise', '', str(e or '')).upper().replace(' ', '')
    return t if re.fullmatch(r'\d{1,2}[A-Z]?', t) else ''

def order_key(e):
    m = re.fullmatch(r'(\d+)([A-Z]?)', e)
    return (int(m.group(1)), m.group(2)) if m else (999, e)

# Keys: an answer block's exercise label is printed once; later answers and pages continue it.
keys, ans_ex = {}, ''
for d in pages:
    for a in d.get('answers') or []:
        if not isinstance(a, dict): continue
        if norm(a.get('exercise')): ans_ex = norm(a.get('exercise'))
        m = re.match(r'^\s*(\d{1,3})', str(a.get('number')))
        if ans_ex and m:
            keys.setdefault((ans_ex, int(m.group(1))), {'key': str(a.get('key', '')).strip(), 'explanation': a.get('explanation', '')})

# Exercises on question pages: an explicit heading names one; otherwise numbering restarting at 1
# (or dropping) starts the next exercise in the book's order, as read from the answer blocks.
known = sorted({e for e, _ in keys} | {norm(d.get('exercise')) for d in pages if norm(d.get('exercise'))}, key=order_key)
current, prev_n, chapter, rows = '', None, '', []
for d in pages:
    chapter = d.get('chapter') or chapter
    explicit = norm(d.get('exercise'))
    for i, q in enumerate(d.get('questions', [])):
        n = q['number']
        if i == 0 and explicit and (prev_n is None or n <= 3 or not d.get('exerciseAtTop')):
            current = explicit
        elif prev_n is not None and n < prev_n:
            later = [e for e in known if order_key(e) > order_key(current)] if current else known
            current = later[0] if later else current + '?'
        prev_n = n
        k = keys.get((current, n))
        rows.append({'page': d['page'], 'chapter': chapter, 'exercise': current, 'number': n,
                     'directions': d.get('directions', ''), 'tag': q.get('tag', ''), 'status': q['status'],
                     'optionLabels': q.get('optionLabels', []), 'crops': q.get('crops', {}),
                     'key': k['key'] if k else None, 'explanation': k['explanation'] if k else None})
json.dump(rows, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

# Per-exercise reconciliation: a question count far from the key count means the boundaries are off.
from collections import Counter
qn, kn = Counter(r['exercise'] for r in rows), Counter(e for e, _ in keys)
ok = [r for r in rows if r['status'] == 'OK']
print()
print(f'manifest: {len(rows)} questions | crops OK {len(ok)} | OK with key {sum(1 for r in ok if r["key"])} | keys read {len(keys)}')
for e in sorted(set(qn) | set(kn), key=order_key):
    flag = '' if abs(qn[e] - kn[e]) <= max(2, kn[e] * 0.1) else '   <-- mismatch'
    print(f'  ex {e:5} questions {qn[e]:4}  keys {kn[e]:4}{flag}')
