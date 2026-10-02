"""
Parse the official answer-key tables that are embedded at the end of the archive question papers.

Same discipline as parse-keys.py: cells are placed by their position on the page, never by the text
layer's reading order, which is known to scramble rows in these documents. Here the tables have
printed borders, so the grid is rebuilt from the drawn lines and every word goes into the bordered
cell its centre falls in. A row whose cells cannot be matched one-to-one with the header is reported,
never guessed. Every key must then pass the gates before it may be used:
  numbering complete (either 1..65, or GA 1..10 + subject 1..55, exactly as printed),
  marks summing to 100 where the table prints marks, 10 GA rows, keys well-formed for their type.

Which column/rows belong to the paper we hold is decided from the paper itself, not assumed:
  2012  the archive booklet is printed "CS-A", so only the "Code : A" column is read
  2014  one PDF, three sessions; each session's key page follows its questions (two tables side by side)
  2016  one PDF, two sets; each set's key follows its questions
  2022  the key is in IIT Roorkee's copy of the paper (misc/cs_2022.pdf pp.42-43), not in the archive copy
Output: out/gate-cs/key_<paperId>.json
"""
import hashlib, importlib.util, json, os, re
import pymupdf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "gate-cs")
_kf = importlib.util.spec_from_file_location("keyformat", os.path.join(os.path.dirname(os.path.abspath(__file__)), "keyformat.py"))
keyformat = importlib.util.module_from_spec(_kf); _kf.loader.exec_module(keyformat)

# paperId → (file, key pages (1-based), layout)
SPECS = {
    "GATE_CS_2012": ("archive/CS/CS2012.pdf", [18, 19], "codes"),
    "GATE_CS_2014_SET1": ("archive/CS/CS2014.pdf", [22], "table"),
    "GATE_CS_2014_SET2": ("archive/CS/CS2014.pdf", [45], "table"),
    "GATE_CS_2014_SET3": ("archive/CS/CS2014.pdf", [67], "table"),
    "GATE_CS_2016_SET1": ("archive/CS/CS2016.pdf", [21, 22], "table"),
    "GATE_CS_2016_SET2": ("archive/CS/CS2016.pdf", [44, 45], "table"),
    "GATE_CS_2017_SET1": ("archive/CS/CS1-2017.pdf", [28, 29], "table"),
    "GATE_CS_2017_SET2": ("archive/CS/CS2-2017.pdf", [26, 27], "table"),
    "GATE_CS_2018": ("archive/CS/CS2018.pdf", [24, 25, 26], "table"),
    "GATE_CS_2020": ("archive/CS/CS2020.pdf", [17, 18], "table"),
    # the archive copy of 2022 has no key; IIT Roorkee's download of the same paper (41 pages, identical text) appends it
    "GATE_CS_2022": ("misc/cs_2022.pdf", [42, 43], "table"),
}


def _merge(vals, tol):
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(g) / len(g) for g in out]


def cell_text(words):
    """A cell's words in reading order: text lines top to bottom (a wrapped key spans lines), then left to right."""
    lines = []
    for yc, x0, t in sorted(words):
        if lines and yc - lines[-1][0] <= 3:
            lines[-1][1].append((x0, t))
        else:
            lines.append([yc, [(x0, t)]])
    return " ".join(t for _, ws in lines for _, t in sorted(ws))


def grid_cells(page):
    """Rebuild the bordered table: every word goes into the cell its centre falls in.

    Returns (rows of cell text, x-range of each column, words inside the table's width but outside every
    ruled row). A row cut by a page break has side borders but no top/bottom rule, so the vertical rules'
    own ends also bound rows; anything still left outside is returned so the caller can report it."""
    vx, hy, vspan = [], [], []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.x - b.x) < 1.5 and abs(a.y - b.y) > 6: vx.append(a.x); vspan += [a.y, b.y]
                if abs(a.y - b.y) < 1.5 and abs(a.x - b.x) > 6: hy.append(a.y)
            elif it[0] == "re":
                r = it[1]
                if r.width < 2.5 and r.height > 6: vx.append((r.x0 + r.x1) / 2); vspan += [r.y0, r.y1]
                elif r.height < 2.5 and r.width > 6: hy.append((r.y0 + r.y1) / 2)
                elif r.width >= 2.5 and r.height >= 2.5 and "s" in (d.get("type") or ""):
                    # an outlined box is a border; a filled box is a background (a web page's buttons, shading)
                    vx += [r.x0, r.x1]; hy += [r.y0, r.y1]
    if vspan:
        hy += [min(vspan), max(vspan)]
    xs, ys = _merge(vx, 3.5), _merge(hy, 2.5)
    grid, strays = {}, []
    for w in page.get_text("words"):
        t = w[4].replace(" ", " ").strip("� ")
        if not t:
            continue
        xc, yc = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        ci = next((i for i in range(len(xs) - 1) if xs[i] <= xc <= xs[i + 1]), None)
        ri = next((i for i in range(len(ys) - 1) if ys[i] <= yc <= ys[i + 1]), None)
        if ci is None or ri is None:
            if ci is not None:
                strays.append((xc, yc, t))
            continue
        grid.setdefault(ri, {}).setdefault(ci, []).append((yc, w[0], t))
    table = [[cell_text(grid[r].get(c, [])) for c in range(len(xs) - 1)] for r in sorted(grid)]
    used = [c for c in range(len(xs) - 1) if any(row[c] for row in table)]
    return [[row[c] for c in used] for row in table], [(xs[c], xs[c + 1]) for c in used], strays


FIELD = [("q", r"^(q\.?\s*no\.?|question\s*no\.?)$"), ("session", r"^session$"), ("type", r"type"),
         ("section", r"^(section|sec\.?\s*name|section\s*name|subject\s*name)$"), ("key", r"^key(\s*/\s*range)?$"), ("marks", r"^marks?$"),
         ("paper", r"^paper$"), ("codeA", r"^code\s*:\s*a$"), ("codeB", r"^code\s*:\s*b$"), ("codeC", r"^code\s*:\s*c$"), ("codeD", r"^code\s*:\s*d$")]


def header_tables(row):
    """A header row → one or more side-by-side sub-tables, each a list of (column, field)."""
    fields = [next((f for f, pat in FIELD if re.search(pat, re.sub(r"\s+", " ", c.strip().lower()))), None) if c.strip() else None
              for c in row]
    if "q" not in fields or not ({"key", "codeA"} & set(fields)):
        return None
    subs, cur = [], []
    for ci, f in enumerate(fields):
        if f is None:
            continue
        if any(f == g for _, g in cur):  # the same column heading again = the next table printed alongside
            subs.append(cur); cur = []
        cur.append((ci, f))
    subs.append(cur)
    return subs


def map_row(row, subs):
    """Cells of one bordered row → records. Exactly one non-empty cell per header field, or it is reported."""
    out = []
    for si, sub in enumerate(subs):
        lo = 0 if si == 0 else sub[0][0]
        hi = subs[si + 1][0][0] if si + 1 < len(subs) else len(row)
        span = [row[ci].strip() for ci in range(lo, min(hi, len(row))) if row[ci].strip()]
        if not span:
            continue
        if len(span) != len(sub):
            out.append({"unparsed": span})
            continue
        # With one cell per field, left-to-right order is the column order. Where the printed grid has extra
        # rules (a web page printed to PDF), the heading and its values can sit in neighbouring grid columns.
        aligned = all(ci < len(row) and row[ci].strip() for ci, _ in sub)
        out.append({**{f: v for (_, f), v in zip(sub, span)}, "_cells": "aligned" if aligned else "ordered"})
    return out


def parse(pdf, pages, layout):
    doc = pymupdf.open(os.path.join(OUT, pdf))
    records, unparsed, subs = [], [], None
    for pno in pages:
        table, cols, strays = grid_cells(doc[pno - 1])
        for row in table:
            hs = header_tables(row)
            if hs:
                subs = hs
                continue
            if subs is None:
                continue
            for rec in map_row(row, subs):
                if "unparsed" in rec:
                    if any(re.fullmatch(r"\d{1,2}", c) for c in rec["unparsed"]):
                        unparsed.append({"page": pno, "cells": rec["unparsed"]})
                    continue
                if not re.fullmatch(r"\d{1,2}", rec.get("q", "")):
                    continue
                key = rec.get("codeA") if layout == "codes" else rec.get("key", "")
                marks = rec.get("marks", "")
                records.append({"page": pno, "section": rec.get("section") or rec.get("paper") or None, "q": int(rec["q"]),
                                "session": rec.get("session"), "type": rec.get("type") or None, "key": key or "",
                                "marks": int(marks) if marks.isdigit() else None, "cells": rec["_cells"],
                                **({"allCodes": {c[-1]: rec.get(c) for c in ("codeA", "codeB", "codeC", "codeD")}} if layout == "codes" else {})})
        if subs:
            # a question number standing in a question-number column but outside every ruled row was not read
            q_cols = [cols[ci] for sub in subs for ci, f in sub if f == "q" and ci < len(cols)]
            for xc, yc, t in strays:
                if re.fullmatch(r"\d{1,2}", t) and any(x0 <= xc <= x1 for x0, x1 in q_cols):
                    unparsed.append({"page": pno, "cells": [t], "at": [round(xc), round(yc)], "reason": "outside the ruled rows"})
    return records, unparsed


def is_ga(r):
    return (r["section"] or "").upper().startswith("GA")


def validate(rows, unparsed, layout):
    problems = [f"p{u['page']} row not matched to the header: {u['cells']}" for u in unparsed]
    ga = sorted(r["q"] for r in rows if is_ga(r))
    subject = sorted(r["q"] for r in rows if not is_ga(r))
    if sorted(r["q"] for r in rows) == list(range(1, 66)):
        numbering = "continuous"
    elif ga == list(range(1, 11)) and subject == list(range(1, 56)):
        numbering = "GA 1-10, subject 1-55"
    else:
        numbering = None
        problems.append(f"numbering: GA {ga} / subject {len(subject)} rows {subject[:3]}…{subject[-3:]} — neither 1..65 nor GA 1..10 + 1..55")
    if layout != "codes" and len(ga) != 10:
        problems.append(f"GA rows {len(ga)} != 10")
    if layout == "codes":
        # the four booklets hold the same questions in a different order, so every code column must carry the
        # same number of each kind of key; a column read out of alignment would break that
        per_code = {c: sorted(("MTA" if re.search(r"(?i)marks", r["allCodes"][c] or "") else "letter") for r in rows) for c in "ABCD"}
        if len({tuple(v) for v in per_code.values()}) != 1:
            problems.append(f"code columns disagree on key kinds: { {c: v.count('MTA') for c, v in per_code.items()} } marks-to-all")
    if layout != "codes":
        total = sum(r["marks"] or 0 for r in rows)
        if total != 100: problems.append(f"marks sum {total} != 100")
        if any(r["marks"] is None for r in rows): problems.append("rows without marks")
    for r in rows:
        r["keyPrinted"] = r["key"]
        r["key"] = keyformat.normalise(r["key"])
        kind, detail, kp = keyformat.classify(r["type"], r["key"])
        r["keyKind"] = kind
        r.update(detail)
        problems += [f"Q{r['q']} ({r['section']}): {p}" for p in kp]
    return problems, numbering


def main():
    for paper_id, (pdf, pages, layout) in SPECS.items():
        rows, unparsed = parse(pdf, pages, layout)
        # a table that continues onto the next page can repeat a row; a real conflict is a problem, not a pick
        seen, uniq, conflicts = {}, [], []
        for r in rows:
            k = ((r["section"] or "").upper()[:2], r["q"])
            if k in seen:
                if seen[k]["key"] != r["key"] or seen[k]["marks"] != r["marks"]:
                    conflicts.append(f"Q{r['q']} ({r['section']}) printed twice with different values")
                continue
            seen[k] = r; uniq.append(r)
        problems, numbering = validate(uniq, unparsed, layout)
        problems = conflicts + problems
        sha = hashlib.sha256(open(os.path.join(OUT, pdf), "rb").read()).hexdigest()
        out = {"paper": paper_id, "sourceFile": pdf, "keyPages": pages, "fileSha256": sha, "layout": layout,
               "booklet": "CS-A" if layout == "codes" else None, "numbering": numbering,
               "method": "grid cells rebuilt from the table's drawn borders (embedded official key table)",
               "ok": not problems, "problems": problems,
               "rows": sorted(uniq, key=lambda r: (0 if is_ga(r) else 1, r["q"]) if numbering != "continuous" else (r["q"],))}
        json.dump(out, open(os.path.join(OUT, f"key_{paper_id}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        kinds = {}
        for r in uniq: kinds[r["keyKind"]] = kinds.get(r["keyKind"], 0) + 1
        cells = {c: sum(1 for r in uniq if r["cells"] == c) for c in ("aligned", "ordered")}
        print(f"{paper_id:<18} rows={len(uniq):<3} ok={str(not problems):<5} numbering={numbering} kinds={kinds} cells={cells} {problems[:4]}")


if __name__ == "__main__":
    main()
