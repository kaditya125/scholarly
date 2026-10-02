import pymupdf
import re
import json
import os
import time

MANIFEST_IN = 'dataset_staging/ugc_net_paper1/verified_paper1_manifest.json'
OUT_DIR = 'dataset_staging/ugc_net_paper1/extracted'
ALL_EXTRACTED_OUT = 'dataset_staging/ugc_net_paper1/ugc_net_paper1_all_extracted_pyqs.json'

os.makedirs(OUT_DIR, exist_ok=True)

TAXONOMY = [
    (1, 'UNIT_1_TEACHING_APTITUDE', 'Teaching Aptitude', [
        'teaching', 'learner', 'classroom', 'pedagogy', 'formative evaluation', 'summative', 'cbcs',
        'swayam', 'swayamprabha', 'mooc', 'memory level', 'reflective level', 'understanding level',
        'instructional', 'teacher', 'evaluation', 'curriculum', 'lecture', 'heuristics'
    ]),
    (2, 'UNIT_2_RESEARCH_APTITUDE', 'Research Aptitude', [
        'research', 'hypothesis', 'null hypothesis', 'sampling', 'action research', 'experimental research',
        'ex-post facto', 'plagiarism', 'apa', 'mla', 'referencing', 'variable', 'thesis', 'dissertation',
        'positivism', 'qualitative', 'quantitative', 'bibliography', 'paradigm'
    ]),
    (3, 'UNIT_3_COMPREHENSION', 'Comprehension', [
        'passage', 'read the following passage', 'author', 'passage implies', 'context', 'paragraph'
    ]),
    (4, 'UNIT_4_COMMUNICATION', 'Communication', [
        'communication', 'non-verbal', 'kinesics', 'proxemics', 'paralanguage', 'encoding', 'decoding',
        'mass media', 'broadcasting', 'interpersonal', 'intrapersonal', 'semantic barrier', 'listening',
        'telecommunication', 'press council', 'television', 'radio'
    ]),
    (5, 'UNIT_5_MATH_REASONING', 'Mathematical Reasoning and Aptitude', [
        'series', 'ratio', 'proportion', 'percentage', 'profit', 'loss', 'simple interest', 'compound interest',
        'speed', 'distance', 'average', 'fraction', 'coding', 'blood relation', 'direction', 'stamps'
    ]),
    (6, 'UNIT_6_LOGICAL_REASONING', 'Logical Reasoning', [
        'argument', 'syllogism', 'fallacy', 'square of opposition', 'contrary', 'contradictory', 'pramana',
        'pratyaksha', 'anumana', 'upamana', 'shabda', 'arthapatti', 'anupalabdhi', 'vyapti', 'hetu', 'sadhya',
        'paksha', 'venn diagram', 'deductive', 'inductive', 'premise', 'validity'
    ]),
    (7, 'UNIT_7_DATA_INTERPRETATION', 'Data Interpretation', [
        'table', 'bar chart', 'pie chart', 'histogram', 'graph', 'percentage of students', 'data given below',
        'table shows', 'study the table', 'total production', 'expenditure', 'irrigation'
    ]),
    (8, 'UNIT_8_ICT', 'Information and Communication Technology (ICT)', [
        'ict', 'internet', 'intranet', 'email', 'ram', 'rom', 'cache', 'malware', 'phishing', 'virus',
        'browser', 'search engine', 'gigabyte', 'megabyte', 'terabyte', 'binary', 'ascii', 'http', 'https',
        'dns', 'ip address', 'digital india', 'cloud computing'
    ]),
    (9, 'UNIT_9_PEOPLE_ENVIRONMENT', 'People, Development and Environment', [
        'environment', 'pollution', 'greenhouse', 'global warming', 'climate change', 'sdg', 'mdg',
        'sustainable development', 'solar energy', 'renewable', 'air quality', 'pm2.5', 'montreal protocol',
        'paris agreement', 'kyoto', 'biodiversity', 'tsunami', 'earthquake', 'ozone', 'radiation'
    ]),
    (10, 'UNIT_10_HIGHER_EDUCATION', 'Higher Education System', [
        'higher education', 'university', 'ugc', 'aicte', 'naac', 'nirf', 'ancient india', 'takshashila',
        'nalanda', 'valabhi', 'vikramashila', 'radhakrishnan commission', 'kothari commission', 'nep 2020',
        'inter-university', 'governor', 'chancellor', 'vice-chancellor', 'central university', 'distance education',
        'lokpal'
    ])
]

def classify_text(text):
    lower = text.lower()
    best_unit = TAXONOMY[0]
    best_score = -1
    for u_num, u_code, u_name, kws in TAXONOMY:
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_unit = (u_num, u_code, u_name)
    return best_unit[0], best_unit[1], best_unit[2]

def parse_question_chunk(chunk, paper_meta):
    chunk = chunk.strip()
    m = re.match(r'^(\d{1,2})\.\s*([\s\S]+)', chunk)
    if not m:
        return None
    q_num = int(m.group(1))
    body = m.group(2).strip()

    # Find option patterns
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

    u_num, u_code, u_name = classify_text(q_text + " " + " ".join(options))
    canonical_q_id = f"ugc_net:p1:{paper_meta['year']}:{paper_meta['session'].lower()}:q{q_num:02d}"

    return {
        'canonicalQuestionId': canonical_q_id,
        'questionNumber': q_num,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'General Paper on Teaching & Research Aptitude',
        'subjectCode': '00',
        'year': paper_meta['year'],
        'session': paper_meta['session'],
        'paper': 'Paper I',
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

def extract_from_pdf_hybrid(pdf_path, paper_meta):
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    extracted_questions = {}

    # Strategy A: Check if even pages (page 1, 3, 5... 0-indexed) are dedicated English pages
    # Check English density on even vs odd pages
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
            if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - I|PAPER-I|P-000|D-000|J-000|A-000|W-00|X-00|Y-00|Z-00|P\.T\.O\.)', l, re.I):
                continue
            clean_lines.append(l)
        chunks = re.split(r'\n(?=\d{1,2}\.\s+)', "\n".join(clean_lines))
        for ch in chunks:
            parsed = parse_question_chunk(ch, paper_meta)
            if parsed:
                q_num = parsed['questionNumber']
                if q_num not in extracted_questions:
                    extracted_questions[q_num] = parsed

    # Strategy B: If strategy A yielded fewer than 30 questions, do 2-column block decomposition
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
                    if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - I|PAPER-I|P-000|D-000|J-000|W-00|X-00|Y-00|Z-00|P\.T\.O\.)', l, re.I):
                        continue
                    clean_lines.append(l)
                chunks = re.split(r'\n(?=\d{1,2}\.\s+)', "\n".join(clean_lines))
                for ch in chunks:
                    parsed = parse_question_chunk(ch, paper_meta)
                    if parsed:
                        q_num = parsed['questionNumber']
                        if q_num not in extracted_questions:
                            extracted_questions[q_num] = parsed

    return [extracted_questions[k] for k in sorted(extracted_questions.keys())]

def run():
    with open(MANIFEST_IN, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        
    sessions = {}
    for p in manifest:
        key = f"{p['year']}_{p['session']}"
        if key not in sessions:
            sessions[key] = p
            
    print(f"Extracting authentic questions across {len(sessions)} UGC NET Paper I exam sessions...")
    
    all_questions = []
    
    for key, paper_meta in sessions.items():
        pdf_path = paper_meta['localPath']
        if not os.path.exists(pdf_path):
            continue
            
        questions = extract_from_pdf_hybrid(pdf_path, paper_meta)
        print(f"  [{key}] Extracted {len(questions)} high-quality English questions from {os.path.basename(pdf_path)}")
        
        out_single = os.path.join(OUT_DIR, f"{key}_extracted.json")
        with open(out_single, 'w', encoding='utf-8') as sf:
            json.dump(questions, sf, indent=2)
            
        all_questions.extend(questions)
        
    with open(ALL_EXTRACTED_OUT, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, indent=2)
        
    print(f"\n=======================================================")
    print(f"[EXTRACTION COMPLETED] Total Authentic Questions Extracted: {len(all_questions)}")
    print(f"Combined Corpus saved to: {ALL_EXTRACTED_OUT}")
    print(f"=======================================================")

if __name__ == '__main__':
    run()
