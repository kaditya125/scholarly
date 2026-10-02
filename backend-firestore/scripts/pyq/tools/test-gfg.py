import requests
from bs4 import BeautifulSoup

def test_gfg():
    headers = {'User-Agent': 'Mozilla/5.0'}
    urls = [
        'https://www.geeksforgeeks.org/ugc-net-cs-previous-year-questions/',
        'https://www.geeksforgeeks.org/ugc-net-cs-notes-according-to-syllabus-of-paper-ii/',
        'https://www.sanfoundry.com/ugc-net-computer-science-previous-years-questions-answers/',
    ]
    for url in urls:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            print(f"URL: {url} => Status: {r.status_code}, Length: {len(r.text)}")
        except Exception as e:
            print(f"URL: {url} => Error: {e}")

if __name__ == '__main__':
    test_gfg()
