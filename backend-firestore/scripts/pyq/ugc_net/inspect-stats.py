import json

with open('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json', 'r', encoding='utf-8') as f:
    qs = json.load(f)

print(f"Total extracted questions: {len(qs)}")
units = {}
types = {}
years = {}

for q in qs:
    u = f"Unit {q['unitNumber']}: {q['unitTitle']}"
    units[u] = units.get(u, 0) + 1
    t = q.get('questionType', 'conceptual')
    types[t] = types.get(t, 0) + 1
    y = q.get('year', 'unknown')
    years[y] = years.get(y, 0) + 1

print("\nUnit Distribution:")
for u, c in sorted(units.items(), key=lambda x: -x[1]):
    print(f"  {u.ljust(50)}: {c} ({c*100/len(qs):.1f}%)")

print("\nQuestion Type Distribution:")
for t, c in sorted(types.items(), key=lambda x: -x[1]):
    print(f"  {t.ljust(20)}: {c} ({c*100/len(qs):.1f}%)")

print("\nYear Distribution:")
for y, c in sorted(years.items()):
    print(f"  {y}: {c} questions")
