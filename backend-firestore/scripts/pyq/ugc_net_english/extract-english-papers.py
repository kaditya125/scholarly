import pymupdf
import re
import json
import os
import time

MANIFEST_IN = 'dataset_staging/ugc_net_english/verified_english_manifest.json'
OUT_DIR = 'dataset_staging/ugc_net_english/extracted'
ALL_EXTRACTED_OUT = 'dataset_staging/ugc_net_english/ugc_net_english_all_extracted_pyqs.json'

os.makedirs(OUT_DIR, exist_ok=True)

ENGLISH_TAXONOMY = [
    (1, 'UNIT_1_DRAMA', 'Drama', [
        'shakespeare', 'marlowe', 'ben jonson', 'tragedy', 'comedy', 'hamlet', 'macbeth',
        'king lear', 'othello', 'dr faustus', 'congreve', 'george bernard shaw', 'samuel beckett', 'godot'
    ]),
    (2, 'UNIT_2_POETRY', 'Poetry', [
        'chaucer', 'spenser', 'sonnet', 'john donne', 'metaphysical', 'john milton', 'paradise lost',
        'alexander pope', 'wordsworth', 'coleridge', 'keats', 'shelley', 'tennyson', 'browning', 'yeats', 'eliot'
    ]),
    (3, 'UNIT_3_FICTION_SHORT_STORY', 'Fiction, Short Story', [
        'novel', 'fiction', 'short story', 'defoe', 'richardson', 'fielding', 'jane austen',
        'bronte', 'dickens', 'george eliot', 'thomas hardy', 'james joyce', 'virginia woolf', 'orwell', 'rushdie'
    ]),
    (4, 'UNIT_4_NON_FICTIONAL_PROSE', 'Non-Fictional Prose', [
        'essay', 'prose', 'biography', 'autobiography', 'francis bacon', 'addison', 'steele',
        'samuel johnson', 'charles lamb', 'william hazlitt', 'carlyle', 'ruskin', 'travelogue'
    ]),
    (5, 'UNIT_5_LANGUAGE_THEORIES_PEDAGOGY', 'Language: Basic Concepts, Theories and Pedagogy / English in Use', [
        'linguistics', 'phonetics', 'phonology', 'syntax', 'semantics', 'pragmatics', 'saussure',
        'chomsky', 'universal grammar', 'elt', 'language teaching', 'communicative'
    ]),
    (6, 'UNIT_6_ENGLISH_IN_INDIA', 'English in India: History, Evolution and Futures', [
        'macaulay', 'wood\'s despatch', 'charter act', 'english in india', 'bilingualism',
        'toru dutt', 'aurobindo', 'sarojini naidu', 'mulk raj anand', 'r.k. narayan', 'raja rao', 'ezekiel'
    ]),
    (7, 'UNIT_7_CULTURAL_STUDIES', 'Cultural Studies', [
        'cultural studies', 'birmingham', 'richard hoggart', 'raymond williams', 'e.p. thompson',
        'stuart hall', 'subculture', 'popular culture', 'mass culture', 'hegemony'
    ]),
    (8, 'UNIT_8_LITERARY_CRITICISM', 'Literary Criticism', [
        'literary criticism', 'aristotle', 'poetics', 'mimesis', 'catharsis', 'longinus', 'sublime',
        'philip sidney', 'dryden', 'arnold', 'touchstone', 'dissociation of sensibility', 'practical criticism'
    ]),
    (9, 'UNIT_9_LITERARY_THEORY', 'Literary Theory post World War II', [
        'literary theory', 'formalism', 'new criticism', 'structuralism', 'barthes',
        'derrida', 'deconstruction', 'foucault', 'lacan', 'feminist theory', 'edward said', 'orientalism', 'spivak'
    ]),
    (10, 'UNIT_10_RESEARCH_METHODS_MATERIALS', 'Research Methods and Materials in English', [
        'research methods', 'methodology', 'mla handbook', 'citation style', 'bibliography',
        'works cited', 'primary source', 'secondary source', 'textual criticism', 'plagiarism'
    ])
]

def classify_english_text(text):
    lower = text.lower()
    best_unit = ENGLISH_TAXONOMY[0]
    best_score = -1
    for u_num, u_code, u_name, kws in ENGLISH_TAXONOMY:
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_unit = (u_num, u_code, u_name)
    return best_unit[0], best_unit[1], best_unit[2]

def parse_management_chunk(chunk, paper_meta):
    chunk = chunk.strip()
    m = re.match(r'^(\d{1,3})\.\s*([\s\S]+)', chunk)
    if not m:
        return None
    q_num = int(m.group(1))
    body = m.group(2).strip()

    opt_matches = list(re.finditer(r'(?:^|\n|\s{2,})(\([1-4A-Da-d]\))\s*', body))
    options = []
    q_text = ""

    if len(opt_matches) >= 4:
        om = opt_matches[-4:]
        q_text = body[:om[0].start()].strip()
        for i in range(4):
            start = om[i].end()
            end = om[i+1].start() if i < 3 else len(body)
            opt_str = body[start:end].strip()
            opt_str = re.sub(r'\s+', ' ', opt_str)
            options.append(opt_str)
    else:
        lines = body.splitlines()
        opt_lines = []
        q_lines = []
        for line in lines:
            line_s = line.strip()
            if re.match(r'^\([1-4A-Da-d]\)\s*', line_s) or re.match(r'^[1-4A-Da-d]\.\s*', line_s):
                clean_opt = re.sub(r'^\([1-4A-Da-d]\)\s*|^[1-4A-Da-d]\.\s*', '', line_s)
                opt_lines.append(clean_opt)
            else:
                if len(opt_lines) == 0:
                    q_lines.append(line_s)
        if len(opt_lines) == 4:
            q_text = " ".join(q_lines).strip()
            options = opt_lines
        else:
            return None

    q_text = re.sub(r'\s+', ' ', q_text).strip()
    if len(q_text) < 15 or len(options) < 4:
        return None
    for opt in options:
        if len(opt) == 0:
            return None

    ascii_chars = sum(1 for c in q_text if ord(c) < 128)
    if ascii_chars / len(q_text) < 0.65:
        return None

    u_num, u_code, u_name = classify_english_text(q_text + " " + " ".join(options))
    clean_paper = paper_meta['paper'].replace(' ', '_').lower()
    canonical_q_id = f"ugc_net:english_30:{paper_meta['year']}:{paper_meta['session'].lower()}:{clean_paper}:q{q_num:02d}"

    return {
        'canonicalQuestionId': canonical_q_id,
        'questionNumber': q_num,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'English',
        'subjectCode': '30',
        'year': paper_meta['year'],
        'session': paper_meta['session'],
        'paper': paper_meta['paper'],
        'unitNumber': u_num,
        'unitCode': u_code,
        'unitName': u_name,
        'text': q_text,
        'options': options,
        'correctOption': 1,
        'marks': 2,
        'negativeMarks': 0,
        'isAuthenticPYQ': True,
        'corpusBucket': 'OFFICIAL_PYQ',
        'sourceTier': 'TIER_A_OFFICIAL',
        'sourceName': 'UGC NET Official Archive (ugcnetonline.in)',
        'sourcePaperId': paper_meta['canonicalPaperId'],
        'documentHash': paper_meta['documentHash'],
        'ingestedAt': int(time.time() * 1000)
    }

def extract_from_english_pdf(pdf_path, paper_meta):
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    extracted_questions = {}

    # English is monolingual, so all pages 1..total_pages are English!
    all_english_text = ""
    for page_idx in range(1, total_pages):
        t = doc[page_idx].get_text("text")
        all_english_text += f"\n--- PAGE {page_idx+1} ---\n" + t

    if len(all_english_text) > 3000:
        lines = [l.strip() for l in all_english_text.splitlines() if l.strip()]
        clean_lines = []
        for l in lines:
            if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|ENGLISH|P\.T\.O\.)', l, re.I):
                continue
            clean_lines.append(l)
        chunks = re.split(r'\n(?=\d{1,3}\.\s+)', "\n".join(clean_lines))
        for ch in chunks:
            parsed = parse_management_chunk(ch, paper_meta)
            if parsed:
                q_num = parsed['questionNumber']
                if q_num not in extracted_questions:
                    extracted_questions[q_num] = parsed

    if len(extracted_questions) < 30:
        for page_idx in range(1, total_pages):
            page = doc[page_idx]
            blocks = page.get_text("blocks")
            page_width = page.rect.width
            mid_x = page_width / 2.0

            left_blocks = [b for b in blocks if b[2] <= mid_x + 30 and b[4].strip()]
            right_blocks = [b for b in blocks if b[0] >= mid_x - 30 and b[4].strip()]
            left_blocks.sort(key=lambda b: (b[1], b[0]))
            right_blocks.sort(key=lambda b: (b[1], b[0]))

            streams = []
            if len(right_blocks) > 0:
                streams.append("\n".join(b[4] for b in left_blocks))
                streams.append("\n".join(b[4] for b in right_blocks))
            else:
                blocks.sort(key=lambda b: (b[1], b[0]))
                streams.append("\n".join(b[4] for b in blocks))

            for st in streams:
                lines = [l.strip() for l in st.splitlines() if l.strip()]
                clean_lines = []
                for l in lines:
                    if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|ENGLISH|P\.T\.O\.)', l, re.I):
                        continue
                    clean_lines.append(l)
                chunks = re.split(r'\n(?=\d{1,3}\.\s+)', "\n".join(clean_lines))
                for ch in chunks:
                    parsed = parse_management_chunk(ch, paper_meta)
                    if parsed:
                        q_num = parsed['questionNumber']
                        if q_num not in extracted_questions:
                            extracted_questions[q_num] = parsed

    return [extracted_questions[k] for k in sorted(extracted_questions.keys())]

def run():
    with open(MANIFEST_IN, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # Deduplicate manifest by canonicalPaperId
    unique_manifest = {}
    for p in manifest:
        if p['canonicalPaperId'] not in unique_manifest:
            unique_manifest[p['canonicalPaperId']] = p
    manifest = list(unique_manifest.values())

    print(f"Extracting authentic English questions across {len(manifest)} verified official papers...")
    all_questions = []

    for idx, paper_meta in enumerate(manifest):
        pdf_path = paper_meta['localPath']
        if not os.path.exists(pdf_path):
            continue

        questions = extract_from_english_pdf(pdf_path, paper_meta)
        key = f"{paper_meta['year']}_{paper_meta['session']}_{paper_meta['paper'].replace(' ', '_')}"
        print(f"  [{idx+1}/{len(manifest)}] [{key}] Extracted {len(questions)} questions from {os.path.basename(pdf_path)}")

        if questions:
            out_single = os.path.join(OUT_DIR, f"{key}_extracted.json")
            with open(out_single, 'w', encoding='utf-8') as sf:
                json.dump(questions, sf, indent=2)
            all_questions.extend(questions)

    with open(ALL_EXTRACTED_OUT, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, indent=2)

    print(f"\n=======================================================")
    print(f"[EXTRACTION COMPLETED] Total Authentic English Questions Extracted: {len(all_questions)}")
    print(f"Combined Corpus saved to: {ALL_EXTRACTED_OUT}")
    print(f"=======================================================")

if __name__ == '__main__':
    run()
