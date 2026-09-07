import 'dotenv/config';
import { db } from '../../../src/config/firebase';

async function checkOtherCollections() {
  console.log('--- Checking Other PYQ Collections ---');
  
  const sourcesSnap = await db.collection('pyq_source_registry').get();
  console.log(`pyq_source_registry count: ${sourcesSnap.size}`);
  const sourcesByExam: Record<string, number> = {};
  sourcesSnap.forEach(d => {
    const ex = d.data().examId || 'UNKNOWN';
    sourcesByExam[ex] = (sourcesByExam[ex] || 0) + 1;
  });
  console.log('Sources by Exam:', sourcesByExam);

  const auditSnap = await db.collection('pyq_audit_logs').get();
  console.log(`\npyq_audit_logs count: ${auditSnap.size}`);

  const analyticsSnap = await db.collection('pyq_analytics').get();
  console.log(`\npyq_analytics count: ${analyticsSnap.size}`);
  analyticsSnap.forEach(d => {
    console.log(`  Analytics ID: ${d.id} | Exam: ${d.data().examId}`);
  });

  process.exit(0);
}

checkOtherCollections().catch(console.error);
