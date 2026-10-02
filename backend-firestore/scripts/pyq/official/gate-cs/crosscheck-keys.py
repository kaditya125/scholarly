"""
Second, independent reading of every official answer-key table, compared row by row with the parsed keys.

The parsed keys (parse-keys.py for 2024-2026, parse-embedded-keys.py for the archive years) place words
by our own geometry code. This check reads the same pages with pdfplumber's table extractor, a separate
implementation of ruling-line detection and cell assignment (falling back to its text-alignment strategy
on pages without rulings), and requires every row to agree: key, marks, question type, and for 2012 all
four booklet-code columns. A key is only usable when this check agrees on all 65 rows.

Output: out/gate-cs/keycheck/<paper>.json, and a summary line per paper.
"""
import glob, importlib.util, json, os, re
import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "gate-cs")
# Rows that no table extractor can see (a row cut by a page break has no ruled top or bottom) were checked by
# eye against a crop of the rendered page; each entry records exactly what was seen and the crop it was seen in.
MANUAL = [
    {"paper": "GATE_CS_2020", "section": "CS", "q": 33, "seen": {"key": "B", "marks": 2, "type": "MCQ"},
     "evidence": "keycheck/evidence/GATE_CS_2020_p018_top.png",
     "note": "first row of page 18, printed without a top rule after the page break: 33 | 6 | MCQ | CS | B | 2"},
]
_spec = importlib.util.spec_from_file_location("pek", os.path.join(HERE, "parse-embedded-keys.py"))
pek = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(pek)


def norm(s):
    s = re.sub(r"[‐‑‒–−]", "-", (s or "").replace("\n", " "))
    return re.sub(r"\s+", " ", s).strip()


def fields_of(row):
    return [next((f for f, pat in pek.FIELD if re.search(pat, norm(c).lower())), None) if norm(c) else None for c in row]


def sub_tables(fields):
    subs, cur = [], []
    for ci, f in enumerate(fields):
        if f is None:
            continue
        if any(f == g for _, g in cur):
            subs.append(cur); cur = []
        cur.append((ci, f))
    subs.append(cur)
    return subs


def owner(row, ci):
    while ci > 0 and row[ci] is None:
        ci -= 1
    return row[ci]


def plumber_rows(pdf_path, pages):
    out, subs, width = [], None, None
    with pdfplumber.open(pdf_path) as pdf:
        for pno in pages:
            page = pdf.pages[pno - 1]
            tables = page.extract_tables()
            strategy = "lines"
            if not any(len(t) > 5 for t in tables):
                tables = page.extract_tables({"vertical_strategy": "text", "horizontal_strategy": "text"})
                strategy = "text"
            for t in tables:
                pending = None
                for row in t:
                    f = fields_of(row)
                    if pending and len(pending) == len(f) and any(f):
                        # a header printed over two rows ("Section | Q. No." above "Key / Range | Marks")
                        f = [a or b for a, b in zip(pending, f)]
                    if "q" in f and ({"key", "codeA"} & set(f)):
                        subs, width, pending = sub_tables(f), len(row), None
                        continue
                    pending = f if any(f) else None
                    if subs is None or len(row) != width:
                        continue
                    for sub in subs:
                        # pdfplumber marks the columns a merged cell covers with None; the value is the owning cell's
                        rec = {fld: norm(owner(row, ci)) for ci, fld in sub}
                        if re.fullmatch(r"\d{1,2}", rec.get("q", "")):
                            out.append({**rec, "page": pno, "strategy": strategy})
    return out


def ident(section, q):
    return ((section or "").upper()[:2], int(q))


def compare(paper, parsed_rows, plumber, codes=False):
    theirs = {}
    for r in plumber:
        k = ident(r.get("section") or r.get("paper"), r["q"])
        theirs.setdefault(k, r)
    mismatches, missing, visual = [], [], []
    manual = {ident(v["section"], v["q"]): v for v in MANUAL if v["paper"] == paper}
    for r in parsed_rows:
        k = ident(r["section"], r["q"])
        o = theirs.get(k)
        if o is None and k in manual:
            v = manual[k]
            seen = {"key": norm(r["key"]), "marks": r.get("marks"), "type": r.get("type")}
            if all(seen[f] == v["seen"][f] for f in v["seen"]):
                visual.append({"q": list(k), "evidence": v["evidence"], "note": v["note"]}); continue
            mismatches.append({"q": list(k), "field": "visual", "parsed": seen, "visual": v["seen"]}); continue
        if o is None:
            missing.append(k); continue
        checks = [("key", norm(r["key"]), norm(o.get("codeA") if codes else o.get("key")))]
        if r.get("marks") is not None or o.get("marks"):
            checks.append(("marks", str(r.get("marks")), o.get("marks", "")))
        if r.get("type") or o.get("type"):
            checks.append(("type", r.get("type") or "", o.get("type", "")))
        if codes:
            checks += [(f"code{c}", norm(r["allCodes"][c]), norm(o.get(f"code{c}"))) for c in "ABCD"]
        for name, a, b in checks:
            if a != b:
                mismatches.append({"q": list(k), "field": name, "parsed": a, "pdfplumber": b})
    extra = sorted(set(theirs) - {ident(r["section"], r["q"]) for r in parsed_rows})
    agree = len(parsed_rows) - len(missing) - len({tuple(m["q"]) for m in mismatches})
    return {"paper": paper, "rows": len(parsed_rows), "agree": agree, "agreeVisually": visual, "mismatches": mismatches,
            "missingInSecondReading": missing, "extraInSecondReading": extra,
            "strategies": sorted({r["strategy"] for r in plumber}),
            "ok": agree == len(parsed_rows) == 65 and not extra}


def main():
    os.makedirs(os.path.join(OUT, "keycheck"), exist_ok=True)
    jobs = []
    for f in sorted(glob.glob(os.path.join(OUT, "key_CS*_20*.json"))):
        k = json.load(open(f, encoding="utf-8"))
        with pdfplumber.open(os.path.join(OUT, k["keyFile"])) as pdf:
            n = len(pdf.pages)
        jobs.append((k["paper"], k, os.path.join(OUT, k["keyFile"]), list(range(1, n + 1)), False))
    for paper, (pdf, pages, layout) in pek.SPECS.items():
        k = json.load(open(os.path.join(OUT, f"key_{paper}.json"), encoding="utf-8"))
        jobs.append((paper, k, os.path.join(OUT, pdf), pages, layout == "codes"))
    for paper, k, pdf, pages, codes in jobs:
        res = compare(paper, k["rows"], plumber_rows(pdf, pages), codes)
        res["parsedOk"] = k["ok"]
        json.dump(res, open(os.path.join(OUT, "keycheck", f"{paper}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{paper:<18} parsedOk={str(k['ok']):<5} agree={res['agree']}/{res['rows']} ok={str(res['ok']):<5} "
              f"strategy={res['strategies']} mismatches={res['mismatches'][:3]} missing={res['missingInSecondReading'][:4]} extra={res['extraInSecondReading'][:4]}")


if __name__ == "__main__":
    main()
