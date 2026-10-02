import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
for site in ['https://ugcnet.nta.ac.in', 'https://ugcnet.nta.nic.in']:
    try:
        r = requests.get(site, headers=headers, timeout=10)
        print(f"{site} => Status: {r.status_code}, Length: {len(r.text)}")
        soup = BeautifulSoup(r.text, 'html.parser')
        links = []
        for a in soup.find_all('a'):
            href = a.get('href', '')
            txt = a.get_text().strip()
            if any(k in txt.lower() or k in href.lower() for k in ['question', 'paper', 'answer', 'key', 'computer']):
                links.append((txt, href))
        print(f"  Found {len(links)} matching links on {site}:")
        for t, h in links[:10]:
            print(f"    {t} => {h}")
    except Exception as e:
        print(f"{site} => Error: {e}")
