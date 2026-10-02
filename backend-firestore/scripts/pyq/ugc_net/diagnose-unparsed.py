import pymupdf
import re
import json

doc = pymupdf.open('dataset_staging/ugc_net_cs/raw_pdfs/UGC_NET_CS_2018_July_Paper_II.pdf')
full_text = ""
for page in doc:
    full_text += page.get_text("text") + "\n"

parsed_numbers = set()
# Let's find all questions starting with numbers 1 to 100
for q_num in range(1, 101):
    m = re.search(rf'\n{q_num}\.\s+([\s\S]+?)(?=\n\d{{1,3}}\.\s+|\Z)', full_text)
    if m:
        body = m.group(1).strip()
        # check options
        has_opts = False
        if re.search(r'\([1-4A-D]\)', body):
            has_opts = True
        else:
            print(f"Q{q_num} missing options marker. Snippet: {body[:150]}")
    else:
        print(f"Q{q_num} pattern not found in text.")
