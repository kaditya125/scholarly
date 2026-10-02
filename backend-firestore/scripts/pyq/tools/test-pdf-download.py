import requests
import os

url = 'https://www.ugcnetonline.in/question_papers/July%202018/Paper%20II/08072018/J%2008718%20Paper%20II%20Computer%20Science.pdf'
headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get(url, headers=headers, timeout=20)
print(f"Status: {r.status_code}, Length: {len(r.content)}")
if r.status_code == 200 and r.content[:4] == b'%PDF':
    print("Verified valid PDF")
    os.makedirs('dataset_staging/ugc_net_cs/raw_pdfs', exist_ok=True)
    out_path = 'dataset_staging/ugc_net_cs/raw_pdfs/UGC_NET_CS_2018_July_Paper2.pdf'
    with open(out_path, 'wb') as f:
        f.write(r.content)
    print(f"Saved to {out_path}")
else:
    print("Header:", r.content[:50])
