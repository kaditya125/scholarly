import requests

headers = {'User-Agent': 'Mozilla/5.0'}
urls = [
    'https://ugcnet.nta.ac.in/images/UGC_JUNE_2024_FINALKEY/087.pdf',
    'https://ugcnet.nta.ac.in/images/UGC_DEC_2023_FINALKEY/087.pdf',
    'https://ugcnet.nta.ac.in/images/UGC_JUNE_2023_FINALKEY/087.pdf',
    'https://ugcnet.nta.ac.in/images/UGC_DEC_2022_FINALKEY/087.pdf',
    'https://ugcnet.nta.ac.in/images/KEY_PDF/087.pdf',
    'https://ugcnet.nta.ac.in/images/KEY_PDF/087.PDF',
]
for u in urls:
    r = requests.head(u, headers=headers, timeout=5)
    print(f"{u} => {r.status_code}")
