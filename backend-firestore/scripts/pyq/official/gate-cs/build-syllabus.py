"""
Turn the two official GATE 2026 syllabus PDFs (CS subject paper + General Aptitude) into a syllabus tree.

Faithfulness rules — the tree is a transcription of the document, not an interpretation of it:
  - Every node name is text printed in the document, verbatim (including "Section 1:" prefixes and the
    document's own hyphen characters). Nothing is renamed, merged, or reordered.
  - Structure comes from the document's typography: bold headings → PAPER / SECTION / SUBJECT;
    a paragraph opening with "Label:" inside a section → SUBJECT; sentences → TOPIC.
  - A paragraph is split into topics only at unambiguous sentence boundaries (". " or "; " outside
    parentheses and not after "e.g"). Where the document's punctuation is ambiguous the paragraph
    stays ONE topic rather than being cut at a guessed boundary.
  - Marks per paper are not in the syllabus documents; they come from the official 2026 answer keys
    (every GA row summed = 15, every subject row = 85) and say so in the description.
Writes out/gate-cs/syllabus/syllabus-structure.json. Ids and graph validation are assigned by
build-syllabus-graph.ts using the application's own canonicalNodeId/validateCanonicalGraph.
"""
import hashlib, json, os, re
import pymupdf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "out", "gate-cs", "syllabus")
DOCS = {
    "CS": ("CS_2026_Syllabus.pdf", "https://gate2026.iitg.ac.in/doc/GATE2026_Syllabus/CS_2026_Syllabus.pdf"),
    "GA": ("GA_2026_Syllabus.pdf", "https://gate2026.iitg.ac.in/doc/GATE2026_Syllabus/GA_2026_Syllabus.pdf"),
}
RUNNING_HEADER = re.compile(r"^GATE 2026\s+IIT Guwahati \| Organizing Institute$")


def blocks(pdf):
    out = []
    for page in pymupdf.open(pdf):
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            spans = [s for l in b["lines"] for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = re.sub(r"\s+", " ", " ".join(s["text"] for l in b["lines"] for s in l["spans"])).strip()
            if RUNNING_HEADER.match(text):
                continue
            bold = all(("Bold" in s["font"]) or (s["flags"] & 16) for s in spans)
            out.append((bold, spans[0]["size"], text))
    return out


def split_topics(paragraph):
    """Split at '. ' / '; ' only when outside parentheses and not part of 'e.g.'."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(paragraph):
        ch = paragraph[i]
        depth += ch == "("
        depth -= ch == ")"
        cur += ch
        at_boundary = ch in ".;" and (i + 1 == len(paragraph) or paragraph[i + 1] == " ")
        if at_boundary and depth == 0 and not re.search(r"\be\.g\.$|\bi\.e\.$", cur):
            parts.append(cur[:-1].strip())
            cur = ""
        i += 1
    if cur.strip():
        parts.append(cur.strip())
    return [p for p in parts if p]


def node(type_, name, order, **extra):
    return {"type": type_, "name": name, "order": order, "children": [], **extra}


def main():
    papers = []
    hashes = {}
    for code, (fname, url) in DOCS.items():
        pdf = os.path.join(OUT, fname)
        sha = hashlib.sha256(open(pdf, "rb").read()).hexdigest()
        hashes[code] = {"url": url, "sha256": sha, "bytes": os.path.getsize(pdf)}
        bl = blocks(pdf)
        title = next(t for bold, size, t in bl if bold and size > 12)
        marks = 15 if code == "GA" else 85
        paper = node("PAPER", title, 1 if code == "GA" else 2, marks=marks,
                     description=f"Marks from the official GATE 2026 answer keys ({'10 General Aptitude questions' if code == 'GA' else '55 subject questions'}); topics transcribed from the official syllabus document.",
                     officialSourceRef=f"{url}#sha256={sha}")
        container = None
        for bold, size, text in bl:
            if text == title:
                continue
            if bold:
                container = node("SECTION" if code == "CS" else "SUBJECT", text, len(paper["children"]) + 1)
                paper["children"].append(container)
                continue
            if container is None:
                raise SystemExit(f"{fname}: body text before any heading: {text[:60]}")
            m = re.match(r"^([A-Z][A-Za-z ]+):\s+(.*)$", text)
            if code == "CS" and m and container["name"].startswith("Section 1:"):
                # Engineering Mathematics groups its paragraphs under printed labels ("Discrete Mathematics:").
                subject = node("SUBJECT", m.group(1).strip(), len(container["children"]) + 1)
                for t in split_topics(m.group(2)):
                    subject["children"].append(node("TOPIC", t, len(subject["children"]) + 1))
                container["children"].append(subject)
            elif code == "GA":
                # GA paragraphs are printed one per line; keep each paragraph as a single topic (verbatim).
                container["children"].append(node("TOPIC", text.rstrip("."), len(container["children"]) + 1))
            else:
                for t in split_topics(text):
                    container["children"].append(node("TOPIC", t, len(container["children"]) + 1))
        papers.append(paper)
    json.dump({"examId": "GATE_CS", "cycleId": "2026", "documents": hashes, "nodes": papers},
              open(os.path.join(OUT, "syllabus-structure.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    def show(n, depth=0):
        extra = f" [{n['marks']} marks]" if n.get("marks") else ""
        print("  " * depth + f"{n['type']}: {n['name']}{extra}")
        for c in n["children"]:
            show(c, depth + 1)
    for p in papers:
        show(p)
    count = lambda n: 1 + sum(count(c) for c in n["children"])
    print("total nodes:", sum(count(p) for p in papers))


if __name__ == "__main__":
    main()
