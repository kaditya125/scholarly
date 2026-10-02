import json
import re

with open('scripts/pyq/tools/ugcnet_official_catalog.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cs_papers = []

for entry in data:
    year = entry['year']
    session = entry['session']
    page_url = entry['pageUrl']
    for link in entry['links']:
        path = link['path']
        path_lower = path.lower()
        if '087' in path or '87' in path or 'computer' in path_lower:
            if re.search(r'(087|(?<!\d)87(?!\d)|computer)', path_lower):
                # Check Paper III FIRST before Paper II because 'paper ii' is a substring of 'paper iii'
                if any(x in path_lower for x in ['paper%20iii', 'paper iii', 'paper-iii', '-3.pdf', '-iii.pdf', 'paper_iii', 'paper 3', 'paper%203']):
                    paper_name = 'Paper III'
                elif any(x in path_lower for x in ['paper%20ii', 'paper ii', 'paper-ii', '-2.pdf', '-ii.pdf', 'paper_ii', 'paper 2', 'paper%202']):
                    paper_name = 'Paper II'
                else:
                    paper_name = 'Paper'
                
                cs_papers.append({
                    'year': year,
                    'session': session,
                    'paper': paper_name,
                    'label': link['label'],
                    'pdfUrl': link['url'],
                    'path': path,
                    'pageUrl': page_url,
                    'sourceAuthority': 'University Grants Commission (UGC) / CBSE'
                })

# Deduplicate
unique_papers = {}
for p in cs_papers:
    key = f"{p['year']}_{p['session']}_{p['paper']}_{p['path']}"
    unique_papers[key] = p

print(f"Total authentic CS 87 papers extracted: {len(unique_papers)}")
for k, p in sorted(unique_papers.items()):
    print(f"  [{p['year']} {p['session']}] {p['paper']} => {p['path']}")

with open('scripts/pyq/tools/ugcnet_cs_official_papers_manifest.json', 'w', encoding='utf-8') as f:
    json.dump(list(unique_papers.values()), f, indent=2)
print("Saved manifest to scripts/pyq/tools/ugcnet_cs_official_papers_manifest.json")
