import requests
from bs4 import BeautifulSoup
import re

def parse_nta_downloads():
    headers = {'User-Agent': 'Mozilla/5.0'}
    r = requests.get('https://nta.ac.in/Downloads', headers=headers, timeout=15)
    soup = BeautifulSoup(r.text, 'html.parser')
    
    # Check form options for exam dropdown
    selects = soup.find_all('select')
    print(f"Found {len(selects)} select elements on nta.ac.in/Downloads:")
    for sel in selects:
        name = sel.get('name', sel.get('id', 'unnamed'))
        options = [(opt.get('value', ''), opt.get_text().strip()) for opt in sel.find_all('option')]
        print(f"  Select: {name}, options count: {len(options)}")
        for val, text in options:
            if 'ugc' in text.lower() or 'net' in text.lower() or 'computer' in text.lower():
                print(f"    Match: {val} => {text}")

if __name__ == '__main__':
    parse_nta_downloads()
