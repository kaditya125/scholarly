import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://nta.ac.in/Downloads', headers=headers, timeout=15)
soup = BeautifulSoup(r.text, 'html.parser')

form = soup.find('form')
if form:
    print("Form action:", form.get('action'), "method:", form.get('method'))
    inputs = form.find_all(['input', 'select'])
    for inp in inputs:
        print(" ", inp.name, inp.get('id'), inp.get('name'), inp.get('type'), inp.get('value'))
else:
    print("No form found on nta.ac.in/Downloads")
