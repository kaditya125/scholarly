import requests

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://api.github.com/search/repositories?q=ugc+net+computer+science+pyq', headers=headers, timeout=10)
if r.status_code == 200:
    data = r.json()
    print(f"Found {data.get('total_count', 0)} GitHub repos for 'ugc net computer science pyq':")
    for item in data.get('items', [])[:10]:
        print(f"  {item.get('full_name')} - {item.get('description')} ({item.get('html_url')})")
else:
    print(f"GitHub search status: {r.status_code}")
