import os
import re
import json
import time
import hashlib
import requests

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
BASE_URL = 'https://www.ugcnetonline.in/'
DEST_DIR = 'dataset_staging/ugc_net_commerce/raw_pdfs'
MANIFEST_OUT = 'dataset_staging/ugc_net_commerce/verified_commerce_manifest.json'

os.makedirs(DEST_DIR, exist_ok=True)

with open('scripts/pyq/tools/ugcnetonline_cs_discovered.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

commerce_links = []
seen_urls = set()

for entry in data:
    sess_raw = entry['sessionKey'] # e.g. 2018_july
    parts = sess_raw.split('_')
    year = int(parts[0])
    session = parts[1].capitalize()
    
    for link in entry['links']:
        u = link['url']
        u_low = u.lower()
        if ('008' in u_low or 'commerce' in u_low or '08.' in u_low or '-08-' in u_low or '_08_' in u_low) and u_low.endswith('.pdf'):
            if u not in seen_urls:
                seen_urls.add(u)
                
                # Determine paper
                if any(x in u_low for x in ['paper iii', 'paper-iii', 'paper_iii', '-iii', '-3.pdf', 'pdf3', 'p-iii']):
                    paper = 'Paper III'
                else:
                    paper = 'Paper II'
                    
                # Clean URL
                if 'showPdf.php?p1=' in u:
                    raw_rel = u.split('showPdf.php?p1=')[-1]
                    clean_url = BASE_URL + raw_rel.replace(' ', '%20') if not raw_rel.startswith('http') else raw_rel
                else:
                    clean_url = u.replace(' ', '%20')

                commerce_links.append({
                    'year': year,
                    'session': session,
                    'paper': paper,
                    'url': clean_url,
                    'originalUrl': u
                })

print(f"Total distinct Commerce papers to download & verify: {len(commerce_links)}")

verified_records = []
for idx, item in enumerate(commerce_links):
    year = item['year']
    session = item['session']
    paper = item['paper']
    url = item['url']
    
    clean_session = session.replace(' ', '_')
    clean_paper = paper.replace(' ', '_')
    filename = f"UGC_NET_Commerce_{year}_{clean_session}_{clean_paper}.pdf"
    filepath = os.path.join(DEST_DIR, filename)

    print(f"[{idx+1}/{len(commerce_links)}] {filename} ... ", end='', flush=True)

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

    canonical_paper_id = f"ugc_net:commerce_08:{year}:{session.lower()}:{clean_paper.lower()}"
    verified_records.append({
        'canonicalPaperId': canonical_paper_id,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'Commerce',
        'subjectCode': '08',
        'year': year,
        'session': session,
        'paper': paper,
        'sourceTier': 'TIER_A_OFFICIAL',
        'sourceName': 'UGC NET Official Archive (ugcnetonline.in)',
        'sourceUrl': url,
        'localPath': filepath.replace('\\', '/'),
        'documentHash': sha256,
        'documentSize': len(content),
        'authority': 'University Grants Commission (UGC) / CBSE',
        'retrievedAt': int(time.time() * 1000)
    })

with open(MANIFEST_OUT, 'w', encoding='utf-8') as f:
    json.dump(verified_records, f, indent=2)

print(f"\n[COMPLETE] Verified manifest saved: {MANIFEST_OUT} ({len(verified_records)} papers)", flush=True)
