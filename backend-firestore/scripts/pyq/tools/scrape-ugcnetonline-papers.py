import requests
from bs4 import BeautifulSoup
import json
import os
import sys

headers = {'User-Agent': 'Mozilla/5.0'}
base_url = 'https://www.ugcnetonline.in/'

pages = [
    ('2018_july', 'question_papers_july2018.php'),
    ('2017_nov', 'question_papers_nov2017.php'),
    ('2017_jan', 'question_papers_jan2017.php'),
    ('2016_july', 'question_papers_July 2016.php'),
    ('2015_dec', 'question_papers_dec2015.php'),
    ('2015_june', 'question_papers_june2015.php'),
    ('2014_dec', 'question_papers_dec2014.php'),
    ('2014_june', 'question_papers_june2014.php'),
    ('2013_dec', 'question_papers_december2013.php'),
    ('2013_june', 'question_papers_june2013.php'),
    ('2012_dec', 'question_papers_december2012.php'),
    ('2012_june', 'question_papers_june2012.php'),
    ('2011_dec', 'question_papers_dec2011.php'),
    ('2011_june', 'question_papers_june2011.php'),
    ('2010_dec', 'question_papers_dec2010.php'),
    ('2010_june', 'question_papers_june2010.php'),
    ('2009_dec', 'question_papers_dec2009.php'),
    ('2009_june', 'question_papers_june2009.php'),
]

discovered = []

for session_key, rel_page in pages:
    url = base_url + rel_page
    try:
        r = requests.get(url, headers=headers, timeout=12)
        if r.status_code != 200:
            print(f"Failed {session_key}: status {r.status_code}", flush=True)
            continue
        soup = BeautifulSoup(r.text, 'html.parser')
        rows = soup.find_all('tr')
        found_for_session = 0
        for row in rows:
            text = row.get_text()
            if 'computer' in text.lower() or '87' in text:
                links = []
                for a in row.find_all('a'):
                    href = a.get('href', '')
                    if href:
                        if not href.startswith('http'):
                            href = base_url + href
                        links.append({'text': a.get_text().strip(), 'url': href})
                if links:
                    discovered.append({
                        'sessionKey': session_key,
                        'pageUrl': url,
                        'rowText': ' '.join(text.split()),
                        'links': links
                    })
                    found_for_session += len(links)
        print(f"Session {session_key}: found {found_for_session} paper links", flush=True)
    except Exception as e:
        print(f"Error on {session_key}: {e}", flush=True)

out_file = 'scripts/pyq/tools/ugcnetonline_cs_discovered.json'
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(discovered, f, indent=2)

print(f"\nSaved {len(discovered)} entries to {out_file}", flush=True)
