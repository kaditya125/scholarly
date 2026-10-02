"""
Replace TRUNCATED answer-key OCR pages with the PDF's own text layer — ry_ssc_reasoning only.

Gemini sometimes degenerates on the key grids (p32 looped on empty table cells until MAX_TOKENS),
losing every key on the page. The keys are plain ASCII ("12. (c)") and the book's text layer holds
them exactly, so for a truncated page that is a KEY page, the key lines and grid headers are taken
from the text layer instead. Only key pages are patched: question pages need the OCR (the text
layer's Hindi is in a legacy font and unreadable).

The original OCR file is moved to ocr_superseded/ (as for S. Chand's re-OCR), and the patched page
records `patchedFrom: "text-layer"` so the substitution is visible.

  python ry-keypages-textlayer.py [--dry-run]
"""
import json, os, re, shutil, sys
import pymupdf

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'dataset_staging', 'rakesh_yadav', 'ssc_reasoning'))
OCR, SUP = os.path.join(BASE, 'ocr'), os.path.join(BASE, 'ocr_superseded')
DRY = '--dry-run' in sys.argv
PAIR = re.compile(r'(\d{1,3})\s*\.\s*\(\s*([a-e])\s*\)', re.I)
HEADER = re.compile(r'(?i)^\s*(answer\s*keys?|\(?\s*(type|exercise)\b[^)]*\)?|solutions?)\s*$')

doc = pymupdf.open(os.path.join(BASE, 'source.pdf'))
os.makedirs(SUP, exist_ok=True)
for f in sorted(os.listdir(OCR)):
    rec = json.load(open(os.path.join(OCR, f), encoding='utf-8'))
    if not rec.get('truncated'):
        continue
    p = rec['pdfPageStart']
    lines = doc[p - 1].get_text().splitlines()
    n_pairs = sum(len(PAIR.findall(l)) for l in lines)
    if n_pairs < 20 or not any(re.search(r'(?i)answer\s*key', l) for l in lines):
        print(f'p{p}: truncated but not a key page ({n_pairs} key pairs in text layer) — left for re-OCR')
        continue
    # The text layer's reading order is not the page's: its "ANSWER KEYS (Exercise)" header comes
    # AFTER half the pairs, and some pairs are split across lines ("1.\n(c)"). So only single-grid
    # key pages are patched (with several grids the pair→grid assignment can't be recovered), the
    # pairs are matched across line breaks, and the page is rebuilt header-first in number order.
    text = '\n'.join(lines)
    grids = [s.strip() for s in lines if re.fullmatch(r'(?i)\(?\s*(type|exercise)\b[^)]*\)?', s.strip())]
    if len(set(grids)) > 1:
        print(f'p{p}: key page with {len(set(grids))} grids {sorted(set(grids))} — left for re-OCR')
        continue
    counts = {}
    for n, k in PAIR.findall(text):
        counts.setdefault(int(n), []).append(k.lower())
    # A number printed twice is a misprint (p32 prints "234" twice and no 235): which entry is the
    # real one can't be known, so it gets no key — nor does the number the misprint displaced.
    dup = {n for n, ks in counts.items() if len(ks) > 1}
    missing_after = {n + 1 for n in dup if n + 1 not in counts}
    keep = {n: ks[0] for n, ks in counts.items() if n not in dup}
    if dup:
        print(f'p{p}: misprinted numbers {sorted(dup)} (and missing {sorted(missing_after)}) left unkeyed')
    md = '\n'.join(['ANSWER KEYS', grids[0] if grids else '(Exercise)'] + [f'{n}. ({keep[n]})' for n in sorted(keep)])
    n_pairs = len(keep)
    print(f'p{p}: key page — {n_pairs} pairs from the text layer ({len(md)} chars)' + (' [dry run]' if DRY else ''))
    if DRY:
        continue
    shutil.move(os.path.join(OCR, f), os.path.join(SUP, f))
    rec.update(markdown=md, charCount=len(md), truncated=False, patchedFrom='text-layer',
               note='Truncated OCR (degenerate table output); key grid taken from the PDF text layer.')
    json.dump(rec, open(os.path.join(OCR, f), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
