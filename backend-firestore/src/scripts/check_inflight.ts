/**
 * Lists in-flight podcast jobs, so a restart does not kill work in progress.
 *
 * Usage: node --import tsx src/scripts/check_inflight.ts
 */

import '../config/firebase';
import { db } from '../config/firebase';

async function main() {
  const snap = await db
    .collection('podcasts')
    .orderBy('createdAt', 'desc')
    .limit(8)
    .get();

  console.log('\nMost recent podcasts:\n');
  let active = 0;
  for (const d of snap.docs) {
    const p: any = d.data();
    const created = new Date(Number(p.createdAt) || 0).toLocaleTimeString();
    const inflight = !['READY', 'FAILED', 'CANCELLED'].includes(String(p.status));
    if (inflight) active++;
    console.log(
      `${inflight ? '>> ACTIVE ' : '   done   '} ${d.id}  status=${String(p.status).padEnd(10)} ` +
        `pct=${String(p.progressPct ?? '?').padStart(3)}  created=${created}  ${p.title || ''}`
    );
  }
  console.log(`\n${active} job(s) in flight.`);
  console.log(active === 0 ? 'Safe to restart the backend.' : 'A restart WOULD interrupt these.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
