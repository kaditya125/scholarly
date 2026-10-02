import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
url = 'https://www.geeksforgeeks.org/ugc-net-cs-notes-according-to-syllabus-of-paper-ii/'
try:
    r = requests.get(url, headers=headers, timeout=12)
    soup = BeautifulSoup(r.text, 'html.parser')
    print("GFG Title:", soup.title.string if soup.title else 'None')
    links = []
    for a in soup.find_all('a'):
        txt = a.get_text().strip()
        href = a.get('href', '')
        if 'ugc-net' in href or 'ugc' in txt.lower():
            links.append((txt, href))
    print(f"Found {len(links)} UGC NET links on GFG:")
    for t, h in links[:15]:
        print(f"  {t} => {h}")
except Exception as e:
    print("Error:", e)
