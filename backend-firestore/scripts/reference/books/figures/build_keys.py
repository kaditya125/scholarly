"""
Track A, step 3 — join each non-verbal figure question to its printed key.

Inputs (dataset_staging/<book>/figures/):
  pages/p*.json    extract_figures.py — per question: status, crops, printed option labels
  answers/p*.json  read_answers.py    — per page: hidden?, running head, blocks top-to-bottom

The owner's rule is "no key → no answer", and this source is a preview copy with ~44% of its
pages hidden, so the join is built for PRECISION: a question gets a key only when the evidence ties
the two together, never because a number happens to match. A key is attached only if ALL hold:

  1. The question is in the visible question run directly before an answer block — no hidden page
     inside that run, or between it and the answers. (Questions before a hidden page are left
     unkeyed: the hidden page could hold the end of one exercise, its answers and the start of
     the next, and nothing visible would tell us.)
  2. The answers' highest number equals the run's last question number — the signature of the
     same exercise. This is what stops a chapter-end block listing several exercises' answers
     from being pinned on whichever exercise came last.
  3. A heading that names an exercise agrees with the run's printed exercise label, when both exist.
  4. The key is exactly one of the question's printed option labels.
  5. The question's figures were cropped (extract_figures status OK).

Consecutive answer blocks with no questions between them are one answer set (solution lists run
across pages); a hidden page ends the set.

Writes figures/keyed_manifest.json and prints a per-chapter report. Nothing is uploaded.

  python build_keys.py --book schand_reasoning
"""
import argparse, json, os, re
from collections import Counter, defaultdict

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
STAGING = os.path.abspath(os.path.join(BACKEND, '..', 'dataset_staging'))
BOOK_DIRS = {'schand_reasoning': 'schand/reasoning'}
# Running heads that name the book part, not the chapter (printed on left-hand pages).
PART_TITLES = {'non-verbal reasoning', 'verbal reasoning', 'a modern approach to verbal & non-verbal reasoning'}

ap = argparse.ArgumentParser()
ap.add_argument('--book', default='schand_reasoning')
args = ap.parse_args()
FIG = os.path.join(STAGING, *BOOK_DIRS[args.book].split('/'), 'figures')


def load_dir(sub):
    d = os.path.join(FIG, sub)
    return {int(f[1:5]): json.load(open(os.path.join(d, f), encoding='utf-8'))
            for f in os.listdir(d) if re.fullmatch(r'p\d{4}\.json', f)}


def as_int(v):
    m = re.match(r'^\s*(\d{1,3})\s*\.?\s*$', str(v)) if v is not None else None
    return int(m.group(1)) if m else None


def norm_label(v):
    """'(c)' / 'C' / ' 3 ' -> 'c' / 'c' / '3'."""
    return re.sub(r'[\s().]', '', str(v or '')).lower()


def norm_chapter(v):
    """'1. SERIES' (chapter opening page), 'Series 21' / '177' (head read with its page number) and
    'Series' are the same chapter; a head that is only a page number yields ''."""
    t = re.sub(r'^\s*\d+\s*\.\s*', '', str(v or ''))          # '1. SERIES'
    t = re.sub(r'^\s*\d+\s+|\s+\d+\s*$', '', t)             # leading / trailing page number
    t = re.sub(r'\s+', ' ', t).strip()
    return '' if re.fullmatch(r'\d*', t) else t.title()


def norm_exercise(v):
    t = re.sub(r'(?i)exercise|answers?|solutions?|[\s:.-]', '', str(v or '')).upper()
    return t if re.fullmatch(r'\d{1,2}[A-Z]?|[IVX]+', t) else ''


questions = load_dir('pages')
answers = load_dir('answers')
# Independent second read of the answer pages (read_answers.py --check). When present, a key is
# kept only if both reads give the same key for the same page and number.
check = None
if os.path.isdir(os.path.join(FIG, 'answers_check')):
    check = {}
    for p, d in load_dir('answers_check').items():
        for b in d.get('blocks') or []:
            if isinstance(b, dict) and b.get('type') == 'answers':
                for e in b.get('entries') or []:
                    n = as_int(e.get('number')) if isinstance(e, dict) else None
                    if n is not None:
                        check.setdefault((p, n), norm_label(e.get('key')))

# A page in range with no answer read is treated exactly like a hidden page: a gap.
pages = list(range(min(answers), max(answers) + 1))
for p in pages:
    answers.setdefault(p, {'page': p, 'hidden': True, 'unread': True, 'runningHead': '', 'blocks': []})

# Question detail by (page, number), from the extraction pass.
qinfo = {}
for p, d in questions.items():
    for q in d.get('questions') or []:
        qinfo[(p, q['number'])] = q

rows, reasons = [], Counter()
chapter = ''
run = []            # visible questions since the last gap/answers: [(page, number, exercise)]
run_exercise = ''
ans = None          # current answer set: {'entries': {n: entry}, 'heading_ex': str, 'pages': []}


def close_answers(cut_by_gap=False):
    """Attach the collected answer set to the run it follows, under rules 2-5.

    cut_by_gap: hidden pages came after the last collected answers. An answer set whose START is
    anchored to the run, and whose END was lost to hidden pages (or to an unexplained gap that froze
    it), still carries its visible keys; one that simply stops short on visible pages does not.
    """
    global ans, run, run_exercise
    if ans is None:
        return
    entries = ans['entries']
    if run:
        last_q = max(n for _, n, _ in run)
        why = None
        if ans['anchor']:
            why = ans['anchor']
        elif max(entries) > last_q:
            why = f'answers run past the questions ({max(entries)} > {last_q})'
        elif max(entries) < last_q and not (cut_by_gap or ans['frozen']):
            why = f'answers stop at {max(entries)} on a visible page, questions reach {last_q}'
            why = f'answers end at {max(entries)}, questions at {last_q}'
        elif ans['heading_ex'] and run_exercise and ans['heading_ex'] != run_exercise:
            why = f'answer heading {ans["heading_ex"]} vs exercise {run_exercise}'
        for p, n, ex in run:
            q = qinfo.get((p, n))
            row = {'page': p, 'chapter': ch_of[p], 'exercise': ex, 'number': n,
                   'answerPages': ans['pages'], 'status': (q or {}).get('status', 'NOT_EXTRACTED'),
                   'crops': (q or {}).get('crops', {}), 'optionLabels': (q or {}).get('optionLabels', []),
                   'directions': questions.get(p, {}).get('directions', ''), 'tag': (q or {}).get('tag', ''),
                   'key': None, 'explanation': None, 'keyStatus': None}
            e = entries.get(n)
            if why:
                row['keyStatus'] = 'REJECT: ' + why
            elif not e:
                row['keyStatus'] = 'REJECT: no entry for this number'
            else:
                k = norm_label(e.get('key'))
                labels = [norm_label(l) for l in row['optionLabels']]
                if not labels:
                    row['keyStatus'] = 'REJECT: option labels not read'
                elif labels.count(k) != 1:
                    row['keyStatus'] = f'REJECT: key "{e.get("key")}" not one of {row["optionLabels"]}'
                elif check is not None and check.get((e['_page'], n)) != k:
                    got2 = check.get((e['_page'], n))
                    row['keyStatus'] = (f'REJECT: second read says "{got2}", first "{k}"' if got2
                                        else 'REJECT: not confirmed by the second read')
                else:
                    row['key'], row['explanation'] = k, (e.get('explanation') or '').strip()
                    row['keyStatus'] = 'OK'
            rows.append(row)
    ans, run, run_exercise = None, [], ''


def drop_run(reason):
    """Questions that can never be keyed safely (a gap followed them, or a restart/chapter change)."""
    global run, run_exercise
    for p, n, ex in run:
        q = qinfo.get((p, n)) or {}
        rows.append({'page': p, 'chapter': ch_of[p], 'exercise': ex, 'number': n, 'answerPages': [],
                     'status': q.get('status', 'NOT_EXTRACTED'), 'crops': q.get('crops', {}),
                     'optionLabels': q.get('optionLabels', []), 'directions': questions.get(p, {}).get('directions', ''),
                     'tag': q.get('tag', ''), 'key': None, 'explanation': None, 'keyStatus': 'NO KEY: ' + reason})
    run, run_exercise = [], ''


# Chapter per page: the right-hand running head, carried onto following pages.
ch_of = {}
for p in pages:
    head = norm_chapter(answers[p].get('runningHead'))
    if head and head.lower() not in PART_TITLES and not answers[p].get('hidden'):
        chapter = head
    ch_of[p] = chapter
for p in questions:
    ch_of.setdefault(p, '')

def per_page(items):
    """Median count per visible page: how densely this run/answer set packs its numbers."""
    counts = sorted(Counter(p for p, *_ in items).values())
    return counts[len(counts) // 2] if counts else 0


def gap_fits(missing, hidden_pages, density):
    """Could `hidden_pages` pages at this density hold exactly the `missing` numbers skipped?

    This is what makes a hidden page safe to bridge: if the numbers resume where a page-full of
    them would have taken them, the hidden pages held more of the SAME run. A hidden page that also
    held an answer section and another exercise's start would break the count (or the numbering).
    """
    if missing < 0 or density <= 0:
        return False
    expected = hidden_pages * density
    return abs(missing - expected) <= max(3, 0.35 * expected)


prev_chapter = None
gap = 0             # hidden pages since the last visible block
for p in pages:
    d = answers[p]
    if d.get('hidden'):
        gap += 1
        continue
    if prev_chapter is not None and ch_of[p] != prev_chapter:
        close_answers(cut_by_gap=gap > 0)
        drop_run('chapter changed before any answers')
        gap = 0
    prev_chapter = ch_of[p]
    # Two-column pages are read column by column (109-112, 120-123, 113-116, ...). Consecutive
    # question blocks on one page, with no answers between them and no new exercise label after the
    # first, are one run: merge them in number order so column order is not mistaken for a restart.
    blocks = []
    for b in d.get('blocks') or []:
        if (isinstance(b, dict) and b.get('type') == 'questions' and blocks
                and blocks[-1].get('type') == 'questions' and not norm_exercise(b.get('exercise'))):
            blocks[-1] = {**blocks[-1], 'numbers': sorted(
                {n for n in (as_int(x) for x in (blocks[-1].get('numbers') or []) + (b.get('numbers') or [])) if n is not None})}
        elif isinstance(b, dict):
            blocks.append(b)
    for b in blocks:
        if not isinstance(b, dict):
            continue
        if b.get('type') == 'questions':
            nums = [n for n in (as_int(x) for x in b.get('numbers') or []) if n is not None]
            if not nums:
                continue
            if ans is not None:
                close_answers(cut_by_gap=gap > 0)
            ex = norm_exercise(b.get('exercise'))
            if run and (nums[0] <= run[-1][1] or (ex and ex != run_exercise)):
                drop_run('numbering restarted before any answers')
            elif run and gap and not gap_fits(nums[0] - run[-1][1] - 1, gap, per_page(run)):
                drop_run(f'{gap} hidden page(s) do not fit the numbering {run[-1][1]} -> {nums[0]}')
            if ex:
                run_exercise = ex
            run.extend((p, n, run_exercise) for n in nums)
            gap = 0
        elif b.get('type') == 'answers':
            got = {}
            for e in b.get('entries') or []:
                n = as_int(e.get('number')) if isinstance(e, dict) else None
                if n is not None:
                    got.setdefault(n, {**e, '_page': p})
            if not got:
                continue
            first = min(got)
            if ans is None:
                # anchor: why this answer set cannot be tied to the run before it (None = it can).
                # frozen: a later unexplained gap; answers after it are not collected.
                ans = {'entries': {}, 'heading_ex': norm_exercise(b.get('heading')), 'pages': [],
                       'anchor': None, 'frozen': None}
                # Hidden pages between the questions and the first visible answers must be exactly
                # the pages that held answers 1..first-1 (the run's own last question is visible,
                # which the end-number check in close_answers confirms).
                if gap and not gap_fits(first - 1, gap, len(got)):
                    ans['anchor'] = f'{gap} hidden page(s) before the answers do not fit answers 1-{first - 1}'
                elif not gap and first != 1:
                    ans['anchor'] = f'answers start at {first} with no hidden page before them'
            elif ans['frozen'] is None and gap:
                last = max(ans['entries'])
                if not gap_fits(first - last - 1, gap, per_page([(e['_page'],) for e in ans['entries'].values()])):
                    # Stop here; answers after an unexplained gap may belong to another exercise.
                    ans['frozen'] = f'{gap} hidden page(s) inside the answers do not fit {last} -> {first}'
            if ans['frozen'] is not None:
                gap = 0
                continue
            ans['entries'].update({n: e for n, e in got.items() if n not in ans['entries']})
            if p not in ans['pages']:
                ans['pages'].append(p)
            gap = 0
close_answers(cut_by_gap=gap > 0)
drop_run('no answers before the end of the range')

json.dump(rows, open(os.path.join(FIG, 'keyed_manifest.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

# ── report ───────────────────────────────────────────────────────────────────────────────
hidden = sum(1 for p in pages if answers[p].get('hidden'))
usable = [r for r in rows if r['keyStatus'] == 'OK' and r['status'] == 'OK']
print(f'pages {len(pages)} (hidden {hidden}) | question rows {len(rows)} | keyed {sum(r["keyStatus"] == "OK" for r in rows)}'
      f' | keyed AND cropped (usable) {len(usable)}')
by = defaultdict(Counter)
for r in rows:
    by[r['chapter']]['q'] += 1
    by[r['chapter']]['crop'] += r['status'] == 'OK'
    by[r['chapter']]['key'] += r['keyStatus'] == 'OK'
    by[r['chapter']]['use'] += r['keyStatus'] == 'OK' and r['status'] == 'OK'
print(f'\n  {"chapter":36} {"questions":>9} {"cropped":>8} {"keyed":>6} {"usable":>7}')
for c, v in sorted(by.items(), key=lambda kv: -kv[1]['q']):
    print(f'  {c[:36]:36} {v["q"]:9} {v["crop"]:8} {v["key"]:6} {v["use"]:7}')
print('\n  why not keyed:')
for k, v in Counter(re.sub(r'\d+', 'N', r['keyStatus']) for r in rows if r['keyStatus'] != 'OK').most_common(12):
    print(f'    {v:5}  {k[:90]}')
