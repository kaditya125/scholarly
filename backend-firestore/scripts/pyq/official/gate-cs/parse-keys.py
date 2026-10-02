"""
Parse the official GATE CS answer keys (2024-2026) into JSON, pinned to each PDF's SHA-256.

Gates (a key that fails any of them is written with ok=false and must not be used):
  - exactly 65 rows numbered 1..65, no gaps or repeats
  - 10 General Aptitude rows and 55 subject rows
  - marks sum to exactly 100 (GATE's published total)
  - every key is well-formed for its type: MCQ = one letter, MSQ = letters joined by ';',
    NAT = 'x to y' numeric range with x <= y
"""
import json, os, re, subprocess, hashlib
import pymupdf

OUT = os.path.join(os.path.dirname(__file__), "..", "out", "gate-cs")
ROW = re.compile(r"^\s*(\d{1,2})\s+(\d+)\s+(MCQ|MSQ|NAT)\s+(GA|CS[-\s]?\d?)\s+(.+?)\s+([12])\s*$")
results = []

def rows_by_position(pdf_path):
    """Rebuild the key table from word coordinates, not from the text layer's reading order.

    The official key PDFs render as a perfectly aligned table, but their text layer stores some
    cells out of order: a plain text dump attaches the Key/Range of one row to its neighbour
    (2026 CS2 Q27 would read 'A;B;C' instead of 'A;C'). Every cell of a row shares the same
    y-centre on the page, and every column a stable x-centre, so position is the reliable key.
    """
    doc = pymupdf.open(pdf_path)
    out = []
    for page in doc:
        words = [(round((w[1] + w[3]) / 2, 1), (w[0] + w[2]) / 2, w[4]) for w in page.get_text("words")]
        lines = {}
        for yc, xc, t in words:
            k = next((y for y in lines if abs(y - yc) <= 3), yc)
            lines.setdefault(k, []).append((xc, t))
        data = [sorted(v) for v in lines.values() if v and re.fullmatch(r"\d{1,2}", sorted(v)[0][1])]
        simple = [r for r in data if len(r) == 6]
        if not simple:
            continue
        centers = [sorted(r[i][0] for r in simple)[len(simple) // 2] for i in range(6)]
        for r in data:
            cols = [[] for _ in range(6)]
            for xc, t in r:
                cols[min(range(6), key=lambda i: abs(centers[i] - xc))].append(t)
            if not all(cols[i] for i in (0, 1, 2, 3, 5)):
                continue
            out.append([" ".join(c) for c in cols])
    return out

for year in ("2024", "2025", "2026"):
    for s in ("CS1", "CS2"):
        pdf = os.path.join(OUT, year, f"{s}_Keys.pdf")
        sha = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
        rows, problems = [], []
        for q, sess, typ, sec, key, marks in rows_by_position(pdf):
            if not (re.fullmatch(r"\d{1,2}", q) and typ in ("MCQ", "MSQ", "NAT") and re.fullmatch(r"[12]", marks)):
                continue
            key = re.sub(r"\s+", " ", key.strip())
            rows.append({"q": int(q), "session": int(sess) if sess.isdigit() else sess, "type": typ,
                         "section": "GA" if sec == "GA" else s, "key": key, "marks": int(marks)})
        rows.sort(key=lambda r: r["q"])
        nums = [r["q"] for r in rows]
        if nums != list(range(1, 66)):
            problems.append(f"numbering is not exactly 1..65 (got {len(nums)} rows)")
        if sum(1 for r in rows if r["section"] == "GA") != 10:
            problems.append("GA row count != 10")
        if sum(r["marks"] for r in rows) != 100:
            problems.append(f"marks sum {sum(r['marks'] for r in rows)} != 100")
        for r in rows:
            k = r["key"]
            if r["type"] == "MCQ" and not re.fullmatch(r"[ABCD]", k):
                problems.append(f"Q{r['q']} MCQ key malformed: {k!r}")
            elif r["type"] == "MSQ" and not re.fullmatch(r"[ABCD](;[ABCD])*", k):
                problems.append(f"Q{r['q']} MSQ key malformed: {k!r}")
            elif r["type"] == "NAT":
                m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*to\s*(-?\d+(?:\.\d+)?)", k)
                if not m or float(m.group(1)) > float(m.group(2)):
                    problems.append(f"Q{r['q']} NAT key malformed: {k!r}")
                else:
                    r["range"] = [float(m.group(1)), float(m.group(2))]
        out = {"paper": f"{s}_{year}", "year": int(year), "set": s, "keyFile": f"{year}/{s}_Keys.pdf", "sha256": sha,
               "method": "word-coordinates", "ok": not problems, "problems": problems, "rows": rows}
        json.dump(out, open(os.path.join(OUT, f"key_{s}_{year}.json"), "w"), indent=1)
        types = {t: sum(1 for r in rows if r["type"] == t) for t in ("MCQ", "MSQ", "NAT")}
        print(f"{s}_{year}: rows={len(rows)} ok={not problems} types={types} marks={sum(r['marks'] for r in rows)} {problems[:3]}")
