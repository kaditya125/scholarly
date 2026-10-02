import pymupdf
import re
import json
import os
import hashlib
import time

VERIFIED_MANIFEST_IN = 'dataset_staging/ugc_net_cs/verified_papers_manifest.json'
OUT_DIR = 'dataset_staging/ugc_net_cs/extracted'
os.makedirs(OUT_DIR, exist_ok=True)

# 10-Unit Taxonomy Classifier keywords
TAXONOMY_KEYWORDS = {
    1: ('Discrete Structures and Optimization', [
        'propositional logic', 'predicate', 'tautology', 'quantifier', 'equivalence relation',
        'partial order', 'lattice', 'group', 'monoid', 'semigroup', 'isomorphism',
        'pigeonhole', 'recurrence relation', 'generating function', 'eulerian',
        'hamiltonian', 'chromatic', 'planar graph', 'bipartite', 'simplex', 'linear programming',
        'lpp', 'dual', 'slack variable', 'transportation problem', 'assignment problem',
        'boolean algebra', 'poset', 'hasse diagram', 'discrete'
    ]),
    2: ('Computer System Architecture', [
        'k-map', 'multiplexer', 'decoder', 'flip-flop', 'counter', 'alu', 'instruction format',
        'addressing mode', 'microoperation', 'control unit', 'hardwired', 'microprogrammed',
        'pipelining', 'hazard', 'speedup', 'branch prediction', 'cache memory', 'cache hit',
        'cache miss', 'direct mapping', 'associative mapping', 'set-associative', 'virtual memory',
        'page table', 'tlb', 'dma', 'interrupt', 'bus arbitration', 'simd', 'mimd',
        'little endian', 'big endian', 'ieee 754', 'floating point', 'registers', 'architecture'
    ]),
    3: ('Programming Languages and Computer Graphics', [
        'c++', 'java', 'inheritance', 'polymorphism', 'encapsulation', 'virtual function',
        'overloading', 'constructor', 'destructor', 'static scoping', 'dynamic scoping',
        'activation record', 'xml', 'dtd', 'javascript', 'html', 'css', 'servlet',
        'bresenham', 'dda', 'midpoint circle', 'cohen sutherland', 'clipping',
        'transformation matrix', 'rotation', 'scaling', 'translation', 'bezier curve',
        'projection', 'hidden surface', 'z-buffer', 'raster scan', 'graphics', 'windowing'
    ]),
    4: ('Database Management Systems', [
        'er diagram', 'relational algebra', 'tuple relational calculus', 'sql', 'foreign key',
        'primary key', 'candidate key', 'functional dependency', 'bcnf', '3nf', '2nf',
        'lossless join', 'dependency preserving', 'minimal cover', 'serializability',
        'conflict serializable', 'two phase locking', '2pl', 'acid', 'transaction',
        'deadlock prevention', 'checkpoint', 'write-ahead logging', 'b-tree', 'b+ tree',
        'nosql', 'mongodb', 'cap theorem', 'view serializable', 'database', 'rdbms'
    ]),
    5: ('System Software and Operating Systems', [
        'assembler', 'linker', 'loader', 'relocation', 'macro processor', 'system call',
        'process control block', 'pcb', 'thread', 'cpu scheduling', 'round robin', 'sjf',
        'turnaround time', 'waiting time', 'semaphore', 'mutex', 'critical section',
        'peterson', 'deadlock', 'banker algorithm', 'resource allocation graph', 'safe state',
        'paging', 'segmentation', 'page fault', 'belady anomaly', 'lru', 'optimal page replacement',
        'thrashing', 'disk scheduling', 'c-scan', 'sstf', 'inode', 'fork', 'operating system'
    ]),
    6: ('Software Engineering', [
        'agile', 'scrum', 'waterfall', 'spiral model', 'rad', 'srs', 'use case', 'dfd',
        'coupling', 'cohesion', 'cyclomatic complexity', 'basis path testing', 'cocomo',
        'function point', 'black box', 'white box', 'boundary value analysis',
        'equivalence partitioning', 'regression testing', 'pert', 'cpm', 'critical path',
        'cmm', 'iso 9000', 'software risk', 'cleanroom', 'software engineering', 'metrics'
    ]),
    7: ('Data Structures and Algorithms', [
        'array', 'stack', 'queue', 'linked list', 'binary search tree', 'bst', 'avl tree',
        'red-black tree', 'heap', 'hashing', 'hash table', 'asymptotic notation',
        'big-o', 'master theorem', 'quicksort', 'mergesort', 'dijkstra', 'bellman-ford',
        'floyd-warshall', 'kruskal', 'prim', 'knapsack', 'longest common subsequence', 'lcs',
        'matrix chain multiplication', 'travelling salesman', 'np-complete', 'np-hard',
        'satisfiability', 'clique', 'vertex cover', 'data structures', 'algorithms'
    ]),
    8: ('Theory of Computation and Compilers', [
        'dfa', 'nfa', 'regular expression', 'pumping lemma', 'pda', 'pushdown automata',
        'context free grammar', 'cfg', 'chomsky normal form', 'cnf', 'greibach', 'gnf',
        'turing machine', 'decidability', 'undecidable', 'halting problem', 'post correspondence',
        'compiler', 'lexical analyzer', 'yacc', 'parser', 'll(1)', 'lr(0)', 'slr(1)', 'lr(1)',
        'lalr', 'three address code', 'dag', 'live variable', 'register allocation', 'grammar'
    ]),
    9: ('Data Communication and Computer Networks', [
        'osi model', 'tcp/ip', 'framing', 'crc', 'hamming code', 'flow control', 'sliding window',
        'stop and wait', 'go-back-n', 'selective repeat', 'csma/cd', 'csma/ca', 'ethernet',
        'ipv4', 'ipv6', 'subnetting', 'cidr', 'router', 'routing', 'dijkstra routing',
        'distance vector', 'link state', 'ospf', 'bgp', 'rip', 'tcp', 'udp', 'congestion window',
        'three-way handshake', 'dns', 'http', 'ftp', 'smtp', 'dhcp', 'rsa', 'aes', 'des',
        'diffie-hellman', 'public key', 'firewall', 'ipsec', 'computer networks'
    ]),
    10: ('Artificial Intelligence', [
        'a* search', 'ao* search', 'heuristic search', 'bfs', 'dfs', 'minimax', 'alpha-beta pruning',
        'knowledge representation', 'resolution refutation', 'unification', 'first order logic',
        'fuzzy logic', 'fuzzy set', 'membership function', 'defuzzification', 'genetic algorithm',
        'crossover', 'mutation', 'artificial neural network', 'ann', 'perceptron', 'backpropagation',
        'expert system', 'nlp', 'parsing', 'expert system shell', 'artificial intelligence'
    ]),
}

def classify_text(text):
    lower = text.lower()
    best_unit = 1
    best_score = 0
    for u_num, (title, kws) in TAXONOMY_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best_score = score
            best_unit = u_num
    return best_unit, TAXONOMY_KEYWORDS[best_unit][0]

def extract_questions_from_pdf(pdf_path, paper_meta):
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    # Skip cover/instruction page (page 0) if more than 1 page
    start_page = 1 if total_pages > 1 else 0
    full_text = ""
    for page_idx in range(start_page, total_pages):
        page = doc[page_idx]
        t = page.get_text("text")
        # Check if page is rough work
        if "space for rough work" in t.lower() and len(t) < 300:
            continue
        full_text += f"\n--- PAGE {page_idx + 1} ---\n" + t

    # Clean header artifacts
    lines = full_text.splitlines()
    cleaned = []
    for line in lines:
        l = line.strip()
        # Drop standalone page numbers
        if re.match(r'^\d{1,3}$', l):
            continue
        # Drop booklet markings
        if re.search(r'(!J-087|!D-87|!N-087|Paper-II|Paper-III|Paper - II|Paper - III|COMPUTER SCIENCE|Signature and Name)', l, re.I):
            continue
        cleaned.append(line)
    
    body_text = "\n".join(cleaned)
    
    # Split by question numbers: 1. 2. 3. ...
    # Look for \n<num>. with optional spaces
    q_chunks = re.split(r'\n(?=\d{1,3}\.\s+)', body_text)
    
    extracted = []
    for chunk in q_chunks:
        chunk = chunk.strip()
        m = re.match(r'^(\d{1,3})\.\s*([\s\S]+)', chunk)
        if not m:
            continue
        q_num = int(m.group(1))
        content = m.group(2).strip()
        
        # Stop if we hit Instructions or Roll No
        if "instructions for the candidates" in content.lower():
            continue
            
        # Parse options
        # Case A: (1) ... (2) ... (3) ... (4) ...
        # Case B: (A) ... (B) ... (C) ... (D) ...
        # Case C: (a) ... (b) ... (c) ... (d) ...
        opt_matches = list(re.finditer(r'\n\s*(\([1-4A-Da-d]\))\s*', content))
        
        if len(opt_matches) >= 4:
            # Use last 4 option matches
            target_matches = opt_matches[-4:]
            q_text = content[:target_matches[0].start()].strip()
            
            options = []
            for i in range(4):
                start = target_matches[i].end()
                end = target_matches[i+1].start() if i < 3 else len(content)
                opt_str = content[start:end].strip().replace('\n', ' ')
                opt_str = re.sub(r'\s+', ' ', opt_str)
                options.append(opt_str)
            
            # Content hash
            sorted_opts = "|".join(sorted(options))
            content_hash = hashlib.sha256(f"UGC_NET_CS::{q_text}::{sorted_opts}".encode('utf-8')).hexdigest()
            content_hash_8 = content_hash[:8]
            
            # Classify topic
            unit_num, unit_title = classify_text(f"{q_text} {' '.join(options)}")
            
            # Detect question type
            q_type = 'conceptual'
            q_lower = q_text.lower()
            if any(k in q_lower for k in ['consider the following', 'which of the following statement']):
                q_type = 'statement_based'
            elif any(k in q_lower for k in ['match the following', 'list - i', 'list-i', 'list i']):
                q_type = 'matching'
            elif any(k in q_lower for k in ['output of the following', 'what will be the output', 'class ', 'void main', 'public static']):
                q_type = 'code_analysis'
            elif any(k in q_lower for k in ['calculate', 'how many', 'number of', 'what is the value']):
                q_type = 'numerical'
            
            # Canonical Question ID
            # pyq:ugc_net:cs_87:{year}:{session}:{paper}:{qNum}:{contentHash8}
            clean_sess = paper_meta['session'].lower().replace(' ', '_')
            clean_pap = paper_meta['paper'].lower().replace(' ', '_')
            canonical_q_id = f"pyq:ugc_net:cs_87:{paper_meta['year']}:{clean_sess}:{clean_pap}:{q_num}:{content_hash_8}"
            
            marks = 2.0
            negative_marks = 0.0 # UGC NET has no negative marking
            
            extracted.append({
                'questionId': canonical_q_id,
                'canonicalPaperId': paper_meta['canonicalPaperId'],
                'examId': 'UGC_NET',
                'examName': 'University Grants Commission National Eligibility Test',
                'year': paper_meta['year'],
                'session': paper_meta['session'],
                'paper': paper_meta['paper'],
                'subject': 'Computer Science and Applications',
                'subjectCode': '87',
                'unitNumber': unit_num,
                'unitTitle': unit_title,
                'questionNumber': q_num,
                'questionText': q_text,
                'questionType': q_type,
                'options': options,
                'correctAnswer': '', # Hydrated from answer key if available, else blank
                'correctAnswerSource': 'Pending Answer Key Verification',
                'difficulty': 'MEDIUM',
                'marks': marks,
                'negativeMarks': negative_marks,
                'language': 'en',
                'isAuthenticPYQ': True,
                'corpusBucket': 'OFFICIAL_PYQ',
                'sourceTier': 'TIER_A_OFFICIAL',
                'sourceId': f"src_{paper_meta['canonicalPaperId']}",
                'sourceUrl': paper_meta['sourceUrl'],
                'sourceDocumentHash': paper_meta['documentHash'],
                'contentHash': content_hash,
                'ingestionState': 'EXTRACTED',
                'verificationStatus': 'OFFICIAL_CONFIRMED',
                'provenanceRecords': [{
                    'sourceTier': 'TIER_A_OFFICIAL',
                    'sourceName': paper_meta['sourceName'],
                    'sourceUrl': paper_meta['sourceUrl'],
                    'sourceDomain': 'ugcnetonline.in',
                    'retrievedAt': paper_meta['retrievedAt'],
                    'isOfficial': True,
                    'contentHash': content_hash,
                }],
                'vectorIndexed': False,
                'retrievalTested': False,
                'createdAt': int(time.time() * 1000),
                'updatedAt': int(time.time() * 1000),
            })

    return extracted

def main():
    if not os.path.exists(VERIFIED_MANIFEST_IN):
        print(f"Manifest {VERIFIED_MANIFEST_IN} not found. Exiting.")
        return
        
    with open(VERIFIED_MANIFEST_IN, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        
    print(f"Extracting questions from {len(manifest)} verified official papers...")
    
    total_extracted = 0
    paper_stats = []
    
    all_extracted_questions = []
    
    for idx, paper_meta in enumerate(manifest):
        pdf_path = paper_meta['localPath']
        if not os.path.exists(pdf_path):
            print(f"[{idx+1}/{len(manifest)}] PDF missing: {pdf_path}")
            continue
            
        qs = extract_questions_from_pdf(pdf_path, paper_meta)
        total_extracted += len(qs)
        
        out_filename = f"{paper_meta['canonicalPaperId'].replace(':', '_')}.json"
        out_filepath = os.path.join(OUT_DIR, out_filename)
        
        with open(out_filepath, 'w', encoding='utf-8') as f:
            json.dump(qs, f, indent=2)
            
        all_extracted_questions.extend(qs)
        
        paper_stats.append({
            'canonicalPaperId': paper_meta['canonicalPaperId'],
            'year': paper_meta['year'],
            'session': paper_meta['session'],
            'paper': paper_meta['paper'],
            'extractedCount': len(qs),
            'localJson': out_filepath
        })
        
        print(f"[{idx+1}/{len(manifest)}] {paper_meta['canonicalPaperId']} => Extracted {len(qs)} questions")
        
    # Save combined pool
    pool_path = 'dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json'
    with open(pool_path, 'w', encoding='utf-8') as f:
        json.dump(all_extracted_questions, f, indent=2)
        
    stats_path = 'dataset_staging/ugc_net_cs/extraction_summary.json'
    with open(stats_path, 'w', encoding='utf-8') as f:
        json.dump(paper_stats, f, indent=2)
        
    print(f"\n=======================================================")
    print(f"[SUCCESS] EXTRACTION COMPLETED: {total_extracted} total questions extracted!")
    print(f"Saved combined questions pool to: {pool_path}")
    print(f"Saved stats to: {stats_path}")
    print(f"=======================================================")

if __name__ == '__main__':
    main()
