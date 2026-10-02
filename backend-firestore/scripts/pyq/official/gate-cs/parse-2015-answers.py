"""
Extract the official answers printed inside the GATE 2015 CS archive paper (CS2015.pdf: three sessions).

This file is the exam's own CBT record: every question carries its type, and
  MCQ  "Options :" is followed by four option-row images, drawn green (correct, with a tick) or red (with a cross)
  NAT  "Correct Answer :" is followed by the value printed in green text
Nothing here is read by a model. Each answer must pass:
  - numbering 1..65 per session, types as printed
  - MCQ: exactly four option rows, exactly one green and three red
  - MCQ: the letter glyph in row k looks like the letter glyph in row k of every other question (A, B, C, D in
    that order); a row whose glyph does not match is reported
  - NAT: exactly one green value, well-formed number or range
  - marks from the session's own printed notes ("Q.1 to Q.5 carry 1 mark each ..."), covering all 65, summing to
    the printed "Total Marks"
Output: out/gate-cs/key_GATE_CS_2015_SET{1,2,3}.json (same row shape as the other keys) plus the sitting name.
"""
import hashlib, json, os, re
import pymupdf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "gate-cs")
PDF = "archive/CS/CS2015.pdf"
GREEN = 0x00FF00


def colour_counts(page, bbox):
    pix = page.get_pixmap(dpi=150, clip=pymupdf.Rect(bbox), colorspace=pymupdf.csRGB, alpha=False)
    s, green, red = pix.samples, 0, 0
    for i in range(0, len(s), 3):
        r, g, b = s[i], s[i + 1], s[i + 2]
        if g > 120 and r < 110 and b < 110: green += 1
        elif r > 170 and g < 110 and b < 110: red += 1
    return green, red, pix


def glyph(pix):
    """The option letter at the right end of the coloured row, as a 10x10 ink bitmap."""
    w, h, s = pix.width, pix.height, pix.samples
    ink = [[1 if (max(s[(y * w + x) * 3:(y * w + x) * 3 + 3]) - min(s[(y * w + x) * 3:(y * w + x) * 3 + 3]) > 60) else 0
            for x in range(w)] for y in range(h)]
    cols = [x for x in range(w) if any(ink[y][x] for y in range(h))]
    if not cols:
        return None
    # the row is "k. <icon> L": take the last connected run of inked columns = the letter
    runs, start = [], cols[0]
    for a, b in zip(cols, cols[1:] + [None]):
        if b is None or b != a + 1:
            runs.append((start, a)); start = b
    x0, x1 = runs[-1]
    rows = [y for y in range(h) if any(ink[y][x] for x in range(x0, x1 + 1))]
    y0, y1 = rows[0], rows[-1]
    return tuple(ink[y0 + (y1 - y0) * i // 9][x0 + (x1 - x0) * j // 9] for i in range(10) for j in range(10))


def events(doc):
    """Everything that matters, in page/vertical order: question headers, option labels, option rows, answers."""
    ev = []
    for pno in range(1, len(doc) + 1):
        page = doc[pno - 1]
        items = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] == 1:
                items.append((b["bbox"][1], "IMG", b["bbox"], None))
                continue
            for l in b["lines"]:
                t = "".join(s["text"] for s in l["spans"]).strip()
                if not t:
                    continue
                green = all(s["color"] == GREEN for s in l["spans"] if s["text"].strip())
                items.append((l["bbox"][1], "TXT", l["bbox"], (t, green)))
        for y, kind, bbox, data in sorted(items, key=lambda it: it[0]):
            ev.append((pno, kind, bbox, data))
    return ev


def main():
    doc = pymupdf.open(os.path.join(OUT, PDF))
    sha = hashlib.sha256(open(os.path.join(OUT, PDF), "rb").read()).hexdigest()
    sessions, cur = [], None
    for pno, kind, bbox, data in events(doc):
        if kind == "TXT" and re.fullmatch(r"SESSION\s*-\s*(\d)", data[0]):
            cur = {"session": int(re.fullmatch(r"SESSION\s*-\s*(\d)", data[0]).group(1)), "startPage": pno, "items": []}
            sessions.append(cur); continue
        if cur is not None:
            cur["items"].append((pno, kind, bbox, data))

    for sess in sessions:
        paper_id = f"GATE_CS_2015_SET{sess['session']}"
        text = [(p, d[0], d[1], b) for p, k, b, d in sess["items"] if k == "TXT"]
        name = next((t for _, t, _, _ in text if re.search(r"(?i)computer science.*shift", t)), None)
        total = next((float(t) for (_, a, _, _), (_, t, _, _) in zip(text, text[1:]) if a == "Total Marks:" and re.fullmatch(r"[\d.]+", t)), None)
        problems, questions, q = [], [], None
        pending_options = False
        for pno, kind, bbox, data in sess["items"]:
            if kind == "TXT":
                t, green = data
                m = re.fullmatch(r"Question Number\s*:\s*(\d+)\s+Question Type\s*:\s*(\w+)", t)
                if m:
                    q = {"q": int(m.group(1)), "type": m.group(2), "page": pno, "optionRows": [], "answers": []}
                    questions.append(q); pending_options = False; continue
                if q is None:
                    continue
                if t == "Options :":
                    pending_options = True; continue
                if t == "Correct Answer :":
                    pending_options = False; continue
                if green:
                    q["answers"].append({"text": t, "page": pno, "bbox": [round(v, 1) for v in bbox]})
            elif kind == "IMG" and q is not None and pending_options and len(q["optionRows"]) < 4:
                page = doc[pno - 1]
                g, r, pix = colour_counts(page, bbox)
                q["optionRows"].append({"page": pno, "bbox": [round(v, 1) for v in bbox], "green": g, "red": r, "glyph": glyph(pix)})
                if len(q["optionRows"]) == 4:
                    pending_options = False

        # letter templates: the majority glyph seen in each row position across this session's MCQs
        templates = {}
        for k in range(4):
            glyphs = [qq["optionRows"][k]["glyph"] for qq in questions if qq["type"] == "MCQ" and len(qq["optionRows"]) == 4 and qq["optionRows"][k]["glyph"]]
            templates[k] = [round(sum(gl[i] for gl in glyphs) / len(glyphs)) for i in range(100)] if glyphs else None

        # marks as printed: "Q.1 to Q.5 carry 1 mark each & Q.6 to Q.10 carry 2 marks each."
        marks_of = {}
        for _, t, _, _ in text:
            for a, b, mk in re.findall(r"Q\.(\d+)\s*to\s*Q\.(\d+)\s*carry\s*(\d)\s*marks?\s*each", t):
                for n in range(int(a), int(b) + 1):
                    if n in marks_of and marks_of[n] != int(mk): problems.append(f"Q{n} given two different marks in the printed notes")
                    marks_of[n] = int(mk)

        rows = []
        nums = [qq["q"] for qq in questions]
        if nums != list(range(1, 66)): problems.append(f"numbering {nums[:5]}…{nums[-5:]} ({len(nums)}) != 1..65 in order")
        for qq in questions:
            row = {"q": qq["q"], "section": "GA" if qq["q"] <= 10 else "CS", "type": qq["type"], "marks": marks_of.get(qq["q"]),
                   "evidence": {"questionPage": qq["page"]}}
            if qq["type"] == "MCQ":
                rows_ = qq["optionRows"]
                if len(rows_) != 4 or qq["answers"]:
                    problems.append(f"Q{qq['q']}: {len(rows_)} option rows, {len(qq['answers'])} green text answers"); row["key"] = ""; row["keyKind"] = None
                else:
                    colours = ["green" if o["green"] > 30 and o["red"] < 5 else "red" if o["red"] > 30 and o["green"] < 5 else "?" for o in rows_]
                    for k, o in enumerate(rows_):
                        # the letter in row k must look more like the row-k letter than like any other row's letter
                        sims = [sum(1 for a, b in zip(o["glyph"] or (), templates[j] or ()) if a == b) / 100 if templates[j] and o["glyph"] else 0
                                for j in range(4)]
                        best = max(range(4), key=lambda j: sims[j])
                        margin = sims[k] - max(sims[j] for j in range(4) if j != k)
                        o["glyphSimilarity"] = [round(v, 2) for v in sims]
                        if best != k or margin < 0.03:
                            problems.append(f"Q{qq['q']} option row {k + 1}: letter looks like row {best + 1} (similarities {o['glyphSimilarity']})")
                    if colours.count("green") == 1 and colours.count("red") == 3:
                        row["key"] = "ABCD"[colours.index("green")]; row["keyKind"] = "MCQ"
                    else:
                        problems.append(f"Q{qq['q']}: option colours {colours}"); row["key"] = ""; row["keyKind"] = None
                    row["evidence"]["optionRows"] = [{k: v for k, v in o.items() if k != "glyph"} for o in rows_]
            elif qq["type"] == "NAT":
                vals = [a["text"] for a in qq["answers"]]
                v = vals[0] if len(vals) == 1 else None
                m = v and re.fullmatch(r"(-?\d+(?:\.\d+)?)(?:\s*(?:to|:)\s*(-?\d+(?:\.\d+)?))?", v)
                if not m:
                    problems.append(f"Q{qq['q']}: NAT answer text {vals}"); row["key"] = ""; row["keyKind"] = None
                else:
                    lo, hi = float(m.group(1)), float(m.group(2) or m.group(1))
                    row["key"] = v; row["keyKind"] = "NAT"; row["ranges"] = [[lo, hi]]
                    if lo > hi: problems.append(f"Q{qq['q']}: reversed range {v}")
                row["evidence"]["answer"] = qq["answers"]
            else:
                problems.append(f"Q{qq['q']}: unexpected question type {qq['type']}"); row["key"] = ""; row["keyKind"] = None
            if row["marks"] is None: problems.append(f"Q{qq['q']}: no printed marks note covers it")
            rows.append(row)
        msum = sum(r["marks"] or 0 for r in rows)
        if total is None or msum != total: problems.append(f"marks sum {msum} != printed Total Marks {total}")
        if sum(1 for r in rows if r["section"] == "GA") != 10: problems.append("GA rows != 10")

        out = {"paper": paper_id, "sourceFile": PDF, "fileSha256": sha, "sessionStartPage": sess["startPage"],
               "printedPaperName": name, "printedTotalMarks": total, "numbering": "continuous",
               "method": "CBT record: option-row colours (green tick / red cross) and green 'Correct Answer' text; letter glyphs checked per row",
               "ok": not problems, "problems": problems, "rows": rows}
        json.dump(out, open(os.path.join(OUT, f"key_{paper_id}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        kinds = {}
        for r in rows: kinds[r["keyKind"]] = kinds.get(r["keyKind"], 0) + 1
        print(f"{paper_id:<18} '{name}' rows={len(rows)} ok={not problems} kinds={kinds} marks={msum}/{total} {problems[:5]}")


if __name__ == "__main__":
    main()
