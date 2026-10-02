import requests
from bs4 import BeautifulSoup
import re

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://nta.ac.in/Downloads', headers=headers, timeout=15)
soup = BeautifulSoup(r.text, 'html.parser')

scripts = soup.find_all('script')
print(f"Found {len(scripts)} script tags")
for s in scripts:
    src = s.get('src')
    if src:
        print("Script src:", src)
    else:
        txt = s.get_text()
        if any(k in txt.lower() for k in ['paper', 'download', 'ajax', 'post', 'api', 'select', 'exam']):
            print("Inline script match:")
            for line in txt.splitlines():
                if any(k in line.lower() for k in ['url', 'ajax', 'api', 'download', 'post', 'get']):
                    print("  ", line.strip())
