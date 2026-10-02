"""
Turn the two model readings of the image-only answer-key tables into keys, accepting a row only when both
readings agree on every cell and the whole key passes the gates used for the text keys.

  readings: out/gate-cs/keyreads/<model>/<fileKey>/pNNN.json  (read-key-images.ts, gemini-2.5-flash + gemini-2.5-pro)
  output:   out/gate-cs/key_<paperId>.json

A disagreement is never settled by picking a reader: it is listed, the row is checked by eye against a crop of
the page (VISUAL below records what was seen and the crop it was seen in), and only then accepted.
"""
import hashlib, importlib.util, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "gate-cs")
_spec = importlib.util.spec_from_file_location("pek", os.path.join(HERE, "parse-embedded-keys.py"))
pek = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(pek)

MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"]
PAPERS = {
    "GATE_CS_2019": ("CS2019", [17, 18, 19]),
    "GATE_CS_2021_SET1": ("CS1_2021", [41, 42, 43]),
    "GATE_CS_2021_SET2": ("CS2_2021", [44, 45, 46]),
}
# (paperId, q-as-printed-in-section, section) -> {"seen": {field: value}, "evidence": crop path, "note": ...}
VISUAL = {}
FIELDS = ["qNo", "session", "questionType", "section", "key", "marks", "negativeMarks", "highlighted"]


def norm(v):
    if isinstance(v, bool) or v is None:
        return v
    v = re.sub(r"[‐‑‒–−]", "-", str(v))
    return re.sub(r"\s+", " ", v).strip()


def reading(model, key, pages):
    rows, meta = [], []
    for p in pages:
        d = json.load(open(os.path.join(OUT, "keyreads", model, key, f"p{p:03d}.json"), encoding="utf-8"))
        r = d["result"]
        meta.append({"page": p, "title": r.get("title"), "headerCells": r.get("headerCells"), "notes": r.get("notes")})
        for i, row in enumerate(r["rows"]):
            rows.append({**{f: norm(row.get(f)) for f in FIELDS}, "cutOff": row.get("cutOff"), "highlightColour": row.get("highlightColour"),
                         "page": p, "rowOnPage": i + 1})
    return rows, meta


def main():
    manifest = {r["key"]: r for r in json.load(open(os.path.join(OUT, "render-manifest.json")))}
    for paper_id, (key, pages) in PAPERS.items():
        reads = {m: reading(m, key, pages) for m in MODELS}
        a, b = reads[MODELS[0]][0], reads[MODELS[1]][0]
        problems, disagreements, rows = [], [], []
        if len(a) != len(b):
            problems.append(f"readers found {len(a)} vs {len(b)} rows")
        for ra, rb in zip(a, b):
            # shading is recorded but is not key content; readers describe background shading inconsistently
            diff = {f: [ra[f], rb[f]] for f in FIELDS if f != "highlighted" and ra[f] != rb[f]}
            if ra["page"] != rb["page"]:
                diff["page"] = [ra["page"], rb["page"]]
            if diff:
                disagreements.append({"page": ra["page"], "rowOnPage": ra["rowOnPage"], "qNo": [ra["qNo"], rb["qNo"]], "cells": diff})
            if any(r["cutOff"] for r in (ra, rb)):
                problems.append(f"p{ra['page']} row {ra['rowOnPage']} read as cut off at the page edge")
            q = ra["qNo"]
            rows.append({"page": ra["page"], "section": ra["section"], "q": int(q) if re.fullmatch(r"\d{1,2}", q or "") else q,
                         "session": ra["session"], "type": ra["questionType"], "key": ra["key"] or "",
                         "marks": int(ra["marks"]) if re.fullmatch(r"\d", ra["marks"] or "") else None,
                         "negativeMarks": ra["negativeMarks"], "highlighted": {MODELS[0]: ra["highlighted"], MODELS[1]: rb["highlighted"]},
                         "highlightColour": ra["highlightColour"] or rb["highlightColour"], "cells": "two model readings agree"})
        for d in disagreements:
            problems.append(f"readers disagree p{d['page']} row {d['rowOnPage']}: {d['cells']}")
        if any(not isinstance(r["q"], int) for r in rows):
            problems.append(f"question numbers not read as integers: {[r['q'] for r in rows if not isinstance(r['q'], int)]}")
        else:
            gate_problems, numbering = pek.validate(rows, [], "table")
            problems += gate_problems
        titles = sorted({m["title"] for m in reads[MODELS[1]][1] if m["title"]})
        notes = sorted({n for m in reads[MODELS[1]][1] for n in (m["notes"] or [])} | {n for m in reads[MODELS[0]][1] for n in (m["notes"] or [])})
        pdf = manifest[key]["file"]
        out = {"paper": paper_id, "sourceFile": pdf, "keyPages": pages, "fileSha256": hashlib.sha256(open(os.path.join(OUT, pdf), "rb").read()).hexdigest(),
               "layout": "table", "numbering": numbering if not any(not isinstance(r["q"], int) for r in rows) else None,
               "printedTitle": titles, "printedNotes": notes,
               "headerCells": {m: reads[m][1][0]["headerCells"] for m in MODELS},
               "method": "image-only table read independently by gemini-2.5-flash and gemini-2.5-pro; accepted only where both agree",
               "ok": not problems, "problems": problems, "disagreements": disagreements, "rows": rows}
        json.dump(out, open(os.path.join(OUT, f"key_{paper_id}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        kinds = {}
        for r in rows: kinds[r.get("keyKind")] = kinds.get(r.get("keyKind"), 0) + 1
        hl = [(r["q"], r["key"], r["highlightColour"]) for r in rows if all(r["highlighted"].values()) or (r["highlightColour"] or "").lower() == "yellow"]
        print(f"{paper_id:<18} rows={len(rows)} ok={not problems} numbering={out['numbering']} kinds={kinds} disagreements={len(disagreements)} "
              f"highlighted={hl} notes={notes[:3]} {problems[:6]}")


if __name__ == "__main__":
    main()
