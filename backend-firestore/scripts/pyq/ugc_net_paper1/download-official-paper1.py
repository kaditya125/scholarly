import os
import re
import json
import time
import hashlib
import requests
from bs4 import BeautifulSoup
import sys

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
BASE_URL = 'https://www.ugcnetonline.in/'
DEST_DIR = 'dataset_staging/ugc_net_paper1/raw_pdfs'
MANIFEST_OUT = 'dataset_staging/ugc_net_paper1/verified_paper1_manifest.json'

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

def run():
    print("Cataloging Paper 1 links from UGC NET archive...", flush=True)
    catalog = []
    
    for year, session, rel_page in PAGES:
        page_url = BASE_URL + rel_page
        try:
            r = requests.get(page_url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                print(f"  [WARN] Failed {year} {session}: status {r.status_code}", flush=True)
                continue
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Direct link search
            session_links = []
            for a in soup.find_all('a'):
                href = a.get('href', '')
                text = a.get_text().strip()
                if 'showPdf.php?p1=' in href:
                    raw_path = href.split('showPdf.php?p1=')[-1]
                elif href.lower().endswith('.pdf'):
                    raw_path = href
                else:
                    continue
                
                raw_lower = raw_path.lower()
                # Determine if Paper 1
                is_p1 = False
                if any(x in raw_lower for x in ['paper i/', 'paper-i', 'paper%20i/', 'paper_i', 'paper i ', '0001', 'p-i.', '00.', '00-']):
                    is_p1 = True
                elif ('paper i' in text.lower() or 'paper 1' in text.lower() or 'paper-1' in text.lower()):
                    is_p1 = True
                    
                if any(x in raw_lower for x in ['paper ii/', 'paper iii', 'paper-ii', 'paper-iii', 'paper%20ii', 'paper%20iii', 'paper_ii', 'paper_iii']):
                    is_p1 = False
                    
                if is_p1:
                    pdf_url = BASE_URL + raw_path.replace(' ', '%20') if not raw_path.startswith('http') else raw_path
                    session_links.append({
                        'year': int(year),
                        'session': session,
                        'paper': 'Paper I',
                        'label': text or 'Download',
                        'pdfUrl': pdf_url,
                        'rawPath': raw_path,
                        'pageUrl': page_url
                    })
                    
            print(f"  {year} {session}: found {len(session_links)} Paper I links", flush=True)
            catalog.extend(session_links)
        except Exception as e:
            print(f"  [ERROR] {year} {session}: {e}", flush=True)
            
    # Deduplicate
    deduped = []
    seen = set()
    for item in catalog:
        if item['rawPath'] not in seen:
            seen.add(item['rawPath'])
            deduped.append(item)
            
    print(f"\nTotal distinct authentic Paper 1 PDF links cataloged: {len(deduped)}", flush=True)
    
    verified_records = []
    session_counts = {}
    
    for idx, item in enumerate(deduped):
        year = item['year']
        session = item['session']
        url = item['pdfUrl']
        raw_path = item['rawPath']
        
        set_match = re.search(r'set[-_ ]*([a-z0-9]+)', raw_path, re.IGNORECASE)
        set_name = f"Set_{set_match.group(1).upper()}" if set_match else "Set_Main"
        
        sess_key = f"{year}_{session}"
        session_counts[sess_key] = session_counts.get(sess_key, 0) + 1
        
        clean_session = session.replace(' ', '_')
        filename = f"UGC_NET_P1_{year}_{clean_session}_{set_name}_{session_counts[sess_key]}.pdf"
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
            
        canonical_paper_id = f"ugc_net:general_00:{year}:{session.lower()}:paper_i:{set_name.lower()}_{session_counts[sess_key]}"
        verified_records.append({
            'canonicalPaperId': canonical_paper_id,
            'examId': 'UGC_NET',
            'examName': 'University Grants Commission National Eligibility Test',
            'subject': 'General Paper on Teaching & Research Aptitude',
            'subjectCode': '00',
            'year': year,
            'session': session,
            'paper': 'Paper I',
            'setName': set_name,
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

if __name__ == '__main__':
    run()
