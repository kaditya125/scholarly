import json
import os
import hashlib
import requests
import time

MANIFEST_IN = 'scripts/pyq/tools/ugcnet_cs_official_papers_manifest.json'
DEST_DIR = 'dataset_staging/ugc_net_cs/raw_pdfs'
VERIFIED_MANIFEST_OUT = 'dataset_staging/ugc_net_cs/verified_papers_manifest.json'

os.makedirs(DEST_DIR, exist_ok=True)

with open(MANIFEST_IN, 'r', encoding='utf-8') as f:
    papers = json.load(f)

print(f"Total papers to download & verify: {len(papers)}")
headers = {'User-Agent': 'Mozilla/5.0'}

verified_records = []

for idx, p in enumerate(papers):
    year = p['year']
    session = p['session']
    url = p['pdfUrl']
    path_lower = p['path'].lower()
    
    # Precise paper determination
    if any(x in path_lower for x in ['paper%20iii', 'paper iii', 'paper-iii', '-3.pdf', '-iii.pdf', 'paper_iii', 'paper 3', 'pdf3', 'p-iii']):
        paper_type = 'Paper III'
    elif any(x in path_lower for x in ['paper%20ii', 'paper ii', 'paper-ii', '-2.pdf', '-ii.pdf', 'paper_ii', 'paper 2', 'pdf2', 'p-ii']):
        paper_type = 'Paper II'
    else:
        paper_type = p['paper']

    clean_session = session.replace(' ', '_')
    clean_paper = paper_type.replace(' ', '_')
    filename = f"UGC_NET_CS_{year}_{clean_session}_{clean_paper}.pdf"
    filepath = os.path.join(DEST_DIR, filename)
    
    print(f"[{idx+1}/{len(papers)}] {filename} ... ", end='', flush=True)
    
    content = None
    if os.path.exists(filepath) and os.path.getsize(filepath) > 5000:
        with open(filepath, 'rb') as f:
            content = f.read()
        sha256 = hashlib.sha256(content).hexdigest()
        print(f"cached ({len(content)} bytes, sha: {sha256[:8]})")
    else:
        try:
            r = requests.get(url, headers=headers, timeout=25)
            if r.status_code == 200 and r.content[:4] == b'%PDF':
                content = r.content
                sha256 = hashlib.sha256(content).hexdigest()
                with open(filepath, 'wb') as f:
                    f.write(content)
                print(f"SUCCESS ({len(content)} bytes, sha: {sha256[:8]})")
            else:
                print(f"FAILED (status: {r.status_code}, length: {len(r.content)})")
                continue
        except Exception as e:
            print(f"ERROR ({e})")
            continue
        time.sleep(0.3)

    canonical_paper_id = f"ugc_net:cs_87:{year}:{session.lower()}:{clean_paper.lower()}"
    verified_records.append({
        'canonicalPaperId': canonical_paper_id,
        'examId': 'UGC_NET',
        'examName': 'University Grants Commission National Eligibility Test',
        'subject': 'Computer Science and Applications',
        'subjectCode': '87',
        'year': year,
        'session': session,
        'paper': paper_type,
        'sourceTier': 'TIER_A_OFFICIAL',
        'sourceName': 'UGC NET Official Archive (ugcnetonline.in)',
        'sourceUrl': url,
        'pageUrl': p['pageUrl'],
        'localPath': filepath.replace('\\', '/'),
        'documentHash': sha256,
        'documentSize': len(content),
        'authority': 'University Grants Commission (UGC) / CBSE',
        'retrievedAt': int(time.time() * 1000)
    })

with open(VERIFIED_MANIFEST_OUT, 'w', encoding='utf-8') as f:
    json.dump(verified_records, f, indent=2)

print(f"\n[DONE] Successfully downloaded and verified {len(verified_records)} official papers!")
print(f"Verified manifest saved to: {VERIFIED_MANIFEST_OUT}")
