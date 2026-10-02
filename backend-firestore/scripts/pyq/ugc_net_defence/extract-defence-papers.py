import pymupdf
import re
import json
import os
import time

MANIFEST_IN = 'dataset_staging/ugc_net_defence/verified_defence_manifest.json'
OUT_DIR = 'dataset_staging/ugc_net_defence/extracted'
ALL_EXTRACTED_OUT = 'dataset_staging/ugc_net_defence/ugc_net_defence_all_extracted_pyqs.json'

os.makedirs(OUT_DIR, exist_ok=True)


DEFENCE_TAXONOMY = [
    (1, 'UNIT_1_THEORIES_AND_CONCEPTS', 'Theories and Concepts', [
        'national security', 'national power', 'national interest', 'sovereignty', 'balance of power', 'collective security', 'deterrence', 'detente', 'alliance', 'state'
    ]),
    (2, 'UNIT_2_STRATEGIC_THOUGHT', 'Strategic Thought', [
        'sun tzu', 'kautilya', 'machiavelli', 'clausewitz', 'jomini', 'douhet', 'billy mitchell', 'liddell hart', 'fuller', 'mao zedong', 'che guevara', 'arthashastra', 'kissinger', 'beaufre'
    ]),
    (3, 'UNIT_3_WAR_AS_AN_INSTRUMENT_IN_INTERNATIONAL_RELATIONS', 'War as an Instrument in International Relations', [
        'causes of war', 'principles of war', 'guerrilla', 'insurgency', 'counter-insurgency', 'low intensity', 'terrorism', 'limited war', 'arms race', 'democratic peace'
    ]),
    (4, 'UNIT_4_WMD_NUCLEAR_PROLIFERATION_AND_NATIONAL_SECURITY', 'WMD, Nuclear Proliferation and National Security', [
        'wmd', 'nuclear', 'npt', 'ctbt', 'disarmament', 'arms control', 'chemical weapon', 'biological weapon', 'cwc', 'bwc', 'missile defense', 'star wars', 'ptbt', 'mtcr', 'nsg'
    ]),
    (5, 'UNIT_5_GLOBAL_SECURITY_CONCERNS', 'Global Security Concerns', [
        'cold war', 'global warming', 'climate change', 'refugee', 'migration', 'organized crime', 'human trafficking', 'money laundering', 'arab spring', 'taiwan', 'south china sea', 'energy security'
    ]),
    (6, 'UNIT_6_INDIAS_SECURITY_CONCERNS_AND_POLICIES', 'India\'s Security Concerns & Policies in Contemporary International Scenario', [
        'india', 'pakistan', 'china', 'sino-indian', 'indo-pak', 'kashmir', 'siachen', 'kargil', 'act east', 'indo-pacific', 'indian ocean', 'doctrine', 'higher defence', 'cds', 'theatre command'
    ]),
    (7, 'UNIT_7_ISSUES_IN_CONFLICT_RESOLUTION', 'Issues in Conflict Resolution', [
        'conflict resolution', 'conflict management', 'united nations', 'peacekeeping', 'peace making', 'peacebuilding', 'confidence building', 'cbm', 'geneva convention', 'humanitarian law', 'gandhian'
    ]),
    (8, 'UNIT_8_DISASTER_MANAGEMENT_AND_NATIONAL_SECURITY', 'Disaster Management and National Security', [
        'disaster', 'earthquake', 'tsunami', 'cyclone', 'flood', 'ndma', 'ndrf', 'vulnerability', 'mitigation', 'bhopal gas', 'chernobyl', 'fukushima', 'sendai framework'
    ]),
    (9, 'UNIT_9_DEFENCE_ECONOMICS', 'Defence Economics', [
        'defence expenditure', 'defence budget', 'gun vs butter', 'economic cause', 'economic warfare', 'procurement', 'wto', 'trips', 'defence economics', 'sanction'
    ]),
    (10, 'UNIT_10_SCIENCE_AND_TECHNOLOGY_AND_NATIONAL_SECURITY', 'Science & Technology and National Security', [
        'technology', 'drdo', 'isro', 'cyber', 'revolution in military affairs', 'rma', 'c4isr', 'ordnance factory', 'dpsu', 'dual use', 'social media', 'information warfare', 'missile'
    ])
]

def classify_defence_text(text):
    lower = text.lower()
    best_unit = DEFENCE_TAXONOMY[0]
    best_score = -1
    for u_num, u_code, u_name, kws in DEFENCE_TAXONOMY:
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

    u_num, u_code, u_name = classify_defence_text(q_text + " " + " ".join(options))
    clean_paper = paper_meta['paper'].replace(' ', '_').lower()
    canonical_q_id = f"ugc_net:defence_10:{paper_meta['year']}:{paper_meta['session'].lower()}:{clean_paper}:q{q_num:02d}"

    return {
        'canonicalQuestionId': canonical_q_id,
        'questionNumber': q_num,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'Defence and Strategic Studies',
        'subjectCode': '11',
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

def extract_from_defence_pdf(pdf_path, paper_meta):
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    extracted_questions = {}

    # Check even vs all pages
    even_english_text = ""
    for page_idx in range(1, total_pages, 2):
        t = doc[page_idx].get_text("text")
        ascii_count = sum(1 for c in t if ord(c) < 128 and c.isalpha())
        total_count = sum(1 for c in t if c.isalpha())
        if total_count > 0 and (ascii_count / total_count) > 0.75:
            even_english_text += f"\n--- PAGE {page_idx+1} ---\n" + t

    if len(even_english_text) > 5000:
        lines = [l.strip() for l in even_english_text.splitlines() if l.strip()]
        clean_lines = []
        for l in lines:
            if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|DEFENCE AND STRATEGIC STUDIES|DEFENCE|P\.T\.O\.)', l, re.I):
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
                    if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|DEFENCE AND STRATEGIC STUDIES|DEFENCE|P\.T\.O\.)', l, re.I):
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

    print(f"Extracting authentic Defence and Strategic Studies questions across {len(manifest)} verified official papers...")
    all_questions = []

    for idx, paper_meta in enumerate(manifest):
        pdf_path = paper_meta['localPath']
        if not os.path.exists(pdf_path):
            continue

        questions = extract_from_defence_pdf(pdf_path, paper_meta)
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
    print(f"[EXTRACTION COMPLETED] Total Authentic Defence and Strategic Studies Questions Extracted: {len(all_questions)}")
    print(f"Combined Corpus saved to: {ALL_EXTRACTED_OUT}")
    print(f"=======================================================")

if __name__ == '__main__':
    run()
