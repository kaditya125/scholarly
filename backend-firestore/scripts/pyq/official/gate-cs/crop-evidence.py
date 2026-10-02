"""
Crop evidence images for every question candidate: the question region(s) and each figure.

  evidence/<paperId>/q<NN>_p<page>.jpg   what the question looked like on the official page
  figures/<paperId>/q<NN>_<role>_<i>.png the figure itself, stored with the question

Figures are re-rendered from the original PDF at 300 dpi rather than cut from the 200-dpi JPEG, so a
vector diagram stays sharp. Boxes come from the reader's box_2d (0-1000 of the page) and are padded a
little so a tight box never clips a label; the crop is then checked for emptiness (a box that lands on
blank paper means the reader's box was wrong and the figure must be reviewed, not stored).
"""
import glob, json, os, sys
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "gate-cs")
PAD = 8          # in 0-1000 page units
MIN_INK = 0.004  # fraction of non-white pixels a real figure crop must have


def pdf_for(file_key):
    m = json.load(open(os.path.join(OUT, "render-manifest.json")))
    row = next(r for r in m if r["key"] == file_key)
    return os.path.join(OUT, row["file"])


def clip_rect(page, box, pad=PAD):
    ymin, xmin, ymax, xmax = box
    w, h = page.rect.width, page.rect.height
    return pymupdf.Rect(max(0, (xmin - pad) / 1000 * w), max(0, (ymin - pad) / 1000 * h),
                        min(w, (xmax + pad) / 1000 * w), min(h, (ymax + pad) / 1000 * h))


def ink_fraction(pix):
    samples = pix.samples
    n = pix.n
    dark = sum(1 for i in range(0, len(samples), n * 4) if samples[i] < 200)
    return dark / max(1, len(samples) // (n * 4))


def main():
    files = sys.argv[1:] or [os.path.basename(p)[:-5] for p in glob.glob(os.path.join(OUT, "candidates", "*.json"))]
    docs = {}
    for paper_id in files:
        cand = json.load(open(os.path.join(OUT, "candidates", f"{paper_id}.json"), encoding="utf-8"))
        doc = docs.setdefault(cand["fileKey"], pymupdf.open(pdf_for(cand["fileKey"])))
        ev_dir = os.path.join(OUT, "evidence", paper_id); fig_dir = os.path.join(OUT, "figures", paper_id)
        os.makedirs(ev_dir, exist_ok=True); os.makedirs(fig_dir, exist_ok=True)
        empty_figs = 0
        for q in cand["questions"]:
            q["evidence"], q["figureFiles"] = [], []
            for seg in q["boxes"]:
                if not seg.get("box") or len(seg["box"]) != 4:
                    continue
                page = doc[seg["page"] - 1]
                path = os.path.join(ev_dir, f"q{q['paperOrder']:02d}_p{seg['page']:03d}.jpg")
                page.get_pixmap(dpi=130, clip=clip_rect(page, seg["box"], pad=12)).save(path, jpg_quality=85)
                q["evidence"].append(os.path.relpath(path, OUT).replace("\\", "/"))
            for i, f in enumerate(q["figures"]):
                if not f.get("box_2d") or len(f["box_2d"]) != 4:
                    continue
                page = doc[f["page"] - 1]
                pix = page.get_pixmap(dpi=300, clip=clip_rect(page, f["box_2d"]))
                ink = ink_fraction(pix)
                path = os.path.join(fig_dir, f"q{q['paperOrder']:02d}_{f.get('role') or 'stem'}_{i}.png")
                pix.save(path)
                q["figureFiles"].append({"role": f.get("role") or "stem", "file": os.path.relpath(path, OUT).replace("\\", "/"),
                                         "page": f["page"], "box_2d": f["box_2d"], "ink": round(ink, 4)})
                if ink < MIN_INK:
                    empty_figs += 1
                    q["flags"] = sorted(set(q.get("flags", []) + ["FIGURE_CROP_EMPTY"]))
                    q["status"] = "NEEDS_REVIEW"
        cand["verified"] = sum(1 for q in cand["questions"] if q["status"] == "VERIFIED")
        cand["needsReview"] = sum(1 for q in cand["questions"] if q["status"] == "NEEDS_REVIEW")
        json.dump(cand, open(os.path.join(OUT, "candidates", f"{paper_id}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{paper_id}: evidence crops {sum(len(q['evidence']) for q in cand['questions'])}, "
              f"figures {sum(len(q['figureFiles']) for q in cand['questions'])} (empty {empty_figs})")


if __name__ == "__main__":
    main()
