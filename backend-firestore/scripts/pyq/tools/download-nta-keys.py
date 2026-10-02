import requests
import os

keys = [
    ('NTA_UGC_NET_CS_2024_DEC_KEY', 'https://ugcnet.nta.ac.in/images/KEY_PDF/087.PDF'),
    ('NTA_UGC_NET_CS_2025_JUNE_KEY', 'https://ugcnet.nta.ac.in/images/UGC_JUNE_2025_FINALKEY/087.pdf'),
]

headers = {'User-Agent': 'Mozilla/5.0'}
os.makedirs('dataset_staging/ugc_net_cs/keys', exist_ok=True)

for name, url in keys:
    try:
        r = requests.get(url, headers=headers, timeout=15)
        print(f"{name} ({url}) => Status: {r.status_code}, Length: {len(r.content)}")
        if r.status_code == 200:
            dest = f'dataset_staging/ugc_net_cs/keys/{name}.pdf'
            with open(dest, 'wb') as f:
                f.write(r.content)
            print(f"  Saved to {dest}")
    except Exception as e:
        print(f"Error {name}: {e}")
