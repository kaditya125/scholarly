import os
import re
import json
import time
import hashlib
import requests
from bs4 import BeautifulSoup

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
BASE_URL = 'https://www.ugcnetonline.in/'
DEST_DIR = 'dataset_staging/ugc_net_sociology/raw_pdfs'
MANIFEST_OUT = 'dataset_staging/ugc_net_sociology/verified_sociology_manifest.json'

os.makedirs(DEST_DIR, exist_ok=True)

PAGES = [
    ('2018', 'July', 'question_papers_july2018.php'),
    ('2017', 'November', 'question_papers_nov2017.php'),
    ('2017', 'January', 'question_papers_jan2017.php'),
    ('2016', 'July', 'question_papers_July 2016.php'),
    ('2015', 'December', 'question_papers_dec2015.php'),
    ('2015', 'June', 'question_papers_june2015.php'),
    ('2014', 'December', 'question_papers_dec2014.php'),
    ('2014', 'June', 'question_papers_june2014.php'),
    ('2013', 'December', 'question_papers_december2013.php'),
    ('2013', 'June', 'question_papers_june2013.php'),
    ('2012', 'December', 'question_papers_december2012.php'),
    ('2012', 'June', 'question_papers_june2012.php'),
    ('2011', 'December', 'question_papers_dec2011.php'),
    ('2011', 'June', 'question_papers_june2011.php'),
    ('2010', 'December', 'question_papers_dec2010.php'),
    ('2010', 'June', 'question_papers_june2010.php'),
    ('2009', 'December', 'question_papers_dec2009.php'),
    ('2009', 'June', 'question_papers_june2009.php'),
]

print("Cataloging Sociology (Subject Code 05) across all sessions...", flush=True)
catalog = []

for year, session, rel_page in PAGES:
    url = BASE_URL + rel_page
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            continue
        soup = BeautifulSoup(r.text, 'html.parser')
        for row in soup.find_all('tr'):
            cols = [c.get_text().strip() for c in row.find_all(['td', 'th'])]
            if len(cols) >= 2:
                c0 = cols[0].strip()
                c1 = cols[1].strip()
                if c0 in ['05', '5', '005'] or c1.lower() == 'sociology':
                    for a in row.find_all('a'):
                        href = a.get('href', '')
                        if 'showPdf.php?p1=' in href:
                            raw_path = href.split('showPdf.php?p1=')[-1]
                        elif href.lower().endswith('.pdf'):
                            raw_path = href
                        else:
                            continue
                        
                        path_lower = raw_path.lower()
                        if any(x in path_lower for x in ['paper iii', 'paper-iii', 'paper_iii', '-iii', '-3.pdf', 'pdf3', 'p-iii']):
                            paper = 'Paper III'
                        else:
                            paper = 'Paper II'
                            
                        pdf_url = BASE_URL + raw_path.replace(' ', '%20') if not raw_path.startswith('http') else raw_path
                        catalog.append({
                            'year': int(year),
                            'session': session,
                            'paper': paper,
                            'pdfUrl': pdf_url,
                            'rawPath': raw_path,
                            'pageUrl': url
                        })
    except Exception as e:
        print(f"  Error on {year} {session}: {e}", flush=True)

deduped = []
seen = set()
for item in catalog:
    if item['rawPath'] not in seen:
        seen.add(item['rawPath'])
        deduped.append(item)

print(f"Total authentic Sociology PDF links cataloged: {len(deduped)}", flush=True)

verified_records = []
for idx, item in enumerate(deduped):
    year = item['year']
    session = item['session']
    paper = item['paper']
    url = item['pdfUrl']
    
    clean_session = session.replace(' ', '_')
    clean_paper = paper.replace(' ', '_')
    filename = f"UGC_NET_Sociology_{year}_{clean_session}_{clean_paper}.pdf"
    filepath = os.path.join(DEST_DIR, filename)

    print(f"[{idx+1}/{len(deduped)}] {filename} ... ", end='', flush=True)

    content = None
    if os.path.exists(filepath) and os.path.getsize(filepath) > 5000:
        with open(filepath, 'rb') as f:
            content = f.read()
        sha256 = hashlib.sha256(content).hexdigest()
        print(f"cached ({len(content)} bytes, sha: {sha256[:8]})", flush=True)
    else:
        try:
            r = requests.get(url, headers=HEADERS, timeout=25)
            if r.status_code == 200 and r.content[:4] == b'%PDF':
                content = r.content
                sha256 = hashlib.sha256(content).hexdigest()
                with open(filepath, 'wb') as f:
                    f.write(content)
                print(f"SUCCESS ({len(content)} bytes, sha: {sha256[:8]})", flush=True)
            else:
                print(f"FAILED (status: {r.status_code})", flush=True)
                continue
        except Exception as e:
            print(f"ERROR: {e}", flush=True)
            continue
        time.sleep(0.3)

    canonical_paper_id = f"ugc_net:sociology_05:{year}:{session.lower()}:{clean_paper.lower()}"
    verified_records.append({
        'canonicalPaperId': canonical_paper_id,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'Sociology',
        'subjectCode': '05',
        'year': year,
        'session': session,
        'paper': paper,
        'sourceTier': 'TIER_A_OFFICIAL',
        'sourceName': 'UGC NET Official Archive (ugcnetonline.in)',
        'sourceUrl': url,
        'pageUrl': item['pageUrl'],
        'localPath': filepath.replace('\\', '/'),
        'documentHash': sha256,
        'documentSize': len(content),
        'authority': 'University Grants Commission (UGC) / CBSE',
        'retrievedAt': int(time.time() * 1000)
    })

with open(MANIFEST_OUT, 'w', encoding='utf-8') as f:
    json.dump(verified_records, f, indent=2)

print(f"\n[COMPLETE] Verified manifest saved: {MANIFEST_OUT} ({len(verified_records)} papers)", flush=True)
