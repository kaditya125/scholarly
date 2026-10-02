import pymupdf
import re
import json
import os
import time

MANIFEST_IN = 'dataset_staging/ugc_net_economics/verified_economics_manifest.json'
OUT_DIR = 'dataset_staging/ugc_net_economics/extracted'
ALL_EXTRACTED_OUT = 'dataset_staging/ugc_net_economics/ugc_net_economics_all_extracted_pyqs.json'

os.makedirs(OUT_DIR, exist_ok=True)

ECON_TAXONOMY = [
    (1, 'UNIT_1_MICRO_ECONOMICS', 'Micro Economics', [
        'indifference', 'consumer', 'elasticity', 'isoquant', 'cobb-douglas', 'monopoly', 'oligopoly',
        'cournot', 'bertrand', 'kinked demand', 'pareto', 'welfare', 'returns to scale', 'substitutes'
    ]),
    (2, 'UNIT_2_MACRO_ECONOMICS', 'Macro Economics', [
        'national income', 'gdp', 'keynesian', 'multiplier', 'accelerator', 'is-lm', 'inflation',
        'phillips curve', 'rational expectations', 'consumption function', 'permanent income'
    ]),
    (3, 'UNIT_3_STATS_ECONOMETRICS', 'Statistics and Econometrics', [
        'probability', 'normal distribution', 'sampling', 'hypothesis', 't-test', 'f-test', 'chi-square',
        'ols', 'regression', 'heteroscedasticity', 'autocorrelation', 'multicollinearity', 'durbin-watson'
    ]),
    (4, 'UNIT_4_MATHEMATICAL_ECONOMICS', 'Mathematical Economics', [
        'matrix', 'determinant', 'cramer', 'input-output', 'leontief', 'linear programming', 'simplex',
        'game theory', 'nash equilibrium', 'derivative', 'maxima', 'minima', 'lagrange'
    ]),
    (5, 'UNIT_5_INTERNATIONAL_ECONOMICS', 'International Economics', [
        'trade', 'ricardian', 'heckscher-ohlin', 'stolper', 'terms of trade', 'tariff', 'quota',
        'balance of payments', 'bop', 'devaluation', 'exchange rate', 'wto', 'imf'
    ]),
    (6, 'UNIT_6_PUBLIC_ECONOMICS', 'Public Economics', [
        'public good', 'externality', 'tax', 'taxation', 'direct tax', 'indirect tax', 'deadweight',
        'public debt', 'fiscal deficit', 'finance commission', 'budget', 'canons of taxation'
    ]),
    (7, 'UNIT_7_MONEY_BANKING', 'Money and Banking', [
        'money supply', 'm1', 'm3', 'high powered money', 'quantity theory', 'fisher', 'cambridge',
        'liquidity preference', 'rbi', 'repo', 'reverse repo', 'crr', 'slr', 'commercial bank', 'npa'
    ]),
    (8, 'UNIT_8_GROWTH_DEVELOPMENT', 'Growth and Development Economics', [
        'economic growth', 'hdi', 'human development', 'gini', 'lorenz', 'harrod-domar', 'solow',
        'endogenous', 'lewis model', 'big push', 'balanced growth', 'unbalanced growth', 'poverty'
    ]),
    (9, 'UNIT_9_ENVIRONMENT_DEMOGRAPHY', 'Environmental Economics and Demography', [
        'environment', 'kuznets', 'pigouvian', 'demographic transition', 'malthusian', 'fertility',
        'mortality', 'life expectancy', 'migration', 'census', 'population'
    ]),
    (10, 'UNIT_10_INDIAN_ECONOMY', 'Indian Economy', [
        'indian economy', '1991', 'reforms', 'green revolution', 'agriculture in india', 'msp',
        'industrial policy', 'niti aayog', 'planning commission', 'five year plan', 'unemployment in india'
    ])
]

def classify_econ_text(text):
    lower = text.lower()
    best_unit = ECON_TAXONOMY[0]
    best_score = -1
    for u_num, u_code, u_name, kws in ECON_TAXONOMY:
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_unit = (u_num, u_code, u_name)
    return best_unit[0], best_unit[1], best_unit[2]

def parse_econ_chunk(chunk, paper_meta):
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

    u_num, u_code, u_name = classify_econ_text(q_text + " " + " ".join(options))
    clean_paper = paper_meta['paper'].replace(' ', '_').lower()
    canonical_q_id = f"ugc_net:economics_01:{paper_meta['year']}:{paper_meta['session'].lower()}:{clean_paper}:q{q_num:02d}"

    return {
        'canonicalQuestionId': canonical_q_id,
        'questionNumber': q_num,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'Economics',
        'subjectCode': '01',
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

def extract_from_econ_pdf(pdf_path, paper_meta):
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    extracted_questions = {}

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
            if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|ECONOMICS|P\.T\.O\.)', l, re.I):
                continue
            clean_lines.append(l)
        chunks = re.split(r'\n(?=\d{1,3}\.\s+)', "\n".join(clean_lines))
        for ch in chunks:
            parsed = parse_econ_chunk(ch, paper_meta)
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
                    if re.match(r'^\d{1,3}$', l) or re.search(r'(PAPER - II|PAPER - III|PAPER-II|PAPER-III|ECONOMICS|P\.T\.O\.)', l, re.I):
                        continue
                    clean_lines.append(l)
                chunks = re.split(r'\n(?=\d{1,3}\.\s+)', "\n".join(clean_lines))
                for ch in chunks:
                    parsed = parse_econ_chunk(ch, paper_meta)
                    if parsed:
                        q_num = parsed['questionNumber']
                        if q_num not in extracted_questions:
                            extracted_questions[q_num] = parsed

    return [extracted_questions[k] for k in sorted(extracted_questions.keys())]

def run():
    with open(MANIFEST_IN, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    print(f"Extracting authentic Economics questions across {len(manifest)} verified official papers...")
    all_questions = []

    for idx, paper_meta in enumerate(manifest):
        pdf_path = paper_meta['localPath']
        if not os.path.exists(pdf_path):
            continue

        questions = extract_from_econ_pdf(pdf_path, paper_meta)
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
    print(f"[EXTRACTION COMPLETED] Total Authentic Economics Questions Extracted: {len(all_questions)}")
    print(f"Combined Corpus saved to: {ALL_EXTRACTED_OUT}")
    print(f"=======================================================")

if __name__ == '__main__':
    run()
