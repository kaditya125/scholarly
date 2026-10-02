import requests

headers = {'User-Agent': 'Mozilla/5.0'}
r = requests.get('https://api.github.com/repos/lRadha/UGC_CS_Paper_II/contents', headers=headers)
if r.status_code == 200:
    for item in r.json():
        print(f"{item['type']}: {item['name']} ({item['size']} bytes) => {item['html_url']}")
