import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://www.ugcnetonline.in/question_papers_july2018.php', headers=headers, timeout=15)
soup = BeautifulSoup(r.text, 'html.parser')

for row in soup.find_all('tr'):
    cols = [c.get_text().strip() for c in row.find_all(['td', 'th'])]
    if len(cols) >= 2:
        # Check if subject code 87 or Computer Science
        row_str = " | ".join(cols)
        if '87' in cols or any('computer' in c.lower() for c in cols):
            print(f"Matched row: {row_str}")
            for a in row.find_all('a'):
                print(f"   Link: {a.get_text().strip()} => {a.get('href')}")
