"""
Render every page of every GATE CS paper to an image, and keep the PDF's own text layer.

Why both: the image is what a reader (model or human) looks at; the text layer, where the PDF has
one, is the character-exact ground truth that a transcription is checked against. Scanned pages
have no text layer, so for those the second independent model reading is the check instead.
Idempotent: pages already rendered are skipped.
"""
import json, os, sys, glob, hashlib
import pymupdf

OUT = os.path.join(os.path.dirname(__file__), "..", "out", "gate-cs")
FILES = sorted(glob.glob(os.path.join(OUT, "archive", "CS", "*.pdf"))) + [
    os.path.join(OUT, y, s) for y in ("2024", "2025", "2026") for s in ("CS1.pdf", "CS2.pdf")]

def file_key(path):
    rel = os.path.relpath(path, OUT).replace("\\", "/")
    if rel.startswith("archive/CS/"):
        name = os.path.basename(path)[:-4]            # CS2014, CS1-2017
        return name.replace("CS1-", "CS1_").replace("CS2-", "CS2_")
    y, s = rel.split("/")
    return f"{s[:-4]}_{y}"                             # CS1_2024

manifest = []
for f in FILES:
    key = file_key(f)
    d = pymupdf.open(f)
    sha = hashlib.sha256(open(f, "rb").read()).hexdigest()
    pdir = os.path.join(OUT, "pages", key); tdir = os.path.join(OUT, "textlayer", key)
    os.makedirs(pdir, exist_ok=True); os.makedirs(tdir, exist_ok=True)
    text_pages = 0
    for i, page in enumerate(d):
        img = os.path.join(pdir, f"p{i+1:03d}.jpg")
        if not os.path.exists(img):
            page.get_pixmap(dpi=200).save(img, jpg_quality=88)
        words = page.get_text("words")                 # (x0,y0,x1,y1,word,block,line,wordno)
        if words:
            text_pages += 1
        tl = os.path.join(tdir, f"p{i+1:03d}.json")
        if not os.path.exists(tl):
            w, h = page.rect.width, page.rect.height
            json.dump({"width": w, "height": h,
                       "words": [[round(x0/w*1000), round(y0/h*1000), round(x1/w*1000), round(y1/h*1000), t] for x0, y0, x1, y1, t, *_ in words],
                       "images": [[round(r.y0/h*1000), round(r.x0/w*1000), round(r.y1/h*1000), round(r.x1/w*1000)]
                                  for xref, *_ in page.get_images(full=True) for r in page.get_image_rects(xref)]},
                      open(tl, "w", encoding="utf-8"))
    manifest.append({"key": key, "file": os.path.relpath(f, OUT).replace("\\", "/"), "sha256": sha,
                     "pages": d.page_count, "textLayerPages": text_pages})
    print(f"{key:<10} pages={d.page_count:<3} textLayerPages={text_pages}", flush=True)
json.dump(manifest, open(os.path.join(OUT, "render-manifest.json"), "w"), indent=2)
print("done:", sum(m["pages"] for m in manifest), "pages")
