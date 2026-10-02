"""
Figure segmentation, third method — for multi-column picture pages (Rakesh Yadav's SSC Reasoning):
three columns, questions flowing from one column into the next ("Answer Figures" of Q13 at the top
of column 2), a problem figure plus a strip of touching answer boxes, and a diagonal watermark.
Neither pixel-only method can follow the column flow, and pure model boxes drift.

So each does what it's good at:
  - the MODEL says which boxes belong to which question, and which are problem vs option figures
    (rough [ymin, xmin, ymax, xmax] boxes, 0–1000) — and whether the options are printed as text;
  - PIXELS decide the exact edges: every model box is snapped to the ink blob it overlaps most
    (segment_v2's blob pipeline: speck removal, blob growing, nested-frame removal, strip splitting).
A question is accepted only when EVERY one of its boxes snaps (IoU ≥ 0.4), no blob is claimed twice
on the page, and its option figures are of consistent size. Anything else is REVIEW, never guessed.

Writes figures/pages_v3/p{page}.json and crops/p{page}_q{n}_{prob1|optX}.png.

  python segment_v3.py --book ry_ssc_reasoning --pages 489,490 | --from 474 --to 533 [--force]
"""
import argparse, io, json, os, re, sys, time
import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage
from google import genai
from google.genai import types

sys.path.insert(0, os.path.dirname(__file__))
from segment_v2 import split_strip

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'schand_reasoning': 'schand/reasoning', 'ry_ssc_reasoning': 'rakesh_yadav/ssc_reasoning'}
DPI = 150

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='ry_ssc_reasoning')
ap.add_argument('--pages', default='')
ap.add_argument('--from', dest='frm', type=int)
ap.add_argument('--to', type=int)
ap.add_argument('--force', action='store_true')
ap.add_argument('--replan', action='store_true', help='re-place figures using the saved page reading')
args = ap.parse_args()

BOOK = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'))
FIG = os.path.join(BOOK, 'figures')
OUT = os.path.join(FIG, 'pages_v3')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(FIG, 'crops'), exist_ok=True)

env = {}
for line in open(os.path.join(BACKEND, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.rstrip('\n').split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
cred = env.get('GOOGLE_APPLICATION_CREDENTIALS', '')
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = cred if os.path.isabs(cred) else os.path.join(BACKEND, cred)
client = genai.Client(vertexai=True, project=env.get('GOOGLE_VERTEX_PROJECT', 'eng-cache-501514-q4'),
                      location=env.get('GOOGLE_VERTEX_LOCATION', 'asia-southeast1'))

PROMPT = """This page of a reasoning book has numbered questions with figures, laid out in columns;
a question can continue at the top of the next column. For EVERY numbered question on the page
(skip worked examples and answer-key/solution pages) return JSON:
{"questions":[{"number": n,
  "problemBoxes": [[ymin,xmin,ymax,xmax], ...]  — each problem/question figure, left to right,
  "optionLabels": ["a","b","c","d"] as printed (or ["1","2","3","4","5"]),
  "optionBoxes": [[ymin,xmin,ymax,xmax], ...]  — one box PER answer figure, in label order; [] if the options are printed as text,
  "optionsAreText": true|false}]}
Boxes are 0–1000 page coordinates, tight around each figure's own frame. Do not merge separate answer figures."""


def call_model(png: bytes) -> dict:
    for attempt in range(6):
        try:
            res = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[types.Part.from_bytes(data=png, mime_type='image/png'), PROMPT],
                config=types.GenerateContentConfig(temperature=0, response_mime_type='application/json',
                                                   thinking_config=types.ThinkingConfig(thinking_budget=2048)))
            out = json.loads(res.text)
            # The model sometimes returns the question list bare instead of {"questions": [...]}.
            return {'questions': out} if isinstance(out, list) else out
        except Exception as e:
            msg = str(e); wait = min(15 * (attempt + 1), 90) if ('429' in msg or 'RESOURCE_EXHAUSTED' in msg) else 3
            if attempt == 5: raise
            print(f'   retry {attempt + 1}: {msg[:90]} — wait {wait}s', flush=True); time.sleep(wait)


def blobs(page):
    """segment_v2's pipeline, page-wide: figure-sized blobs with touching strips split."""
    img = Image.open(io.BytesIO(page.get_pixmap(dpi=DPI).tobytes('png'))).convert('L')
    a = np.asarray(img)
    ink = a < 128                       # the diagonal watermark is light grey — below this, not ink
    ink[:, ink.mean(axis=0) > 0.5] = False
    raw, _ = ndimage.label(ink, structure=np.ones((3, 3)))
    keep = np.zeros(raw.max() + 1, bool)
    for i, sl in enumerate(ndimage.find_objects(raw), start=1):
        if sl is not None and not (sl[0].stop - sl[0].start <= 22 and sl[1].stop - sl[1].start <= 45):
            keep[i] = True
    lab, _ = ndimage.label(ndimage.binary_dilation(keep[raw], iterations=4))
    comps = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if y1 - y0 >= 30 and x1 - x0 >= 30:
            comps.append([x0, y0, x1, y1])
    inside = lambda a_, b_: a_ is not b_ and a_[0] >= b_[0] - 2 and a_[2] <= b_[2] + 2 and a_[1] >= b_[1] - 2 and a_[3] <= b_[3] + 2
    comps = [c for c in comps if not any(inside(c, d) for d in comps)]
    out = []
    for c in comps:
        w, h = c[2] - c[0], c[3] - c[1]
        k = round(w / max(h, 1))
        parts = split_strip(ink, c[0], c[2], c[1], c[3], k) if k >= 2 else None
        out += [[p0, c[1], p1, c[3]] for p0, p1 in parts] if parts else [c]
    return out, a.shape


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / float((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter or 1)


pages = [int(p) for p in args.pages.split(',') if p] or (list(range(args.frm, args.to + 1)) if args.frm else [])
doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
for p in pages:
    pj = os.path.join(OUT, f'p{p:04d}.json')
    if os.path.exists(pj) and not (args.force or args.replan):
        continue
    page = doc[p - 1]
    if args.replan and os.path.exists(pj):
        # Re-place figures from the saved reading of this page — no model call.
        saved = json.load(open(pj, encoding='utf-8'))
        read = {'questions': [{'number': q['number'], 'optionLabels': q['optionLabels'], 'optionsAreText': q['optionsAreText'],
                               'problemBoxes': [0] * q['nProb'], 'optionBoxes': [0] * q['nOpt']} for q in saved['questions']]}
    else:
        read = call_model(page.get_pixmap(dpi=DPI).tobytes('png'))
    bl, (ih, iw) = blobs(page)
    W, H = page.rect.width, page.rect.height
    # Figures only: no header/footer band (the "Best PDF …" footer is ink), roughly box-shaped,
    # at least ~0.27 inch tall (the "2012" year headings between questions are smaller).
    figs = [c for c in bl if c[1] > 0.03 * ih and c[3] < 0.93 * ih
            and c[3] - c[1] >= 40 and c[2] - c[0] >= 30 and 1 / 3 < (c[2] - c[0]) / (c[3] - c[1]) < 3]
    # Reading order: down column 1, then column 2, then column 3 — questions flow across columns.
    col = lambda c: int(((c[0] + c[2]) / 2) // (iw / 3))
    figs.sort(key=lambda c: (col(c), c[1]))

    plan = []
    for q in read.get('questions') or []:
        try:
            n = int(str(q.get('number')).strip().rstrip('.'))
        except Exception:
            continue
        labels = [str(x) for x in (q.get('optionLabels') or [])]
        text_opts = bool(q.get('optionsAreText')) or not (q.get('optionBoxes') or [])
        plan.append({'number': n, 'optionLabels': labels, 'optionsAreText': text_opts,
                     'nProb': max(1, len(q.get('problemBoxes') or [])), 'nOpt': 0 if text_opts else len(labels)})
    # Text-layer anchors (the PDF carries its own text): where each question number and each
    # "Answer Figure(s)" label sits, in reading order (column, then y), in page points.
    k = W / iw
    pos = lambda colno, y: colno * 100000 + y
    words = page.get_text('words')
    # Numbers and labels start at their column's left edge, which can sit just short of a page third.
    wcol = lambda w: int((w[0] + 30) // (W / 3))
    nums = [w for w in words if re.fullmatch(r'\d{1,3}\.', w[4])]
    colleft = {}
    for w in nums:
        c_ = wcol(w); colleft[c_] = min(colleft.get(c_, 1e9), w[0])
    anchor = {}
    for w in nums:
        c_ = wcol(w)
        if w[0] - colleft[c_] < 12:   # a question number starts its column line; "1." in text doesn't
            anchor.setdefault(int(w[4][:-1]), pos(c_, w[1]))
    # A solution page prints "27. (b)" — the number, then its key — and redraws the figures with
    # lettered vertices: never question figures. Several such entries mark the page.
    wi = {id(w): j for j, w in enumerate(words)}
    keyed = sum(1 for w in nums if wi[id(w)] + 1 < len(words) and re.fullmatch(r'\([a-e]\)', words[wi[id(w)] + 1][4]))
    keyed += sum(1 for w in words if re.fullmatch(r'\d{1,3}\.\s*\([a-e]\)', w[4]))   # "54.(b)" as one word
    solution_page = keyed >= 3
    # The label, not the word in a question sentence ("which of the answer figures…").
    answer_at = sorted(pos(wcol(w), w[1]) for j, w in enumerate(words)
                       if w[4].startswith('Answer') and j + 1 < len(words) and words[j + 1][4].lower().startswith('fig'))
    order = sorted(anchor.values())
    fpos = lambda c: pos(col(c), c[1] * k)
    def text_check(n, probs, opts):
        """Why the text layer contradicts this placement of question n, or None (no text layer: None)."""
        if not anchor:
            return None
        a = anchor.get(n)
        if a is None:
            return 'question number not in the text layer'
        nxt = next((o for o in order if o > a), 10 ** 9)
        if any(not (a - 10 < fpos(c) < nxt) for c in probs + opts):
            return 'figure outside its question'
        if opts:
            ans = next((x for x in answer_at if a < x < nxt), None)
            if ans is None:
                return 'no answer label for this question'
            if any(fpos(c) < ans for c in opts) or any(fpos(c) > ans for c in probs):
                return 'figures on the wrong side of the answer label'
        return None
    def valid(probs, opts, n=None):
        """Why this candidate assignment is wrong, or None."""
        if len(probs) < 1:
            return 'no problem figure'
        if n is not None:
            why = text_check(n, probs, opts)
            if why:
                return why
        if opts:
            hs = [c[3] - c[1] for c in opts]; ws = [c[2] - c[0] for c in opts]
            yc = [(c[1] + c[3]) / 2 for c in opts]
            if len({col(c) for c in opts}) > 1 or max(yc) - min(yc) > 0.3 * min(hs):
                return 'options not in one row'
            if any(opts[k + 1][0] <= opts[k][0] for k in range(len(opts) - 1)):
                return 'options out of order'
            if max(hs) > 1.3 * min(hs) or max(ws) > 1.6 * min(ws):
                return 'uneven option figures'
            # The problem figure comes before its options: above them in the same column, or at the
            # bottom of an earlier column when the question flows over.
            if any(col(p_) == col(opts[0]) and p_[3] > opts[0][1] + 5 for p_ in probs):
                return 'problem figure not above its options'
            # and it isn't itself part of the answer row.
            if any(col(p_) == col(opts[0]) and abs((p_[1] + p_[3]) / 2 - yc[0]) < 0.3 * min(hs) for p_ in probs):
                return 'problem figure sits in the answer row'
        return None

    # Pass 1 — questions with FIGURE options, anchored on their answer row. Each is searched from the
    # previous match onward, skipping at most 2 stray blobs (a year heading, a text question's word):
    # a stray can't be part of a valid row of equal, aligned boxes, so skipping it can't shift anything.
    if solution_page:
        plan = []
    at = {}          # plan index -> (start, end) in figs
    # Pass 0 — questions with TEXT options, placed straight from the text layer: their figures are
    # the blobs between their own number and the next question's number, and there must be exactly
    # as many as the reading counted (a divided strip cut into abutting boxes is rejoined first).
    if anchor:
        for qi, q in enumerate(plan):
            if q['nOpt'] != 0 or q['number'] not in anchor:
                continue
            a = anchor[q['number']]; nxt = next((o for o in order if o > a), 10 ** 9)
            idx = [j for j, c in enumerate(figs) if a - 10 < fpos(c) < nxt]
            if not idx or idx != list(range(idx[0], idx[-1] + 1)) or any(idx[0] < at[x][1] and at[x][0] <= idx[-1] for x in at):
                continue
            s_, e_ = idx[0], idx[-1] + 1
            seg = figs[s_:e_]
            if len(seg) > q['nProb']:
                merged = []
                for c in seg:
                    m = merged[-1] if merged else None
                    if m and col(m) == col(c) and abs(m[1] - c[1]) <= 3 and abs(m[3] - c[3]) <= 3 and 0 <= c[0] - m[2] <= 3:
                        merged[-1] = [m[0], min(m[1], c[1]), c[2], max(m[3], c[3])]
                    else:
                        merged.append(list(c))
                if len(merged) == q['nProb']:
                    shift = len(seg) - len(merged)
                    figs[s_:e_] = merged; seg = merged
                    at = {x: ((u - shift, v - shift) if u >= e_ else (u, v)) for x, (u, v) in at.items()}
                    e_ = s_ + len(merged)
            if len(seg) == q['nProb']:
                at[qi] = (s_, e_)
    # Pass 0b — questions with FIGURE options, placed straight from the text layer: blobs between the
    # question's number and its "Answer Figures" label are its problem figures, blobs after the label
    # and before the next number are its options, read row by row (answers print as one row or as a
    # 2×2 grid, (a)(b) over (c)(d)). Counts must match the reading exactly; options must be even.
    if anchor:
        for qi, q in enumerate(plan):
            if q['nOpt'] == 0 or qi in at or q['number'] not in anchor:
                continue
            a = anchor[q['number']]; nxt = next((o for o in order if o > a), 10 ** 9)
            ans = next((x for x in answer_at if a < x < nxt), None)
            if ans is None:
                continue
            idx = [j for j, c in enumerate(figs) if a - 10 < fpos(c) < nxt]
            if not idx or idx != list(range(idx[0], idx[-1] + 1)) or any(idx[0] < at[x][1] and at[x][0] <= idx[-1] for x in at):
                continue
            probs = [figs[j] for j in idx if fpos(figs[j]) < ans]
            opts = [figs[j] for j in idx if fpos(figs[j]) >= ans]
            if len(probs) != q['nProb'] or len(opts) != q['nOpt'] or len({col(c) for c in opts}) > 1:
                continue
            hs = [c[3] - c[1] for c in opts]; ws = [c[2] - c[0] for c in opts]
            if max(hs) > 1.3 * min(hs) or max(ws) > 1.6 * min(ws):
                continue
            rows_ = []
            for c in sorted(opts, key=lambda c: (c[1] + c[3]) / 2):
                if rows_ and abs((c[1] + c[3]) / 2 - (rows_[-1][0][1] + rows_[-1][0][3]) / 2) < 0.5 * min(hs):
                    rows_[-1].append(c)
                else:
                    rows_.append([c])
            if len({len(r) for r in rows_}) > 1:
                continue   # a ragged grid: can't tell which label is which
            opts = [c for r in rows_ for c in sorted(r, key=lambda c: c[0])]
            figs[idx[0]:idx[-1] + 1] = probs + opts
            at[qi] = (idx[0], idx[-1] + 1)
    i = 0
    slack = 2        # strays that may be skipped, plus the figures of questions that failed before
    for qi, q in enumerate(plan):
        if q['nOpt'] == 0:
            if qi in at:
                i = max(i, at[qi][1])
            else:
                slack += q['nProb']
            continue
        found = False
        for j in range(i, min(i + slack + 1, len(figs))):
            probs = figs[j:j + q['nProb']]; opts = figs[j + q['nProb']:j + q['nProb'] + q['nOpt']]
            if len(opts) == q['nOpt'] and valid(probs, opts, q['number']) is None:
                at[qi] = (j, j + q['nProb'] + q['nOpt']); i = at[qi][1]; found = True; break
        # A failed question's figures are still on the page: let the next search look past them.
        slack = 2 if found else slack + q['nProb'] + q['nOpt']
    # Pass 2 — questions with TEXT options need only their problem figure(s); accepted only when the
    # neighbours on both sides were matched and exactly that many blobs lie between them.
    for qi, q in enumerate(plan):
        if q['nOpt'] != 0 or qi in at:
            continue
        prev = max((at[k][1] for k in at if k < qi), default=0)
        nxt = min((at[k][0] for k in at if k > qi), default=len(figs))
        between_q = [k for k in range(qi + 1, len(plan)) if k not in at and plan[k]['nOpt'] == 0 and (nxt == len(figs) or k < min(k2 for k2 in at if k2 > qi))]
        if not between_q and nxt - prev == q['nProb'] and text_check(q['number'], figs[prev:nxt], []) is None and (qi == 0 or (qi - 1) in at) and (qi + 1 == len(plan) or (qi + 1) in at):
            at[qi] = (prev, nxt)
    # Pass 3 — a stretch of consecutive unplaced text-option questions (a counting or word-image
    # page) between two placed questions, or a page edge: accepted only when the blobs between the
    # anchors number exactly the stretch's problem figures, then taken in reading order.
    qi = 0
    while qi < len(plan):
        if qi in at or plan[qi]['nOpt'] != 0:
            qi += 1; continue
        qj = qi
        while qj < len(plan) and qj not in at and plan[qj]['nOpt'] == 0:
            qj += 1
        # the stretch must reach a placed question or the page edge on both sides
        if (qi == 0 or (qi - 1) in at) and (qj == len(plan) or qj in at):
            lo = at[qi - 1][1] if qi > 0 else 0
            hi = at[qj][0] if qj < len(plan) else len(figs)
            need = sum(plan[k]['nProb'] for k in range(qi, qj))
            seg = figs[lo:hi]
            if len(seg) > need:
                # The strip splitter cuts a one-piece strip figure (a divided rectangle) into
                # abutting boxes of identical height; rejoin those here, where no option row exists.
                merged = []
                for c in seg:
                    m = merged[-1] if merged else None
                    if m and col(m) == col(c) and abs(m[1] - c[1]) <= 3 and abs(m[3] - c[3]) <= 3 and 0 <= c[0] - m[2] <= 3:
                        merged[-1] = [m[0], min(m[1], c[1]), c[2], max(m[3], c[3])]
                    else:
                        merged.append(list(c))
                seg = merged
            if len(seg) == need and all(
                    text_check(plan[k_]['number'], seg[o_:o_ + plan[k_]['nProb']], []) is None
                    for k_, o_ in zip(range(qi, qj), __import__('itertools').accumulate([0] + [plan[x]['nProb'] for x in range(qi, qj - 1)]))):
                figs[lo:hi] = seg
                shift = (hi - lo) - len(seg)
                if shift:
                    at = {k: ((a - shift, b - shift) if a >= hi else (a, b)) for k, (a, b) in at.items()}
                for k in range(qi, qj):
                    at[k] = (lo, lo + plan[k]['nProb']); lo = at[k][1]
        qi = qj
    qs = []
    for qi, q in enumerate(plan):
        if qi not in at:
            qs.append({**q, 'status': 'REVIEW(v3): no valid placement', 'crops': {}}); continue
        s, e = at[qi]
        probs = figs[s:s + q['nProb']]; opts = figs[s + q['nProb']:e]
        snap = [('prob', k + 1, c) for k, c in enumerate(probs)] + [('opt', lab, c) for lab, c in zip(q['optionLabels'], opts)]
        qs.append({**q, 'status': 'OK', 'crops': {}, '_snap': snap})
    for q in qs:
        q.setdefault('_snap', [])
        if q['status'] == 'OK':
            for kind, lab, c in q['_snap']:
                r = pymupdf.Rect(c[0] / iw * W - 1, c[1] / ih * H - 1, c[2] / iw * W + 1, c[3] / ih * H + 1)
                if q['nOpt'] == 0:
                    # A lone figure's labels (Venn region names, lettered vertices) are text beside the
                    # drawing, not ink in its blob: take in words close by, within the column.
                    c0 = col(c) * W / 3; c1 = c0 + W / 3
                    near = pymupdf.Rect(max(c0, r.x0 - 45), r.y0 - 10, min(c1, r.x1 + 45), r.y1 + 10)
                    for w in words:
                        wr = pymupdf.Rect(w[:4])
                        if near.contains(wr):
                            r |= wr
                    r = pymupdf.Rect(r.x0 - 2, r.y0 - 2, r.x1 + 2, r.y1 + 2)
                name = f'p{p:04d}_q{q["number"]}_{kind}{lab}.png'
                page.get_pixmap(dpi=200, clip=r).save(os.path.join(FIG, 'crops', name))
                q['crops'][f'{kind}{lab}'] = name
                q.setdefault('rects', {})[f'{kind}{lab}'] = [r.x0, r.y0, r.x1, r.y1]
        q.pop('_snap', None)
    json.dump({'page': p, 'questions': qs}, open(pj, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'p{p}: {len(qs)} questions, {sum(q["status"] == "OK" for q in qs)} OK', flush=True)
