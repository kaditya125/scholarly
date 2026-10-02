import urllib.request
import urllib.parse
import re

query = 'site:geeksforgeeks.org "UGC NET" "Computer Science" 2024'
url = f'https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        results = re.findall(r'<a class="result__url"[^>]*href="([^"]+)"', html)
        snippets = re.findall(r'<a class="result__snippet"[^>]*>(.*?)</a>', html)
        for u, s in zip(results[:5], snippets[:5]):
            print('URL:', u)
            print('SNIPPET:', re.sub('<[^<]+?>', '', s))
            print()
except Exception as e:
    print('Error:', e)
