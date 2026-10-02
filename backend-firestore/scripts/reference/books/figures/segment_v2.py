"""
Figure segmentation, second method — for questions extract_figures.py's border-band method left in
REVIEW. That method assumes every question is ONE row of boxed figures; it fails on layouts where the
problem figure sits on its own row above the options, on unboxed figures (water images, stars,
circles), and on strips of boxes that touch.

This method works from ink blobs instead of box borders:
  1. binarise the page; drop the scan's dark side bar
  2. dilate lightly so one figure's strokes, dashes and dots merge, but neighbours separated by a
     clear white gap don't; label connected components
  3. figures = components of figure size; question-number markers = small components that sit left
     of every figure on their row; label text such as "(a)" is too small to count
  4. a component several figures wide (boxes that touch) is cut at its internal vertical borders
  5. questions are split at the number markers (their count must equal the questions read); each
     question's figures in reading order (row, then x) are problem figures then option figures

ACCEPT is unchanged: crops only when the figures found equal exactly problemCount + options read.
"""
import numpy as np
from scipy import ndimage

DPI = 150


def page_mask(page):
    import io
    from PIL import Image
    img = Image.open(io.BytesIO(page.get_pixmap(dpi=DPI).tobytes('png'))).convert('L')
    a = np.asarray(img)
    ink = a < 128
    # The scan's black side bar: columns that are mostly ink.
    colfrac = ink.mean(axis=0)
    ink[:, colfrac > 0.5] = False
    return ink


def split_strip(ink, x0, x1, y0, y1, k):
    """Cut a strip of k touching boxes at its internal vertical borders (near-full-height ink)."""
    sub = ink[y0:y1, x0:x1]
    full = sub.mean(axis=0) >= 0.6
    edges, e = [], None
    for x in range(sub.shape[1]):
        if full[x]:
            if e is None: e = x
        elif e is not None: edges.append((e + x - 1) // 2); e = None
    step = (x1 - x0) / k
    cuts = []
    for i in range(1, k):
        t = i * step
        near = [c for c in edges if abs(c - t) < step * 0.3 and c not in cuts]
        if not near: return None
        cuts.append(min(near, key=lambda c: abs(c - t)))
    b = [0] + sorted(cuts) + [x1 - x0]
    return [(x0 + a, x0 + c) for a, c in zip(b, b[1:])]


def segment(page, qs):
    """Returns {number: (status, problemRects, optionRects)} in PDF points, like extract_figures.locate."""
    ink = page_mask(page)
    ih, iw = ink.shape
    W, H = page.rect.width, page.rect.height
    # Drop label-sized specks first — "(x)", "(a)", question numbers, direction text. Printed in
    # the narrow gap between a figure and the row below, they would otherwise bridge the two into
    # one blob. A speck INSIDE a figure is still inside that figure's rectangle, so nothing is lost.
    raw, _ = ndimage.label(ink, structure=np.ones((3, 3)))
    keep = np.zeros(raw.max() + 1, bool)
    dashes = []   # centres of dash-like specks: dashed outlines are removed with the labels
    for i, sl in enumerate(ndimage.find_objects(raw), start=1):
        if sl is None:
            continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if not (h <= 22 and w <= 45):
            keep[i] = True
        elif 5 <= max(h, w) <= 22 and max(h, w) >= 3 * max(1, min(h, w)):
            dashes.append(((sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2))
    grown = ndimage.binary_dilation(keep[raw], iterations=4)
    lab, n = ndimage.label(grown)
    objs = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        comps.append({'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'w': x1 - x0, 'h': y1 - y0})
    # Figures are at least ~0.3 inch in both directions; text lines are short and wide.
    figs = [c for c in comps if c['h'] >= 40 and c['w'] >= 40 and c['w'] / c['h'] < 12]
    # A frame and the drawing inside it are separate blobs when they don't touch; keep the
    # outermost (the frame's rectangle already contains the drawing).
    inside = lambda a, b: (a is not b and a['x0'] >= b['x0'] - 2 and a['x1'] <= b['x1'] + 2
                           and a['y0'] >= b['y0'] - 2 and a['y1'] <= b['y1'] + 2)
    figs = [a for a in figs if not any(inside(a, b) for b in figs)]
    if not figs:
        return {q['number']: ('REVIEW(v2): no figures found', [], {}) for q in qs}
    typical = sorted(c['h'] for c in figs)[len(figs) // 2]
    # Strips: touching boxes merge into one wide component; cut them at internal borders.
    expanded = []
    for c in figs:
        k = round(c['w'] / max(c['h'], 1))
        if k >= 2 and c['h'] >= 0.6 * typical:
            parts = split_strip(ink, c['x0'], c['x1'], c['y0'], c['y1'], k)
            if parts:
                expanded += [{**c, 'x0': a, 'x1': b, 'w': b - a} for a, b in parts]
                continue
        expanded.append(c)
    figs = expanded
    # A figure much taller than the page's typical one is two rows fused together (boxes set close
    # above one another, or with their labels). Nothing on such a page can be trusted.
    if any(f['h'] > 1.6 * typical for f in figs):
        return {q['number']: ('REVIEW(v2): rows fused together on this page', [], {}) for q in qs}
    # Page rows: figures whose vertical centres are close; each row read left to right.
    figs.sort(key=lambda f: (f['y0'] + f['y1']) / 2)
    rows, cur = [], []
    for f in figs:
        if cur and (f['y0'] + f['y1']) / 2 - (cur[-1]['y0'] + cur[-1]['y1']) / 2 > 0.5 * typical:
            rows.append(cur); cur = []
        cur.append(f)
    if cur: rows.append(cur)
    rows = [sorted(r, key=lambda f: f['x0']) for r in rows]
    # Where rows begin on this page: the median of each row's first figure, so a stray scan mark at
    # the margin can't drag it left (p1022), and a right-hand column's rows don't define it.
    starts = sorted(row[0]['x0'] for row in rows)
    left_edge = starts[len(starts) // 2]

    rect = lambda c: [c['x0'] / iw * W - 1, c['y0'] / ih * H - 1, c['x1'] / iw * W + 1, c['y1'] / ih * H + 1]
    out = {}
    # Questions run to the bottom of the page; anything figure-sized above the first question
    # (a worked example, a heading box) is left over at the top. So assign WHOLE rows from the
    # bottom up: each question must be filled exactly by the rows it takes. An overshoot means the
    # layout isn't understood, and that question and every one above it go to review.
    r = len(rows)
    for qi in range(len(qs) - 1, -1, -1):
        q = qs[qi]
        want_p, labels = int(q.get('problemCount') or 0), [str(l) for l in (q.get('optionLabels') or [])]
        want = want_p + len(labels)
        if want_p == 0 or not labels:
            for qq in qs[:qi + 1]:
                out[qq['number']] = (f'REVIEW(v2): model read {int(qq.get("problemCount") or 0)} problem / '
                                     f'{len(qq.get("optionLabels") or [])} option figures', [], {})
            break
        taken, got = r, 0
        while taken > 0 and got < want:
            taken -= 1
            got += len(rows[taken])
        if got != want:
            for qq in qs[:qi + 1]:
                out[qq['number']] = (f'REVIEW(v2): rows give {got} figures for question {q["number"]} ({want_p}+{len(labels)})', [], {})
            break
        ordered = [f for row in rows[taken:r] for f in row]
        # Every figure the book draws is roughly box-shaped. A blob much wider than tall is a strip
        # of touching boxes that did not split (or two merged boxes); counts built from it can still
        # match by coincidence — audited on p780/p897/p933, where they did. The row assignment is
        # then unreliable, so this question and every one above it go to review. (Only rows given
        # to questions are checked: a wide heading box above the questions is harmless.)
        if any(not (1 / 3 < f['w'] / f['h'] < 3) for f in ordered):
            for qq in qs[:qi + 1]:
                out[qq['number']] = (f'REVIEW(v2): unsplit strip of boxes at question {q["number"]}', [], {})
            break
        # Questions in this book start at the left edge of the figure area. A question whose first
        # figure starts well to the right is the right-hand column of a two-column page (p957),
        # where rows from both columns get mixed into one question.
        # (Leftmost figure, not the first: a stacked problem figure is often centred above its options.)
        if min(f['x0'] for f in ordered) > left_edge + 1.5 * typical:
            for qq in qs[:qi + 1]:
                out[qq['number']] = (f'REVIEW(v2): question {q["number"]} does not start at the left edge (two columns?)', [], {})
            break
        # Two figures of one question overlapping means one drawing split into two blobs (or two
        # merged); the count can then match with everything shifted (p1080 Q61).
        def overlap(a, b):
            ix = min(a['x1'], b['x1']) - max(a['x0'], b['x0'])
            iy = min(a['y1'], b['y1']) - max(a['y0'], b['y0'])
            return ix > 0 and iy > 0 and ix * iy > 0.1 * min(a['w'] * a['h'], b['w'] * b['h'])
        if any(overlap(a, b) for i, a in enumerate(ordered) for b in ordered[i + 1:]):
            out[q['number']] = (f'REVIEW(v2): overlapping figures in question {q["number"]}', [], {})
            r = taken
            continue
        # Dashed outlines are made of specks, which were removed before blob-growing, so a crop
        # would keep only the solid part of the drawing (p1080's folded sheets). Several dash
        # specks in this question's area, outside every figure box, mean exactly that.
        qy0, qy1 = min(f['y0'] for f in ordered), max(f['y1'] for f in ordered)
        stray = [d for d in dashes if qy0 <= d[0] <= qy1 and not any(
            f['y0'] - 3 <= d[0] <= f['y1'] + 3 and f['x0'] - 3 <= d[1] <= f['x1'] + 3 for f in ordered)]
        if len(stray) >= 6:
            out[q['number']] = (f'REVIEW(v2): dashed drawing outside the crops in question {q["number"]}', [], {})
            r = taken
            continue
        # Two whole rows of equal size, problems == options (p1169's dice: 5 views over 5 views):
        # nothing on the page says which row is the question and which the answers, so don't guess.
        if r - taken >= 2 and want_p == len(labels) and all(len(row) == want_p for row in rows[taken:r]):
            out[q['number']] = (f'REVIEW(v2): question {q["number"]} is two identical rows; which is the question is ambiguous', [], {})
            r = taken
            continue
        # The book draws a question's problem figures at one size and its options at one size;
        # a bad cut or a stray blob shows up as an odd one out. (Counts alone can match by chance.)
        def uneven(group):
            # Unboxed figures legitimately vary (a rotated triangle is wider than an upright one),
            # so the tolerance is loose; a bad cut is a sliver, far smaller than its neighbours.
            if len(group) < 2: return False
            hs, ws = [f['h'] for f in group], [f['w'] for f in group]
            # Heights stay tight: a faint figure only partly above the ink threshold comes out
            # short, and its crop would cut the figure off.
            # Widths at 1.6x: two touching boxes left merged are 2x wide, and on p897 that let the
            # counts match with every option shifted by one.
            return max(hs) > 1.3 * min(hs) or max(ws) > 1.6 * min(ws)
        if uneven(ordered[:want_p]) or uneven(ordered[want_p:]):
            # The rows still add up, so the questions above keep a sound assignment.
            out[q['number']] = (f'REVIEW(v2): uneven figure sizes in question {q["number"]}', [], {})
            r = taken
            continue
        out[q['number']] = ('OK', [rect(f) for f in ordered[:want_p]],
                            {lab: rect(f) for lab, f in zip(labels, ordered[want_p:])})
        r = taken
    return out
