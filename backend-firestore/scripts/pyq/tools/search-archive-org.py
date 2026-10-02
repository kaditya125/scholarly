import requests

url = 'https://archive.org/advancedsearch.php'
params = {
    'q': 'title:("UGC NET" AND "Computer Science")',
    'fl[]': ['identifier', 'title', 'year', 'publicdate'],
    'sort[]': 'year desc',
    'rows': 20,
    'output': 'json'
}
headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get(url, params=params, headers=headers, timeout=15)
if r.status_code == 200:
    data = r.json()
    docs = data.get('response', {}).get('docs', [])
    print(f"Archive.org found {len(docs)} items:")
    for d in docs:
        print(f"  [{d.get('year', 'N/A')}] {d.get('title')} => https://archive.org/details/{d.get('identifier')}")
else:
    print("Archive.org error:", r.status_code)
