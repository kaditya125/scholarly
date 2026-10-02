"""
Re-segment questions that extract_figures.py left in REVIEW, with segment_v2 (ink blobs, bottom-up
row assignment). Only REVIEW questions change; a question the first method accepted is never
touched. Each re-cropped question records segmenter 'v2' and keeps its first-method reason in
statusV1, so the change is auditable and reversible.

Also writes figures/recrop_overlays/p{page}.png (red = problem figures, blue = options) for every
page where v2 accepted something — review those before trusting the crops.

  python recrop.py --book schand_reasoning [--pages 1022,1025]
"""
import argparse, json, os, sys
import pymupdf
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from segment_v2 import segment

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'schand_reasoning': 'schand/reasoning', 'ry_ssc_reasoning': 'rakesh_yadav/ssc_reasoning'}

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='schand_reasoning')
ap.add_argument('--pages', default='', help='comma-separated page numbers (default: every page with a REVIEW question)')
args = ap.parse_args()

BOOK = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'))
FIG = os.path.join(BOOK, 'figures')
OVL = os.path.join(FIG, 'recrop_overlays')
os.makedirs(OVL, exist_ok=True)
doc = pymupdf.open(os.path.join(BOOK, 'source.pdf'))

# Chapters whose figures are drawn largely in DASHED lines (fold lines, folded-away halves). Dashes
# are removed with the label specks, so v2 crops keep only the solid parts, and faint cut-outs go
# undetected; audited on p1080, where counts still matched with options shifted. No pixel rule
# separates them (hatched figures elsewhere make as many short strokes), so v2 skips these chapters.
SKIP_V2 = {'paper folding', 'paper cutting'}
PART_TITLES = {'non-verbal reasoning', 'verbal reasoning'}

only = {int(p) for p in args.pages.split(',') if p.strip()}
fixed = tried = 0
chapter = ''
for f in sorted(os.listdir(os.path.join(FIG, 'pages'))):
    pj = os.path.join(FIG, 'pages', f)
    d = json.load(open(pj, encoding='utf-8'))
    p = d['page']
    head = (d.get('chapter') or '').strip().lower()
    if head and head not in PART_TITLES:
        chapter = head
    qs = d.get('questions') or []
    if (only and p not in only) or not any(q['status'] != 'OK' for q in qs):
        continue
    if any(c in chapter for c in SKIP_V2):
        continue
    page = doc[p - 1]
    res = segment(page, qs)
    changed = []
    for q in qs:
        if q['status'] == 'OK':
            continue
        tried += 1
        st, prob, opts = res.get(q['number'], ('REVIEW(v2): not located', [], {}))
        q['statusV2'] = st
        if st != 'OK':
            continue
        q['statusV1'], q['status'], q['segmenter'] = q['status'], 'OK', 'v2'
        q['problemRects'], q['optionRects'], q['crops'] = prob, opts, {}
        for i, r in enumerate(prob):
            name = f'p{p:04d}_q{q["number"]}_prob{i + 1}.png'
            page.get_pixmap(dpi=200, clip=pymupdf.Rect(r)).save(os.path.join(FIG, 'crops', name)); q['crops'][f'prob{i + 1}'] = name
        for lab, r in opts.items():
            name = f'p{p:04d}_q{q["number"]}_opt{lab}.png'
            page.get_pixmap(dpi=200, clip=pymupdf.Rect(r)).save(os.path.join(FIG, 'crops', name)); q['crops'][f'opt{lab}'] = name
        changed.append(q)
        fixed += 1
    json.dump(d, open(pj, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    if changed:
        pix = page.get_pixmap(dpi=60)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        dr, s = ImageDraw.Draw(img), 60 / 72
        for q in changed:
            for r in q['problemRects']: dr.rectangle([v * s for v in r], outline='red', width=2)
            for lab, r in q['optionRects'].items():
                dr.rectangle([v * s for v in r], outline='blue', width=2)
                dr.text((r[0] * s + 2, r[1] * s + 1), f'{q["number"]}{lab}', fill='blue')
        img.save(os.path.join(OVL, f'p{p:04d}.png'))
    print(f'p{p}: v2 fixed {len(changed)}', flush=True)
print(f'\nREVIEW questions tried {tried} | fixed by v2 {fixed}')
