import requests
from bs4 import BeautifulSoup

headers = {'User-Agent': 'Mozilla/5.0'}
urls = [
    'https://www.ugcnetonline.in/ans_july2018.php',
    'https://www.ugcnetonline.in/answer_key_july2018.php',
    'https://www.ugcnetonline.in/answer_keys.php',
    'https://www.ugcnetonline.in/ans_key.php',
    'https://cbsenet.nic.in',
]
for u in urls:
    try:
        r = requests.get(u, headers=headers, timeout=10)
        print(f"{u} => Status: {r.status_code}")
    except Exception as e:
        print(f"{u} => Error: {e}")
