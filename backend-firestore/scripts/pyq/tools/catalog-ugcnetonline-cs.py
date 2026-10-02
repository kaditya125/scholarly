import requests
from bs4 import BeautifulSoup
import json
import os
import re

headers = {'User-Agent': 'Mozilla/5.0'}
base_url = 'https://www.ugcnetonline.in/'

pages = [
    ('2018', 'July', 'question_papers_july2018.php'),
    ('2017', 'November', 'question_papers_nov2017.php'),
    ('2017', 'January', 'question_papers_jan2017.php'),
    ('2016', 'July', 'question_papers_July 2016.php'),
    ('2015', 'December', 'question_papers_dec2015.php'),
    ('2015', 'June', 'question_papers_june2015.php'),
    ('2014', 'December', 'question_papers_dec2014.php'),
    ('2014', 'June', 'question_papers_june2014.php'),
    ('2013', 'December', 'question_papers_december2013.php'),
    ('2013', 'June', 'question_papers_june2013.php'),
    ('2012', 'December', 'question_papers_december2012.php'),
    ('2012', 'June', 'question_papers_june2012.php'),
    ('2011', 'December', 'question_papers_dec2011.php'),
    ('2011', 'June', 'question_papers_june2011.php'),
    ('2010', 'December', 'question_papers_dec2010.php'),
    ('2010', 'June', 'question_papers_june2010.php'),
    ('2009', 'December', 'question_papers_dec2009.php'),
    ('2009', 'June', 'question_papers_june2009.php'),
]

registry = []

for year, session, rel_page in pages:
    url = base_url + rel_page
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200:
            print(f"Failed {year} {session}: status {r.status_code}")
            continue
        soup = BeautifulSoup(r.text, 'html.parser')
        
        for row in soup.find_all('tr'):
            cols = [c.get_text().strip() for c in row.find_all(['td', 'th'])]
            if len(cols) >= 2:
                # Check for 87 or Computer Science
                is_cs = False
                for c in cols:
                    if c == '87' or c == '087':
                        is_cs = True
                    elif 'computer science' in c.lower() and ('application' in c.lower() or len(cols) < 5):
                        is_cs = True
                
                if is_cs:
                    links = []
                    for a in row.find_all('a'):
                        href = a.get('href', '')
                        text = a.get_text().strip()
                        if 'showPdf.php?p1=' in href:
                            pdf_rel = href.split('showPdf.php?p1=')[-1]
                            pdf_url = base_url + pdf_rel.replace(' ', '%20')
                            links.append({
                                'label': text or 'Download',
                                'url': pdf_url,
                                'rawHref': href,
                                'path': pdf_rel
                            })
                        elif href.endswith('.pdf'):
                            pdf_url = href if href.startswith('http') else base_url + href.replace(' ', '%20')
                            links.append({
                                'label': text or 'Download',
                                'url': pdf_url,
                                'rawHref': href,
                                'path': href
                            })
                    
                    if links:
                        print(f"[{year} {session}] Found CS 87 row with {len(links)} links:")
                        for l in links:
                            print(f"   -> {l['label']}: {l['path']}")
                        registry.append({
                            'year': int(year),
                            'session': session,
                            'exam': 'UGC NET',
                            'subject': 'Computer Science and Applications',
                            'subjectCode': '87',
                            'pageUrl': url,
                            'rowText': " | ".join(cols),
                            'links': links
                        })
    except Exception as e:
        print(f"Error on {year} {session}: {e}")

out_path = 'scripts/pyq/tools/ugcnet_official_catalog.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(registry, f, indent=2)

print(f"\nTotal sessions cataloged: {len(registry)}")
