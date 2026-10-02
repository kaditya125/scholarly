import glob
import json
import requests
import uuid

NS_SADHYA = uuid.uuid5(uuid.NAMESPACE_URL, 'sadhya.app/vector-store')

def to_qdrant_id(namespace, pinecone_id):
    return str(uuid.uuid5(NS_SADHYA, f'{namespace}:{pinecone_id}'))

QDRANT_URL = 'http://127.0.0.1:6333'
HEADERS = {'api-key': 'EakDRYZLN8wqGpgioI8voBvkDFaIFlctsfRR6Xfv'}
COLLECTION = 'edtech_ai_rag'
NAMESPACE = 'production'

cache_files = glob.glob('dataset_staging/**/**embedding_cache.json', recursive=True)
print(f'Found {len(cache_files)} cache files.')

# Load questions from extracted json files to get metadata
pool_files = glob.glob('dataset_staging/**/**all_extracted_pyqs.json', recursive=True)
all_questions = {}
for pf in pool_files:
    try:
        with open(pf, 'r', encoding='utf-8') as f:
            qs = json.load(f)
            for q in qs:
                clean_paper = q['paper'].replace(' ', '_').lower()
                clean_subj = q['subject'].replace(' ', '_').lower()
                sc = q.get('subjectCode', '')
                yr = q.get('year', '')
                ss = str(q.get('session', '')).lower()
                qn = str(q.get('questionNumber', 1)).zfill(2)
                qid = f'ugc_net_{clean_subj}_{sc}_{yr}_{ss}_{clean_paper}_q{qn}'
                all_questions[qid] = q
                if 'canonicalQuestionId' in q:
                    all_questions[q['canonicalQuestionId']] = q
    except Exception as e:
        print('Error loading', pf, e)

print(f'Loaded {len(all_questions)} metadata records from staging pools.')

total_synced = 0
for cf in cache_files:
    with open(cf, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    
    points_to_upsert = []
    for qId, values in cache.items():
        if not values or len(values) != 768:
            continue
        
        vector_id = f'vec_{qId}'
        qdrant_pt_id = to_qdrant_id(NAMESPACE, vector_id)
        
        q_meta = all_questions.get(qId, {})
        
        payload = {
            'pinecone_id': vector_id,
            'pinecone_namespace': NAMESPACE,
            'questionId': qId,
            'examId': 'UGC_NET',
            'subject': q_meta.get('subject', 'UGC NET Subject'),
            'subjectCode': str(q_meta.get('subjectCode', '')),
            'unitNumber': q_meta.get('unitNumber', 1),
            'unitName': q_meta.get('unitName', ''),
            'year': q_meta.get('year', 2018),
            'session': q_meta.get('session', ''),
            'paper': q_meta.get('paper', ''),
            'questionNumber': q_meta.get('questionNumber', 1),
            'content_type': 'pyq',
            'corpusBucket': 'OFFICIAL_PYQ',
            'isAuthenticPYQ': True,
            'public': True,
            'text': q_meta.get('text', ''),
            'options': q_meta.get('options', [])
        }
        
        points_to_upsert.append({
            'id': qdrant_pt_id,
            'vector': values,
            'payload': payload
        })
    
    if points_to_upsert:
        res = requests.put(
            f'{QDRANT_URL}/collections/{COLLECTION}/points',
            json={'points': points_to_upsert},
            headers=HEADERS
        )
        if res.status_code == 200:
            print(f'  [SUCCESS] Upserted {len(points_to_upsert)} points from {cf} to Qdrant.')
            total_synced += len(points_to_upsert)
        else:
            print(f'  [FAILED] {cf}: {res.status_code} {res.text}')

print(f'\nTotal benchmark vectors synchronized to Qdrant: {total_synced}')
