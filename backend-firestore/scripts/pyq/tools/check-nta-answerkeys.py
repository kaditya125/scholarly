import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
for page in ['https://ugcnet.nta.ac.in/AnswerKey.html', 'https://ugcnet.nta.ac.in/AnswerKey_june2025.html']:
    try:
        r = requests.get(page, headers=headers, timeout=10)
        print(f"Page: {page} => Status: {r.status_code}, Length: {len(r.text)}")
        soup = BeautifulSoup(r.text, 'html.parser')
        for a in soup.find_all('a'):
            txt = a.get_text().strip()
            href = a.get('href', '')
            if 'computer' in txt.lower() or '87' in txt or 'final' in txt.lower() or 'pdf' in href.lower():
                print(f"   {txt} => {href}")
    except Exception as e:
        print(f"Error {page}: {e}")
