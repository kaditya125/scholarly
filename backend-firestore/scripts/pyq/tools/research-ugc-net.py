import requests
import json
import os
import hashlib

def test_sources():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    urls = [
        'https://nta.ac.in/Downloads',
        'https://ugcnet.nta.nic.in',
        'https://ugcnetonline.in/syllabus-new.php',
        'https://www.ugcnetonline.in/previous_question_papers.php',
    ]
    for url in urls:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            print(f"URL: {url} => Status: {r.status_code}, Length: {len(r.text)}")
        except Exception as e:
            print(f"URL: {url} => Error: {e}")

if __name__ == '__main__':
    test_sources()
