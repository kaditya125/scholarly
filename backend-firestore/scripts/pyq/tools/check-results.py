import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://www.ugcnetonline.in/results.php', headers=headers, timeout=15)
soup = BeautifulSoup(r.text, 'html.parser')

print("--- RESULTS.PHP LINKS ---")
for a in soup.find_all('a'):
    text = a.get_text().strip()
    href = a.get('href', '')
    if any(k in text.lower() or k in href.lower() for k in ['answer', 'key', 'computer', '87', 'cut']):
        print(f"  {text} => {href}")
