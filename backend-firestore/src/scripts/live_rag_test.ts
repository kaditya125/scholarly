/**
 * Live RAG pipeline test: upload a source -> parse -> embed -> Pinecone -> KG,
 * then chat WITH the notebook and verify the answer is grounded in the uploaded
 * (fictional) fact and that citations are returned. Run the server first.
 */
import { auth } from '../config/firebase';

const BASE = process.env.E2E_BASE || 'http://localhost:8080';
const WEB_API_KEY = 'AIzaSyC9zvzKpYi0gu_z3L1IAWSCfdMSzK3OhzM';
const TEST_UID = 'live-rag-test-user';

async function getIdToken(uid: string): Promise<string> {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  const data: any = await res.json();
  if (!data.idToken) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.idToken;
}

async function readSSE(res: Response): Promise<{ text: string; citations: number; done: boolean }> {
  let text = '', citations = 0, done = false;
  if (!res.body) return { text, citations, done };
  const reader = (res.body as any).getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop() || '';
    for (const line of parts) {
      if (!line.startsWith('data: ')) continue;
      const s = line.slice(6).trim();
      if (s === '[DONE]') { done = true; continue; }
      try { const e = JSON.parse(s); if (e.type === 'chunk') text += e.content || ''; if (e.type === 'citation') citations++; if (e.type === 'done') done = true; } catch {}
    }
  }
  return { text, citations, done };
}

async function main() {
  const idToken = await getIdToken(TEST_UID);
  const authH: any = { Authorization: `Bearer ${idToken}` };
  const jsonH: any = { ...authH, 'Content-Type': 'application/json' };

  const nbRes = await fetch(`${BASE}/api/notebooks`, { method: 'POST', headers: jsonH, body: JSON.stringify({ title: 'RAG Live Test', color: 'bg-indigo-500' }) });
  const nb: any = await nbRes.json();
  console.log('Notebook created:', nb.id);

  const factText = 'Internal Knowledge Base — Project Bluefire.\n\n' +
    'The Zephyr-9 fusion reactor was invented in the year 2041 by Dr. Aria Chen. ' +
    'It produces exactly 500 megawatts of clean power and uses a helium-3 containment lattice. ' +
    'The reactor core operates at 150 million degrees Celsius and was first tested on Kestrel Island.';

  const form = new FormData();
  form.append('file', new Blob([Buffer.from(factText, 'utf-8')], { type: 'text/plain' }), 'zephyr.txt');
  const upRes = await fetch(`${BASE}/api/notebooks/${nb.id}/sources`, { method: 'POST', headers: authH, body: form as any });
  const src: any = await upRes.json();
  console.log(`Upload: HTTP ${upRes.status}, sourceId=${src.id}, status=${src.status}, sizeBytes=${src.sizeBytes}`);

  // Poll until processing completes (fire-and-forget background pipeline)
  let finalStatus = src.status;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const sRes = await fetch(`${BASE}/api/notebooks/${nb.id}/sources`, { headers: authH });
    const sources: any[] = await sRes.json();
    const s = sources.find(x => x.id === src.id) || sources[0];
    finalStatus = s?.status;
    console.log(`  poll ${i + 1}: status=${finalStatus}`);
    if (finalStatus === 'READY' || finalStatus === 'FAILED') break;
  }

  const gRes = await fetch(`${BASE}/api/notebooks/${nb.id}/graph`, { headers: authH });
  const graph: any = await gRes.json();
  console.log(`KG: ${graph.nodes?.length ?? 0} nodes, ${graph.edges?.length ?? 0} edges`);

  console.log('\n--- RAG chat (with notebookId) ---');
  const chatRes = await fetch(`${BASE}/api/chat/stream`, { method: 'POST', headers: jsonH, body: JSON.stringify({ sessionId: 'rag-' + Date.now(), message: 'According to my notes, who invented the Zephyr-9 reactor and how many megawatts does it produce?', model: 'groq', topicType: 'chat', notebookId: nb.id }) });
  console.log('chat HTTP:', chatRes.status);
  const { text, citations, done } = await readSSE(chatRes);

  const normalized = text.replace(/\s+/g, ' '); // collapse non-breaking spaces etc.
  const groundedName = /aria\s*chen/i.test(normalized);
  const groundedPower = /500/.test(normalized);
  console.log(`citations emitted: ${citations}`);
  console.log(`answer grounded (mentions "Aria Chen"): ${groundedName}`);
  console.log(`answer grounded (mentions "500"): ${groundedPower}`);
  console.log(`stream completed: ${done}`);
  console.log('answer (first 320 chars):', JSON.stringify(text.slice(0, 320)));

  const ragWorks = finalStatus === 'READY' && groundedName && groundedPower;
  console.log(`\n=== RAG PIPELINE ${ragWorks ? 'WORKING ✅' : 'NEEDS ATTENTION ⚠️'} (status=${finalStatus}, citations=${citations}) ===`);
  process.exit(0);
}

main().catch(e => { console.error('RAG test error:', e); process.exit(1); });
