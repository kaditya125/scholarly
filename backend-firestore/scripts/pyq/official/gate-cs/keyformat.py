"""
One reading of an official GATE answer-key cell, shared by every key parser and by the candidate builder.

  MCQ                one letter                      "C"
  MSQ                a set of letters, all required   "A;C"  "A; C"  "B,C,D"  (and a single letter when the type column says MSQ)
  MULTIPLE_ACCEPTED  an MCQ where either is accepted   "C OR D"   (only an explicit OR means alternatives)
  NAT                one or more numeric ranges       "3 to 3"  "256.0 : 256.0"  "3.7 to 3.8 OR 4.0 to 4.1"
  MARKS_TO_ALL       "Marks to All" / "MTA"

Returns (kind, detail, problems). A cell that fits none of these, or whose form contradicts the printed type
column, is a problem to review; nothing is coerced.
"""
import re

_NUM = r"-?\d+(?:\.\d+)?"
_RANGE = rf"({_NUM})\s*(?:to|:)\s*({_NUM})"
_MINUS = re.compile(r"[‐‑‒–−]")


def normalise(key):
    return re.sub(r"\s+", " ", _MINUS.sub("-", key or "")).strip()


def classify(qtype, key):
    k = normalise(key)
    t = (qtype or "").strip().upper() or None
    problems = []
    kind, detail = None, {}
    if re.fullmatch(r"(?i)marks?\s*to\s*all|mta", k):
        kind = "MARKS_TO_ALL"
    elif re.fullmatch(rf"{_RANGE}(\s+(?i:or)\s+{_RANGE})*", k):
        ranges = [[float(a), float(b)] for a, b in re.findall(_RANGE, k)]
        kind, detail = "NAT", {"ranges": ranges}
        if any(lo > hi for lo, hi in ranges):
            problems.append(f"reversed range in {k!r}")
    elif re.fullmatch(r"[ABCD]", k) and t != "MSQ":
        kind, detail = "MCQ", {"options": [k]}
    elif re.fullmatch(r"[ABCD](\s*[;,]\s*[ABCD])*", k) and (t == "MSQ" or (t is None and re.search(r";", k))):
        letters = re.findall(r"[ABCD]", k)
        kind, detail = "MSQ", {"options": letters}
        if len(set(letters)) != len(letters):
            problems.append(f"repeated option in {k!r}")
    elif re.fullmatch(r"[ABCD](\s+(?i:or)\s+[ABCD])+", k):
        kind, detail = "MULTIPLE_ACCEPTED", {"options": re.findall(r"[ABCD]", k)}
    else:
        problems.append(f"key {k!r} not recognised for type {t}")
    if t and kind in ("MCQ", "MSQ", "NAT") and t != kind:
        problems.append(f"type column says {t} but key {k!r} reads as {kind}")
    if kind == "MULTIPLE_ACCEPTED" and t not in (None, "MCQ"):
        problems.append(f"alternatives {k!r} on a {t} question")
    return kind, detail, problems
