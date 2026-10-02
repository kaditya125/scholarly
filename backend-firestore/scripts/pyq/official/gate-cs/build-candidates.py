"""
Assemble per-page transcriptions of official GATE CS papers into question candidates, and verify them.

Nothing here writes to Firestore. The output is candidates + a review queue; promotion is a separate,
explicit step. Every check is designed to surface a problem, never to paper over one:

  STRUCTURE   Marks come from the paper's OWN printed instructions ("Q.1 - Q.25 carry one mark each"),
              and every printed question number those instructions name must appear exactly once.
  CROSS-READ  Scanned pages were read by two different models. Stem and every option must agree after
              formatting-only normalisation; any wording difference is flagged for a human decision.
  TEXT LAYER  Pages with a real PDF text layer are checked against it: words the model wrote that are
              not on the page (an invented phrase) or words on the page the model dropped are flagged.
  KEY         Where an official key exists, its question type must fit the transcription
              (MCQ/MSQ need four options, NAT must not have options).
  PLACEHOLDER An option the model filled with "See figure (A)" is not printed text; it becomes a
              figure-only option.

Usage: python build-candidates.py [fileKey ...]      (default: every file with transcripts)
"""
import difflib, glob, json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "gate-cs")
READER_A, READER_B = "gemini-2.5-flash", "gemini-2.5-pro"
SIM_THRESHOLD = 0.97          # cross-read agreement required for stem and each option
TL_PRECISION, TL_RECALL = 0.95, 0.90

LATEX = [(r"\\le(q)?\b", "≤"), (r"\\ge(q)?\b", "≥"), (r"\\ne(q)?\b", "≠"), (r"\\times\b", "×"), (r"\\cdot\b", "·"),
         (r"\\rightarrow\b|\\to\b", "→"), (r"\\leftarrow\b", "←"), (r"\\Rightarrow\b", "⇒"), (r"\\in\b", "∈"),
         (r"\\notin\b", "∉"), (r"\\cup\b", "∪"), (r"\\cap\b", "∩"), (r"\\subseteq\b", "⊆"), (r"\\subset\b", "⊂"),
         (r"\\emptyset\b|\\varnothing\b", "∅"), (r"\\infty\b", "∞"), (r"\\sum\b", "Σ"), (r"\\prod\b", "Π"),
         (r"\\Theta\b", "Θ"), (r"\\theta\b", "θ"), (r"\\Omega\b", "Ω"), (r"\\omega\b", "ω"), (r"\\alpha\b", "α"),
         (r"\\beta\b", "β"), (r"\\lambda\b", "λ"), (r"\\pi\b", "π"), (r"\\sigma\b", "σ"), (r"\\mu\b", "μ"),
         (r"\\epsilon\b|\\varepsilon\b", "ε"), (r"\\delta\b", "δ"), (r"\\Delta\b", "Δ"), (r"\\neg\b|\\lnot\b", "¬"),
         (r"\\wedge\b|\\land\b", "∧"), (r"\\vee\b|\\lor\b", "∨"), (r"\\forall\b", "∀"), (r"\\exists\b", "∃"),
         (r"\\equiv\b", "≡"), (r"\\approx\b", "≈"), (r"\\oplus\b", "⊕"), (r"\\log\b", "log"), (r"\\ln\b", "ln"),
         (r"\\max\b", "max"), (r"\\min\b", "min"), (r"\\mod\b|\\bmod\b|\\pmod\b", "mod"), (r"\\ldots\b|\\dots\b|\\cdots\b", "…")]
PLACEHOLDER = re.compile(r"^\s*(\(?see\s+)?(the\s+)?(figure|fig\.?|diagram|image)\s*\(?[A-D]?\)?\s*\.?\s*$", re.I)


def norm(s):
    """Formatting-only normalisation: two readings that differ only here say the same thing."""
    s = s or ""
    s = re.sub(r"```[a-zA-Z]*", " ", s)
    s = re.sub(r"(?im)^\s*answer\s*:?\s*_+\s*\.?\s*$", " ", s)
    for pat, rep in LATEX:
        s = re.sub(pat, rep, s)
    s = re.sub(r"\\(text|mathrm|mathit|mathbf|operatorname|left|right|big|Big|,|;|!| )", " ", s)
    s = s.replace("$", " ").replace("{", " ").replace("}", " ").replace("\\", " ")
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'").replace("−", "-").replace("–", "-").replace("—", "-")
    s = re.sub(r"[\^_]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def tokens(s):
    return [t for t in re.findall(r"[a-z0-9]+", norm(s)) if len(t) > 1 or t.isdigit()]


def sim(a, b):
    a, b = norm(a).replace(" ", ""), norm(b).replace(" ", "")
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def word_diff(a, b, limit=8):
    sa, sb = norm(a).split(), norm(b).split()
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sa, sb, autojunk=False).get_opcodes():
        if tag != "equal":
            out.append(f"{' '.join(sa[i1:i2]) or '∅'} ⇄ {' '.join(sb[j1:j2]) or '∅'}")
    return out[:limit]


def load_pages(model, key):
    pages = []
    for f in sorted(glob.glob(os.path.join(OUT, "transcripts", model, key, "p*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        r = d.get("result")
        # Pro occasionally wraps the page object in a one-element array; the content is the same.
        if isinstance(r, list) and len(r) == 1 and isinstance(r[0], dict):
            r = r[0]
        if isinstance(r, dict):
            pages.append((d["page"], r))
    return pages


def unreadable_pages(model, key):
    """Pages the model returned nothing usable for — they must be re-read, never silently skipped."""
    bad = []
    for f in sorted(glob.glob(os.path.join(OUT, "transcripts", model, key, "p*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        r = d.get("result")
        if not (isinstance(r, dict) or (isinstance(r, list) and len(r) == 1 and isinstance(r[0], dict))):
            bad.append(d.get("page"))
    return bad


MARK_NOTE = re.compile(r"q\.?\s*(\d{1,2})\s*(?:-|–|to)\s*q\.?\s*(\d{1,2})\s*(?:carry|carries)\s*(one|two|1|2)\s*marks?", re.I)


def assemble(key, model):
    """Stitch page readings into sets → sections → questions. Structure comes from headers, notes and numbering."""
    sets, cur_set, cur_section, last_q = [], None, None, None

    def new_set(label):
        s = {"label": label, "sections": {}, "markRanges": {}, "pages": []}
        sets.append(s)
        return s

    for page_no, r in load_pages(model, key):
        header = " ".join(filter(None, [r.get("header"), r.get("footer")]))
        notes = " | ".join(r.get("sectionNotes") or [])
        sec_hint = "GA" if re.search(r"general\s+aptitude", header + " " + notes, re.I) else (
            "CS" if re.search(r"computer\s+science|main\s+paper|\bCS\b", header, re.I) else None)
        set_m = re.search(r"\bset\s*[-–]?\s*(\d)\b|\bCS\s*[-–]?\s*([123])\b", r.get("header") or "", re.I)
        set_label = (set_m.group(1) or set_m.group(2)) if set_m else None

        for q in r.get("questions") or []:
            num = q.get("number")
            if (num is None or q.get("isContinuation")) and last_q is not None:
                last_q["stem"] = (last_q["stem"] + "\n" + (q.get("stem") or "")).strip()
                if q.get("options"):
                    last_q["options"] = {**(last_q["options"] or {}), **q["options"]}
                last_q["pages"].append(page_no); last_q["boxes"].append({"page": page_no, "box": q.get("box_2d")})
                last_q["figures"] += [dict(f, page=page_no) for f in q.get("figures") or []]
                last_q["unreadable"] = last_q["unreadable"] or bool(q.get("unreadable"))
                last_q["hasAnswerBlank"] = last_q["hasAnswerBlank"] or bool(q.get("hasAnswerBlank"))
                continue
            if num is None:
                continue
            section = sec_hint or cur_section or "CS"
            # A new set starts when the numbering restarts inside a section that is already populated,
            # or when the printed CS set label changes (GA headers carry the GA paper's own set code).
            restart = cur_set is not None and section in cur_set["sections"] and any(
                x["printedNumber"] >= num for x in cur_set["sections"][section])
            label_change = cur_set is not None and section == "CS" and set_label and cur_set["label"] and set_label != cur_set["label"] \
                and cur_set["sections"].get("CS")
            if cur_set is None or restart or label_change:
                cur_set = new_set(set_label if section == "CS" else None)
            if section == "CS" and set_label and not cur_set["label"]:
                cur_set["label"] = set_label
            cur_section = section
            for m in MARK_NOTE.finditer(notes):
                cur_set["markRanges"].setdefault(section, []).append((int(m.group(1)), int(m.group(2)), 1 if m.group(3).lower() in ("one", "1") else 2))
            last_q = {"printedNumber": num, "section": section, "stem": q.get("stem") or "", "options": q.get("options"),
                      "hasAnswerBlank": bool(q.get("hasAnswerBlank")), "unreadable": bool(q.get("unreadable")),
                      "commonDataOrLinked": q.get("commonDataOrLinked"), "pages": [page_no],
                      "boxes": [{"page": page_no, "box": q.get("box_2d")}],
                      "figures": [dict(f, page=page_no) for f in q.get("figures") or []]}
            cur_set["sections"].setdefault(section, []).append(last_q)
            if page_no not in cur_set["pages"]:
                cur_set["pages"].append(page_no)
        # Notes may precede the first question of a section on the page; record them against the current set too.
        if cur_set is not None:
            for m in MARK_NOTE.finditer(notes):
                rng = (int(m.group(1)), int(m.group(2)), 1 if m.group(3).lower() in ("one", "1") else 2)
                sec = sec_hint or cur_section or "CS"
                if rng not in cur_set["markRanges"].get(sec, []):
                    cur_set["markRanges"].setdefault(sec, []).append(rng)
    return sets


def textlayer_words(key, page, box):
    if not box or len(box) != 4:
        return []
    p = os.path.join(OUT, "textlayer", key, f"p{page:03d}.json")
    if not os.path.exists(p):
        return []
    tl = json.load(open(p, encoding="utf-8"))
    if len(tl["words"]) <= 40:
        return None                                   # scanned page: no text layer to check against
    ymin, xmin, ymax, xmax = box
    pad = 12
    return [w[4] for w in tl["words"] if xmin - pad <= (w[0] + w[2]) / 2 <= xmax + pad and ymin - pad <= (w[1] + w[3]) / 2 <= ymax + pad]


def verify_file(key, keys_by_paper):
    sets_a = assemble(key, READER_A)
    sets_b = assemble(key, READER_B) if os.path.isdir(os.path.join(OUT, "transcripts", READER_B, key)) else []
    year = int(re.search(r"(20\d\d)", key).group(1))
    file_problems = []
    for model, label in ((READER_A, "reader A"), (READER_B, "reader B")):
        bad = unreadable_pages(model, key)
        if bad:
            file_problems.append(f"{label} returned no usable reading for pages {bad} — re-read before promotion")
    papers = []
    for si, s in enumerate(sets_a):
        set_no = int(s["label"]) if s["label"] and s["label"].isdigit() else (si + 1)
        multi = len(sets_a) > 1 or re.match(r"CS[12]_", key)
        if re.match(r"CS([12])_", key):
            set_no = int(key[2])
        paper_id = f"GATE_CS_{year}" + (f"_SET{set_no}" if multi else "")
        key_rows = keys_by_paper.get(f"CS{set_no}_{year}") if multi else None
        order = ["GA", "CS"] if (year >= 2014) else ["CS", "GA"]
        questions, problems = [], list(file_problems)
        # ── STRUCTURE: marks from the paper's printed instructions ─────────────────────────────
        for sec in order:
            qs = s["sections"].get(sec, [])
            ranges = s["markRanges"].get(sec, [])
            nums = [q["printedNumber"] for q in qs]
            dup = [n for n, c in Counter(nums).items() if c > 1]
            if dup:
                problems.append(f"{sec}: duplicate printed numbers {dup}")
            if ranges:
                expected = sorted({n for a, b, _ in ranges for n in range(a, b + 1)})
                missing = [n for n in expected if n not in nums]
                extra = [n for n in nums if n not in expected]
                if missing:
                    problems.append(f"{sec}: printed instructions name Q{missing} but they were not found")
                if extra:
                    problems.append(f"{sec}: Q{extra} are not covered by any printed marks instruction")
            elif qs:
                # Some papers print no marks instruction for a section (GATE 2019's CS section opens straight
                # at Q.1). Marks then stay unknown rather than being filled from memory of the pattern, and
                # completeness falls back to the numbering itself: it must run without a gap.
                first, last = min(nums), max(nums)
                gaps = [n for n in range(first, last + 1) if n not in nums]
                if gaps:
                    problems.append(f"{sec}: numbering has gaps {gaps} (no printed marks instruction to check against)")
                s.setdefault("notes", []).append(f"{sec}: no printed marks instruction; numbering Q{first}-Q{last} contiguous, marks left unset")
            for q in qs:
                q["marks"] = next((m for a, b, m in ranges if a <= q["printedNumber"] <= b), None)
                questions.append(q)
        total_marks = sum(q["marks"] or 0 for q in questions)
        # ── Cross-read and text-layer verification per question ────────────────────────────────
        b_index = {}
        if sets_b and si < len(sets_b):
            for sec, qs in sets_b[si]["sections"].items():
                for q in qs:
                    b_index[(sec, q["printedNumber"])] = q
        for order_idx, q in enumerate(questions, start=1):
            flags, ver = [], {}
            # placeholder options → figure-only options
            fig_roles = {f.get("role") for f in q["figures"]}
            if q["options"]:
                for letter, text in list(q["options"].items()):
                    if PLACEHOLDER.match(text or "") or (letter in fig_roles and len(norm(text)) <= 12 and re.search(r"figure|diagram", text or "", re.I)):
                        q["options"][letter] = ""
                        q.setdefault("figureOnlyOptions", []).append(letter)
            if q["unreadable"]:
                flags.append("UNREADABLE_MARK")
            # A LaTeX command whose backslash was eaten as a JSON escape turns into a control character
            # (\theta → TAB + "heta", \frac → FORM FEED + "rac"). Scanned on 2026-09-16 and not seen,
            # but it would be silent, so it stays a permanent check.
            blob = (q["stem"] or "") + "".join(v or "" for v in (q["options"] or {}).values())
            if re.search(r"[\x08\x0c]|\t(heta|imes|ext|ilde|au|riangle)|\r(ightarrow|ho)", blob):
                flags.append("ESCAPE_CORRUPTION_SUSPECTED")
            b = b_index.get((q["section"], q["printedNumber"]))
            scanned = all(textlayer_words(key, pg, None) is None or True for pg in q["pages"]) and \
                any(textlayer_words(key, bx["page"], bx["box"]) is None for bx in q["boxes"])
            if scanned:
                ver["method"] = "CROSS_READ"
                if b is None:
                    flags.append("NO_SECOND_READING")
                else:
                    ver["stemSim"] = round(sim(q["stem"], b["stem"]), 4)
                    if ver["stemSim"] < SIM_THRESHOLD:
                        flags.append("STEM_READINGS_DIFFER")
                        ver["stemDiff"] = word_diff(q["stem"], b["stem"])
                    ka, kb = set((q["options"] or {}).keys()), set((b["options"] or {}).keys())
                    if ka != kb:
                        flags.append("OPTION_SETS_DIFFER")
                    ver["optionSims"] = {}
                    for letter in sorted(ka & kb):
                        if letter in q.get("figureOnlyOptions", []):
                            continue
                        sval = round(sim(q["options"][letter], b["options"][letter]), 4)
                        ver["optionSims"][letter] = sval
                        if sval < SIM_THRESHOLD:
                            flags.append(f"OPTION_{letter}_READINGS_DIFFER")
                            ver.setdefault("optionDiffs", {})[letter] = word_diff(q["options"][letter], b["options"][letter])
                    if bool(q["figures"]) != bool(b["figures"]):
                        flags.append("FIGURE_PRESENCE_DIFFERS")
                    if b["unreadable"]:
                        flags.append("UNREADABLE_MARK_READER_B")
            else:
                ver["method"] = "TEXT_LAYER"
                page_words = []
                for bx in q["boxes"]:
                    w = textlayer_words(key, bx["page"], bx["box"])
                    page_words += w or []
                t_model = tokens(q["stem"] + " " + " ".join((q["options"] or {}).values()))
                t_page = tokens(" ".join(page_words))
                cm, cp = Counter(t_model), Counter(t_page)
                overlap = sum((cm & cp).values())
                ver["precision"] = round(overlap / max(1, sum(cm.values())), 4)
                ver["recall"] = round(overlap / max(1, sum(cp.values())), 4)
                if ver["precision"] < TL_PRECISION:
                    flags.append("WORDS_NOT_ON_PAGE")
                    ver["notOnPage"] = [t for t, c in (cm - cp).items()][:15]
                if ver["recall"] < TL_RECALL:
                    flags.append("PAGE_WORDS_MISSING")
                    ver["missingFromReading"] = [t for t, c in (cp - cm).items()][:15]
            # ── KEY alignment ─────────────────────────────────────────────────────────────────
            key_row = None
            if key_rows:
                key_row = next((r for r in key_rows if r["q"] == order_idx), None)
                if key_row is None:
                    flags.append("NO_KEY_ROW")
                else:
                    has_opts = bool(q["options"]) and len(q["options"]) == 4
                    if key_row["type"] in ("MCQ", "MSQ") and not has_opts:
                        flags.append("KEY_SAYS_OPTIONS_BUT_NONE_READ")
                    if key_row["type"] == "NAT" and q["options"]:
                        flags.append("KEY_SAYS_NUMERIC_BUT_OPTIONS_READ")
                    if key_row["section"] != ("GA" if q["section"] == "GA" else key_row["section"]):
                        flags.append("KEY_SECTION_MISMATCH")
                    if q["marks"] is not None and key_row["marks"] != q["marks"]:
                        flags.append("KEY_MARKS_DIFFER_FROM_PRINTED_INSTRUCTION")
            elif q["options"] and len(q["options"]) not in (4, 5):
                flags.append(f"UNUSUAL_OPTION_COUNT_{len(q['options'])}")
            q.update({"paperId": paper_id, "year": year, "set": set_no if multi else None, "paperOrder": order_idx,
                      "fileKey": key, "verification": ver, "flags": sorted(set(flags)),
                      "officialKey": key_row, "status": "VERIFIED" if not flags else "NEEDS_REVIEW"})
        papers.append({"paperId": paper_id, "fileKey": key, "year": year, "set": set_no if multi else None,
                       "questionCount": len(questions), "totalMarks": total_marks,
                       "sections": {sec: len(s["sections"].get(sec, [])) for sec in order},
                       "structureProblems": problems, "hasOfficialKey": bool(key_rows),
                       "verified": sum(1 for q in questions if q["status"] == "VERIFIED"),
                       "needsReview": sum(1 for q in questions if q["status"] == "NEEDS_REVIEW"),
                       "questions": questions})
    return papers


def main():
    keys_by_paper = {}
    for f in glob.glob(os.path.join(OUT, "key_CS*_20*.json")):
        k = json.load(open(f))
        if k["ok"]:
            keys_by_paper[k["paper"]] = k["rows"]
    wanted = sys.argv[1:] or sorted(os.listdir(os.path.join(OUT, "transcripts", READER_A)))
    os.makedirs(os.path.join(OUT, "candidates"), exist_ok=True)
    for key in wanted:
        for p in verify_file(key, keys_by_paper):
            json.dump(p, open(os.path.join(OUT, "candidates", f"{p['paperId']}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{p['paperId']:<22} q={p['questionCount']:<3} marks={p['totalMarks']:<4} sections={p['sections']} "
                  f"verified={p['verified']} review={p['needsReview']} key={p['hasOfficialKey']} problems={p['structureProblems'][:2]}")


if __name__ == "__main__":
    main()
