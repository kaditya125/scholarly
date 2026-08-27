/** How is the damage distributed in BPSC Asst Prof — scattered, or whole papers ruined? */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf } from '../../src/types/exam.types';

(async () => {
  const snap = await db.collection('exam_syllabi').doc('syl_bpsc_asst_prof_2026_2026_v3').get();
  const nodes = syllabusNodesOf(snap.data() as any);

  // Group topics under whichever PAPER/SUBJECT root they sit beneath.
  const perGroup = new Map<string, string[]>();
  const walk = (n: any, group: string) => {
    const g = (n.type === 'PAPER' || n.type === 'SUBJECT') && n.name ? String(n.name).slice(0, 46) : group;
    if (n.type === 'TOPIC') (perGroup.get(g) || perGroup.set(g, []).get(g)!).push(String(n.name));
    for (const c of n.children || []) walk(c, g);
  };
  nodes.forEach((n: any) => walk(n, '(root)'));

  // Cheap readability proxy: fraction of words that are plain dictionary-shaped tokens.
  const looksWrong = (t: string) => {
    const words = t.split(/[\s,;:().]+/).filter((w) => w.length > 2);
    if (!words.length) return false;
    const odd = words.filter((w) => /[a-z][A-Z]/.test(w) || /[a-zA-Z]*[0-9][a-zA-Z]+/.test(w)
      || /["',]{1}[a-z]/.test(w) || /\b[bcdfghjklmnpqrstvwxz]{4,}/i.test(w));
    return odd.length / words.length > 0.25;
  };

  const rows = [...perGroup.entries()].map(([g, ts]) => {
    const bad = ts.filter(looksWrong).length;
    return { g, n: ts.length, bad, pct: (bad / ts.length) * 100, sample: ts.find(looksWrong) };
  }).sort((a, b) => b.pct - a.pct);

  console.log(`${rows.length} groups, ${rows.reduce((a, r) => a + r.n, 0)} topics\n`);
  console.log('worst groups:');
  for (const r of rows.slice(0, 10)) {
    console.log(`  ${r.pct.toFixed(0).padStart(3)}%  ${String(r.n).padStart(4)} topics  ${r.g}`);
    if (r.sample) console.log(`         ! ${r.sample.slice(0, 84)}`);
  }
  const totalBad = rows.reduce((a, r) => a + r.bad, 0);
  const totalN = rows.reduce((a, r) => a + r.n, 0);
  console.log(`\noverall suspect: ${totalBad}/${totalN} (${((totalBad / totalN) * 100).toFixed(1)}%)`);
  console.log(`groups >30% suspect: ${rows.filter((r) => r.pct > 30).length}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
