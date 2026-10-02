import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
for p in ['question_papers_nov2017.php', 'question_papers_dec2014.php', 'question_papers_december2012.php']:
    url = f'https://www.ugcnetonline.in/{p}'
    r = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(r.text, 'html.parser')
    for a in soup.find_all('a'):
        txt = a.get_text().strip()
        href = a.get('href', '')
        if '87' in href or '87' in txt or 'computer' in txt.lower() or 'ans' in href.lower() or 'key' in href.lower():
            print(f"[{p}] {txt} => {href}")
