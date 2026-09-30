/**
 * Read-only live check of the command-palette search (services/search/search.service.ts) against
 * real Firestore data and, when configured, the real vector store.
 *
 *   cd backend-firestore && npx tsx scripts/check-search-live.ts
 *
 * Needs FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (a read-only service
 * account is enough — this script never writes to Firestore). Optional:
 *   SEARCH_TEST_UID   a Firebase uid whose own chats/notebooks/quizzes/podcasts to search
 *   GEMINI_API_KEY + vector store vars (QDRANT_* or PINECONE_*) [+ COHERE_API_KEY]  → semantic checks
 * Calls the service directly: no server, no sign-in, no HTTP. Caches are in-process only unless
 * REDIS_URL is set, in which case it only writes the same short-lived cache keys the API does.
 */

const hasFirebase = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasVectors = !!(process.env.QDRANT_URL || process.env.PINECONE_API_KEY);
const uid = process.env.SEARCH_TEST_UID || '';

// config/env validates at import time and requires GEMINI_API_KEY; lexical checks don't use it.
if (!hasGemini) process.env.GEMINI_API_KEY = 'unused-lexical-only';

const problems: string[] = [];
const ms = (t: number) => `${Math.round(performance.now() - t)} ms`;
const section = (title: string) => console.log(`\n=== ${title} ===`);

async function main() {
  if (!hasFirebase) {
    console.error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set.');
    process.exit(2);
  }
  const { SearchService } = await import('../src/services/search/search.service');
  const { bookLibraryService } = await import('../src/services/bookLibrary.service');
  const svc = new SearchService();
  const probeUid = uid || '__search_live_check__';

  // ── 1. Chapter index (cold build) ──
  section('Chapter index');
  let t = performance.now();
  const books = await bookLibraryService.listBooks();
  console.log(`book library: ${books.length} books (${ms(t)})`);
  t = performance.now();
  await svc.search(probeUid, 'photosynthesis', { types: ['chapter'] });
  const coldMs = ms(t);
  const entries: any[] = (svc as any).chapterIndex?.entries || [];
  const indexedBooks = new Set(entries.map((e) => e.notebookId));
  console.log(`cold index build + first query: ${coldMs}; ${entries.length} chapters from ${indexedBooks.size} books`);
  const missing = books.filter((b) => !indexedBooks.has(b.notebookId));
  if (missing.length) {
    problems.push(`${missing.length} books have no indexed chapters`);
    console.log(`books with no indexed chapters (${missing.length}): ${missing.slice(0, 10).map((b) => b.title).join(' | ')}`);
  }
  const unnamed = entries.filter((e) => !e.chapterName).length;
  console.log(`chapters without chapterName (label falls back to source title): ${unnamed}`);
  if (entries.length === 0) problems.push('chapter index is empty');

  // ── 2. Real queries (warm) ──
  section('Chapter queries (warm)');
  const queries = [
    'photosynthesis', 'chemical kinetics', 'kinetics', 'light reflection', 'electricity',
    'photosinthesis', 'matematics', 'probability', 'french revolution', 'democracy',
    'acids bases', 'motion', 'life processes',
  ];
  for (const q of queries) {
    t = performance.now();
    const hits = await svc.search(probeUid, q, { types: ['chapter'], limit: 5 });
    const took = ms(t);
    console.log(`"${q}" (${took}) → ${hits.length ? hits.map((h) => `${h.title} [${h.subject} ${h.className || ''}] ${h.score.toFixed(1)}`).join(' | ') : '(none)'}`);
  }

  section('Subject-only queries should not list chapters');
  for (const q of ['science', 'physics', 'hindi', 'class 10']) {
    const hits = await svc.search(probeUid, q, { types: ['chapter'], limit: 20 });
    const flag = hits.length > 5 ? '  ← many' : '';
    console.log(`"${q}" → ${hits.length} chapters${flag}${hits.length ? `: ${hits.slice(0, 3).map((h) => h.title).join(' | ')}` : ''}`);
  }

  // ── 3. Own content ──
  section('Own content');
  if (!uid) {
    console.log('SEARCH_TEST_UID not set — skipped.');
  } else {
    t = performance.now();
    const docs: any[] = await (svc as any).getUserContent(uid);
    console.log(`read own content: ${docs.length} titled items (${ms(t)})`);
    for (const type of ['chat', 'notebook', 'quiz', 'podcast']) {
      const ofType = docs.filter((d) => d.type === type);
      console.log(`  ${type}: ${ofType.length}${ofType.length ? ` — e.g. ${ofType.slice(0, 3).map((d) => `"${d.title}"`).join(', ')}` : ''}`);
    }
    // Search with a word taken from each type's first title, so every type is exercised.
    for (const type of ['chat', 'notebook', 'quiz', 'podcast'] as const) {
      const sample = docs.find((d) => d.type === type);
      const word = sample?.title.split(/\s+/).find((w: string) => w.length >= 4);
      if (!word) continue;
      const hits = await svc.search(uid, word, { types: [type] });
      const found = hits.some((h) => h.id === sample.id);
      if (!found) problems.push(`own ${type} "${sample.title}" not found by "${word}"`);
      console.log(`  "${word}" → ${hits.length} ${type} hits; sample found: ${found}`);
    }
  }

  // ── 4. Semantic ──
  section('Semantic (textbook passages)');
  if (!hasGemini || !hasVectors) {
    console.log('GEMINI_API_KEY and a vector store (QDRANT_URL or PINECONE_API_KEY) are needed — skipped.');
  } else {
    for (const q of ['how do plants make food', 'what is the rate of a reaction', 'why is the sky blue', 'causes of the french revolution']) {
      t = performance.now();
      try {
        const hits = await svc.semantic(q, 4);
        console.log(`"${q}" (${ms(t)}) → ${hits.length ? '' : '(none)'}`);
        for (const h of hits) {
          const labelled = entries.some((e) => e.sourceId === h.sourceId);
          if (!labelled) problems.push(`semantic hit ${h.sourceId} is not in the chapter index`);
          console.log(`   ${h.title} [${h.subject || '?'} ${h.className || ''}] p.${h.pageNumber ?? '?'} ${labelled ? '' : '(not in index) '}— ${h.snippet.slice(0, 90)}…`);
        }
      } catch (err) {
        problems.push(`semantic "${q}" failed: ${String(err)}`);
        console.log(`"${q}" failed: ${String(err)}`);
      }
    }
  }

  section('Summary');
  console.log(problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'No problems found.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('check failed:', err);
    process.exit(1);
  });
