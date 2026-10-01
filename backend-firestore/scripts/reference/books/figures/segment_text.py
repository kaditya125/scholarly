"""
Text-driven figure segmentation for books whose PDF carries a text layer (Rakesh Yadav SSC Reasoning).

segment_v3.py places ink blobs by the model's counts. This needs neither: every figure option sits
directly above its printed label "(a)"/"(A)", every question starts at its number, and the problem
figure sits between the "Question Figure(s)" caption and the "Answer Figure(s)" label. Crops are the
ink found in those text-bounded regions, so a faint figure, a bordered strip the blob cutter can't
split, or a 2×2 answer grid all come out the same way.

  - figure-option question: labels (a)(b)(c)(d)[(e)] between its number and the next, each alone on
    its line (a text option "(a) 11" has words beside it). Option k = ink above label k, between the
    midpoints to its row neighbours, down from the row's top boundary (the answer label, the row of
    labels above, or the question line).
  - problem figure: ink between the "Question Figure(s)" caption and the "Answer Figure(s)" label;
    none when the question has no answer label (odd-one-out: the options are the figures).
  - shared block (Venn): "Directions (Questions 11 to 20)" followed by figure labels before question 11
    — those figures are the options of every question 11–20.

Writes figures/pages_t/p{page}.json in segment_v3's shape (plus 'sharedBlock'); crops into
figures/crops/ as t{page}_…png. Questions already placed by v3 are left to v3 (the ingest prefers v3).

  python segment_text.py --book ry_ssc_reasoning --from 474 --to 533
"""
import argparse, json, os, re
import numpy as np
import pymupdf

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'ry_ssc_reasoning': 'rakesh_yadav/ssc_reasoning'}

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='ry_ssc_reasoning')
ap.add_argument('--pages', default='')
ap.add_argument('--from', dest='frm', type=int)
ap.add_argument('--to', type=int)
ap.add_argument('--debug', default='', help='directory for region overlays')
args = ap.parse_args()

BOOK = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'))
FIG = os.path.join(BOOK, 'figures')
OUT = os.path.join(FIG, 'pages_t')
os.makedirs(OUT, exist_ok=True)

LABEL = re.compile(r'^\(([a-eA-E])\)$')
CAPTION = re.compile(r'^(question|answer|figures?|figure:?-?|figures:?-?|:-?|-)$', re.I)


DEBUG = []


def ink_box(page, rect, mask_rects):
    """Tight box (page points) of the dark ink inside rect, ignoring mask_rects; None if blank."""
    b = _ink_box(page, rect, mask_rects)
    DEBUG.append((rect, b))
    return b


def _ink_box(page, rect, mask_rects):
    if rect.is_empty or rect.width < 6 or rect.height < 6:
        return None
    pm = page.get_pixmap(dpi=150, clip=rect, colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).copy()
    sx, sy = pm.width / rect.width, pm.height / rect.height
    for m in mask_rects:
        m = m & rect
        if m.is_empty:
            continue
        x0, y0 = int((m.x0 - rect.x0) * sx), int((m.y0 - rect.y0) * sy)
        x1, y1 = int((m.x1 - rect.x0) * sx) + 1, int((m.y1 - rect.y0) * sy) + 1
        a[max(0, y0):y1, max(0, x0):x1] = 255
    dark = a < 110          # the grey diagonal watermark is lighter than this
    rows = np.where(dark.sum(1) >= 2)[0]
    cols = np.where(dark.sum(0) >= 2)[0]
    if len(rows) < 8 or len(cols) < 8:
        return None
    return pymupdf.Rect(rect.x0 + cols[0] / sx, rect.y0 + rows[0] / sy, rect.x0 + (cols[-1] + 1) / sx, rect.y0 + (rows[-1] + 1) / sy)


def has_ink(page, rect, mask_rects, min_px=6):
    """Any real ink in rect (a thin border line counts), ignoring mask_rects."""
    if rect.is_empty:
        return False
    pm = page.get_pixmap(dpi=150, clip=rect, colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).copy()
    sx, sy = pm.width / rect.width, pm.height / rect.height
    for m in mask_rects:
        m = m & rect
        if not m.is_empty:
            a[max(0, int((m.y0 - rect.y0) * sy)):int((m.y1 - rect.y0) * sy) + 1, max(0, int((m.x0 - rect.x0) * sx)):int((m.x1 - rect.x0) * sx) + 1] = 255
    return int((a < 110).sum()) >= min_px


def ink_components(page, rect, mask_rects):
    """Connected ink shapes inside rect as page-point rects (a shape's strokes 1–2 px apart join)."""
    from scipy import ndimage
    pm = page.get_pixmap(dpi=150, clip=rect, colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width).copy()
    sx, sy = pm.width / rect.width, pm.height / rect.height
    for m in mask_rects:
        m = m & rect
        if not m.is_empty:
            a[max(0, int((m.y0 - rect.y0) * sy)):int((m.y1 - rect.y0) * sy) + 1, max(0, int((m.x0 - rect.x0) * sx)):int((m.x1 - rect.x0) * sx) + 1] = 255
    lab, n = ndimage.label(ndimage.binary_dilation(a < 110, iterations=2))
    out = []
    for sl in ndimage.find_objects(lab):
        ys, xs = sl
        r = pymupdf.Rect(rect.x0 + xs.start / sx, rect.y0 + ys.start / sy, rect.x0 + xs.stop / sx, rect.y0 + ys.stop / sy)
        if r.width >= 4 or r.height >= 4:
            out.append(r)
    return out


def strip_cells(page, rect, n, mask_rects):
    """A bordered strip of n cells inside rect (one frame, n-1 dividers): the n cell rects, else None."""
    box = _ink_box(page, rect, mask_rects)
    if box is None:
        return None
    pm = page.get_pixmap(dpi=150, clip=box, colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width) < 110
    sx = pm.width / box.width
    full = np.where(a.mean(0) >= 0.93)[0]          # dividers run the full height; figure strokes (stems) reach ~85%
    runs = []
    for x in full:
        if runs and x - runs[-1][-1] <= 2:
            runs[-1].append(x)
        else:
            runs.append([x])
    if len(runs) < n + 1:
        return None
    cand = [box.x0 + (r[0] + r[-1]) / 2 / sx for r in runs]
    # Cells can carry their own inner grid lines: keep the outer borders and, between them, the line
    # nearest each even division — all must be there.
    x0, x1 = cand[0], cand[-1]
    xs = [x0]
    for i in range(1, n):
        ideal = x0 + (x1 - x0) * i / n
        near = min(cand, key=lambda c: abs(c - ideal))
        if abs(near - ideal) > 0.03 * (x1 - x0) + 2:
            return None
        xs.append(near)
    xs.append(x1)
    widths = [xs[i + 1] - xs[i] for i in range(n)]
    if max(widths) > 1.25 * min(widths):
        return None
    return [pymupdf.Rect(xs[i] - 0.8, box.y0, xs[i + 1] + 0.8, box.y1) for i in range(n)]


def main():
    doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))
    pages = [int(p) for p in args.pages.split(',') if p] or list(range(args.frm, args.to + 1))
    for p in pages:
        page = doc[p - 1]
        W, H = page.rect.width, page.rect.height
        words = page.get_text('words')
        # A chapter's ANSWER KEYS grid and SOLUTION section (full width) end its questions on the page.
        heads = [w[1] for j, w in enumerate(words) if (w[4] == 'ANSWER' and j + 1 < len(words) and words[j + 1][4].startswith('KEY')) or w[4] == 'SOLUTION']
        if heads:
            words = [w for w in words if w[1] < min(heads) - 2]
        nums = [w for w in words if re.fullmatch(r'\d{1,3}\.', w[4])]
        # Column left edges from the question numbers (a column can start short of a page third).
        lefts = sorted({round(w[0]) for w in nums})
        cl = []
        for x in lefts:
            if not cl or x - cl[-1] > 60:
                cl.append(x)
        if not cl:
            cl = [36]
        colof = lambda x: max([k for k, l in enumerate(cl) if x >= l - 20] or [0])
        cbounds = lambda k: (cl[k] - 8, (cl[k + 1] - 8) if k + 1 < len(cl) else W - 20)
        pos = lambda w: (colof(w[0]), w[1])
        anchors = {}
        for w in nums:
            k = colof(w[0])
            if w[0] - cl[k] < 12:
                anchors.setdefault(int(w[4][:-1]), w)
        # Solution pages ("27. (b) …") redraw figures with lettered vertices — never question figures.
        wi = {id(w): j for j, w in enumerate(words)}
        def explained(j):
            # "27. (b) In each subsequent figure…": the key, then words of explanation on its line
            return j + 2 < len(words) and abs(words[j + 2][1] - words[j][1]) < 3 and re.search(r'[A-Za-z]{2,}', words[j + 2][4])
        keyed = sum(1 for w in nums if wi[id(w)] + 1 < len(words) and re.fullmatch(r'\([a-e]\)', words[wi[id(w)] + 1][4])
                    and explained(wi[id(w)] + 1))
        keyed += sum(1 for w in words if re.fullmatch(r'\d{1,3}\.\s*\([a-e]\)', w[4]))
        top_band, bottom_band = 0.035 * H, 0.915 * H
        result = {'page': p, 'questions': []}
        if keyed >= 3 or not anchors:
            json.dump(result, open(os.path.join(OUT, f'p{p:04d}.json'), 'w', encoding='utf-8'), indent=1)
            print(f'p{p}: skipped ({"solution page" if keyed >= 3 else "no question numbers"})')
            continue
        order = sorted(anchors.items(), key=lambda kv: pos(kv[1]))
        same_line = lambda u, v: colof(u[0]) == colof(v[0]) and abs((u[1] + u[3]) / 2 - (v[1] + v[3]) / 2) < 3.5

        def fig_labels(lo, hi):
            """Figure-option labels between reading positions lo and hi: each alone on its line."""
            out = []
            for w in words:
                m = LABEL.match(w[4])
                if not m or not (lo < pos(w) < hi):
                    continue
                if any(same_line(w, v) and v is not w and not LABEL.match(v[4]) for v in words):
                    continue        # "(a) 11" — a text option
                out.append(w)
            return out

        masks = [pymupdf.Rect(w[:4]) for w in words if LABEL.match(w[4]) or CAPTION.match(w[4]) or re.fullmatch(r'\d{1,3}\.', w[4])]

        def options_from(labels, floor, even=True):
            """Crop rect per label. floor(k, x0, x1) = the region's top for a label in column k."""
            labs = sorted(labels, key=lambda w: (colof(w[0]), round(w[1] / 4), w[0]))
            letters = ''.join(LABEL.match(w[4]).group(1).lower() for w in labs)
            # rows: (column, y); read row by row
            rows = []
            for w in labs:
                if rows and same_line(rows[-1][0], w):
                    rows[-1].append(w)
                else:
                    rows.append([w])
            labs = [w for r in rows for w in sorted(r, key=lambda w: w[0])]
            letters = ''.join(LABEL.match(w[4]).group(1).lower() for w in labs)
            if letters not in ('abcd', 'abcde'):
                return None, letters
            rects = []
            # Where do the figures sit: above their labels, or to the right ("(a) [fig] (b) [fig]")?
            above_ink = sum(has_ink(page, pymupdf.Rect(w[0], w[1] - 8, w[2], w[1] - 0.5), masks) for w in labs)
            beside = above_ink * 2 < len(labs)
            if beside:
                # "(a) [fig] (b) [fig]": every ink shape to the labels' right goes to the label whose
                # line it sits nearest (shapes of one diagram can be apart — Venn circles).
                boxes = {}
                for k in sorted({colof(w[0]) for w in labs}):
                    kl = [w for w in labs if colof(w[0]) == k]
                    c0, c1 = cbounds(k)
                    y_top = floor(k, min(w[1] for w in kl))
                    last = max(w[3] for w in kl)
                    below = [v[1] for v in words if colof(v[0]) == k and v[1] > last + 1 and not LABEL.match(v[4])]
                    y_bot = min(below + [bottom_band]) - 1
                    region = pymupdf.Rect(min(w[0] for w in kl), y_top, c1, y_bot)
                    for comp in ink_components(page, region, masks):
                        left = [w for w in kl if w[2] <= comp.x0 + 2]
                        if not left:
                            continue
                        dist = lambda w: (max(0, comp.y0 - (w[1] + w[3]) / 2, (w[1] + w[3]) / 2 - comp.y1), comp.x0 - w[2])
                        w = min(left, key=dist)
                        if dist(w)[0] > 25:
                            continue
                        key_ = LABEL.match(w[4]).group(1).lower()
                        boxes[key_] = (boxes[key_] | comp) if key_ in boxes else pymupdf.Rect(comp)
                for w in labs:
                    key_ = LABEL.match(w[4]).group(1).lower()
                    if key_ not in boxes:
                        return None, 'blank option'
                    rects.append((key_, boxes[key_]))
                DEBUG.extend((None, b) for _, b in rects)
            for ri, r in (enumerate(rows) if not beside else []):
                r = sorted(r, key=lambda w: w[0])
                k = colof(r[0][0]); c0, c1 = cbounds(k)
                xs = [(w[0] + w[2]) / 2 for w in r]
                gap = (xs[-1] - xs[0]) / (len(xs) - 1) if len(xs) > 1 else (c1 - c0) / 2
                same_col = [rr for rr in rows if colof(rr[0][0]) == k]
                at = same_col.index(rows[ri])
                above = same_col[at - 1] if at else None
                below = same_col[at + 1] if at + 1 < len(same_col) else None
                cells = None
                if not beside:
                    # the row's ceiling: the label row above in this column, or the floor given
                    top = max([floor(k, r[0][1])] + ([max(w[3] for w in above) + 1] if above else []))
                    cells = strip_cells(page, pymupdf.Rect(c0, top, c1, min(w[1] for w in r) - 0.5), len(r), masks)
                for j, w in enumerate(r):
                    if cells:
                        box = cells[j]
                    else:
                        x0 = (xs[j - 1] + xs[j]) / 2 if j else max(c0, xs[j] - gap / 2)
                        x1 = (xs[j] + xs[j + 1]) / 2 if j + 1 < len(r) else min(c1, xs[j] + gap / 2)
                        box = ink_box(page, pymupdf.Rect(x0, top, x1, w[1] - 0.5), masks)
                    if box is None:
                        return None, 'blank option'
                    rects.append((LABEL.match(w[4]).group(1).lower(), box))
            hs = [b.height for _, b in rects]; ws_ = [b.width for _, b in rects]
            if even and (max(hs) > 1.8 * min(hs) or max(ws_) > 2.2 * min(ws_)):
                return None, 'uneven options'
            return rects, letters

        def last_above(k, y, lo_pos, kinds):
            """Bottom of the lowest word of `kinds` in column k above y, after lo_pos."""
            ys = [w[3] for w in words if colof(w[0]) == k and w[3] <= y + 0.5 and pos(w) > lo_pos and kinds(w)]
            return max(ys) if ys else None

        def save(tag, slot, r):
            r = pymupdf.Rect(r.x0 - 2, r.y0 - 2, r.x1 + 2, r.y1 + 2)
            name = f't{p:04d}_{tag}_{slot}.png'
            page.get_pixmap(dpi=200, clip=r).save(os.path.join(FIG, 'crops', name))
            return name, [r.x0, r.y0, r.x1, r.y1]

        # ---- shared blocks (Venn): Directions (Questions X to Y) + figure labels before question X
        for di, w in enumerate(words):
            if not re.match(r'^Directions?', w[4]):
                continue
            tail = ' '.join(v[4] for v in words[di:di + 8])
            m = re.search(r'\(\s*(?:Q(?:uestions?|\.)?\s*(?:No\.?)?\s*)?(\d{1,3})\s*(?:to|-|–)\s*(\d{1,3})\s*\)', tail)
            if not m:
                continue
            x_, y_ = int(m.group(1)), int(m.group(2))
            if not (0 < y_ - x_ <= 40) or x_ not in anchors:
                continue
            labels = fig_labels(pos(w), pos(anchors[x_]))
            if not labels:
                continue
            # The block's text ends where its figures begin: floor = last text line above the first label row.
            def floor(k, y, lo=pos(w)):
                b = last_above(k, y - 2, lo, lambda v: not LABEL.match(v[4]) and (v[3] - v[1]) < 14 and ink_is_text(v))
                return (b + 1) if b is not None else top_band
            rects, why = options_from(labels, floor, even=False)   # Venn diagrams differ in size by nature
            if not rects:
                continue
            crops, rr = {}, {}
            for lab, r in rects:
                crops[f'opt{lab}'], rr[f'opt{lab}'] = save(f'd{x_}', f'opt{lab}', r)
            for n in range(x_, y_ + 1):
                result['questions'].append({'number': n, 'optionLabels': [l for l, _ in rects], 'optionsAreText': False,
                                            'nProb': 0, 'nOpt': len(rects), 'status': 'OK', 'sharedBlock': f'p{p}_d{x_}-{y_}',
                                            'crops': dict(crops), 'rects': dict(rr)})

        # ---- per-question figures
        shared = {q['number'] for q in result['questions']}
        for i, (n, aw) in enumerate(order):
            if n in shared:
                continue
            a = pos(aw)
            nxt = pos(order[i + 1][1]) if i + 1 < len(order) else (99, 1e9)
            labels = fig_labels(a, nxt)
            if not labels:
                continue
            ans = [w for j, w in enumerate(words) if re.match(r'^An\w{0,2}wer', w[4]) and j + 1 < len(words)
                   and words[j + 1][4].lower().startswith('fig') and a < pos(w) < nxt]
            capq = [w for j, w in enumerate(words) if w[4].startswith('Question') and j + 1 < len(words)
                    and words[j + 1][4].lower().startswith('fig') and (pos(w)[0], pos(w)[1] + 3) >= a and pos(w) < nxt]
            capq.sort(key=pos)
            answ = ans[0] if ans else None

            def floor(k, y):
                cands = [top_band]
                if answ is not None and colof(answ[0]) == k and answ[1] < y:
                    cands.append(answ[3] + 1)
                if colof(aw[0]) == k and aw[1] < y:
                    # odd-one-out: figures start level with the number, beside it
                    cands.append(aw[1] - 2 if answ is None else aw[3] + 1)
                return max(cands)
            if answ is None and capq:
                continue   # a "Question Figure" with no answer label found: can't tell the rows apart
            rects, why = options_from(labels, floor)
            q = {'number': n, 'optionLabels': list(why) if rects else [], 'optionsAreText': False, 'nOpt': len(rects or []),
                 'status': 'OK' if rects else f'REVIEW(text): {why}', 'crops': {}, 'rects': {}}
            if rects and answ is not None and capq:
                # (no caption: "Which diagram represents…" — the text is the question, no figure)
                # problem figure: under the question caption (or the question line), above the answer label
                k = colof(answ[0]); c0, c1 = cbounds(k)
                start = capq[0] if capq else aw
                if colof(start[0]) == k and start[1] < answ[1]:
                    region = pymupdf.Rect(c0, start[3] + 1, c1, answ[1] - 0.5)
                elif colof(start[0]) != k:
                    # the question flows over: its figure is at the top of the answer label's column,
                    # unless the question's own column still has ink under the caption
                    region = pymupdf.Rect(c0, top_band, c1, answ[1] - 0.5)
                    s0, s1 = cbounds(colof(start[0]))
                    if ink_box(page, pymupdf.Rect(s0, start[3] + 1, s1, bottom_band), masks) is not None:
                        region = None
                else:
                    region = None
                box = ink_box(page, region, masks) if region is not None else None
                if box is None:
                    q.update(status='REVIEW(text): no problem figure', crops={}, rects={}, nOpt=0)
                else:
                    q['crops']['prob1'], q['rects']['prob1'] = save(f'q{n}', 'prob1', box)
            q['nProb'] = len([s for s in q['crops'] if s.startswith('prob')])
            if q['status'] == 'OK':
                for lab, r in rects:
                    q['crops'][f'opt{lab}'], q['rects'][f'opt{lab}'] = save(f'q{n}', f'opt{lab}', r)
            result['questions'].append(q)
        json.dump(result, open(os.path.join(OUT, f'p{p:04d}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        if args.debug:
            dp = pymupdf.open(); dp.insert_pdf(doc, from_page=p - 1, to_page=p - 1); pg = dp[0]
            for r, b in DEBUG:
                if r is not None and not r.is_empty:
                    pg.draw_rect(r, color=(0, 0.6, 0), width=0.6)
                if b is not None:
                    pg.draw_rect(b, color=(1, 0, 0), width=1)
            pg.get_pixmap(dpi=80).save(os.path.join(args.debug, f'dbg_p{p}.png'))
        DEBUG.clear()
        print(f'p{p}: {len(result["questions"])} questions, {sum(q["status"] == "OK" for q in result["questions"])} OK', flush=True)


def ink_is_text(w):
    return bool(re.search(r'[A-Za-zऀ-ॿ]{2,}', w[4]))


main()
