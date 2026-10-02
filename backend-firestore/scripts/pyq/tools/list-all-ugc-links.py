import requests
from bs4 import BeautifulSoup
import re

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://www.ugcnetonline.in/previous_question_papers.php', headers=headers, timeout=10)
soup = BeautifulSoup(r.text, 'html.parser')

all_links = set()
for a in soup.find_all('a'):
    href = a.get('href')
    if href:
        all_links.add(href)

print("Links on previous_question_papers.php:")
for l in sorted(all_links):
    print(" ", l)
