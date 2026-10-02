import pymupdf
import re
import json
import os
import hashlib

def parse_ugcnet_pdf(pdf_path):
    doc = pymupdf.open(pdf_path)
    full_text = ""
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text("text")
        full_text += f"\n--- PAGE {page_idx + 1} ---\n" + text

    # Remove headers / footers
    lines = full_text.splitlines()
    cleaned_lines = []
    for line in lines:
        l = line.strip()
        # Drop page numbers, booklet headers
        if re.match(r'^[0-9]+$', l) and len(l) <= 3:
            continue
        if any(h in l for h in ['!J-08718', 'Paper-II', 'Paper-III', 'COMPUTER SCIENCE AND APPLICATIONS', 'PAPER - II', 'PAPER - III', 'Signature and Name of Invigilator']):
            continue
        cleaned_lines.append(line)

    text = "\n".join(cleaned_lines)

    # Question regex: Matches number at start of line followed by dot or colon
    # Options regex: Matches (1)/(2)/(3)/(4) or (A)/(B)/(C)/(D)
    q_splits = re.split(r'\n(?=\d{1,3}\.\s+)', text)

    questions = []
    for chunk in q_splits:
        chunk = chunk.strip()
        m = re.match(r'^(\d{1,3})\.\s*([\s\S]+)', chunk)
        if not m:
            continue
        q_num = int(m.group(1))
        body = m.group(2).strip()

        # Split options
        # Format 1: (1) ... (2) ... (3) ... (4) ...
        # Format 2: (A) ... (B) ... (C) ... (D) ...
        opt_pattern = r'\n\(([1-4A-D])\)\s*'
        parts = re.split(opt_pattern, '\n' + body)

        if len(parts) >= 9: # ['', '1', opt1, '2', opt2, '3', opt3, '4', opt4]
            q_text = parts[0].strip()
            options = []
            for i in range(1, len(parts), 2):
                opt_label = parts[i]
                opt_val = parts[i+1].strip().replace('\n', ' ')
                options.append(opt_val)
            
            if len(options) == 4:
                # Detect question type
                q_type = 'conceptual'
                if any(k in q_text.lower() for k in ['consider the following', 'which of the following statement']):
                    q_type = 'statement_based'
                elif any(k in q_text.lower() for k in ['match the following', 'list - i', 'list-i']):
                    q_type = 'matching'
                elif any(k in q_text.lower() for k in ['output of the following', 'what will be the output', 'class ', 'void main']):
                    q_type = 'code_analysis'
                elif any(k in q_text.lower() for k in ['calculate', 'how many', 'number of']):
                    q_type = 'numerical'

                questions.append({
                    'questionNumber': q_num,
                    'questionText': q_text,
                    'options': options,
                    'questionType': q_type
                })

    return questions

if __name__ == '__main__':
    sample_pdf = 'dataset_staging/ugc_net_cs/raw_pdfs/UGC_NET_CS_2018_July_Paper_II.pdf'
    if os.path.exists(sample_pdf):
        qs = parse_ugcnet_pdf(sample_pdf)
        print(f"Parsed {len(qs)} questions from {sample_pdf}")
        if qs:
            print("\nSample Q1:")
            print(json.dumps(qs[0], indent=2))
            print("\nSample Q3 (Code):")
            print(json.dumps(qs[2], indent=2))
    else:
        print("Sample PDF not found.")
