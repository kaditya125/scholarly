import { db } from 'd:/scholarly/backend-firestore/src/config/firebase';
import { canonicalPaperIdFor } from 'd:/scholarly/backend-firestore/src/services/pyq/paperIdentity';

async function main() {
  console.log('Auditing and separating Bihar STET canonicalPaperId in Firestore...');

  const regSnap = await db.collection('pyq_source_registry').where('examId', '==', 'BIHAR_STET').get();
  console.log(`Found ${regSnap.size} Bihar STET papers in registry.`);

  let totalQuestionsUpdated = 0;
  let papersUpdated = 0;

  for (const doc of regSnap.docs) {
    const regData = doc.data();
    const newCanonicalPaperId = canonicalPaperIdFor({
      examId: regData.examId,
      year: regData.year,
      session: regData.session,
      shift: regData.shift,
      paper: regData.paper,
      subject: regData.subject,
    });

    console.log(`\nPaper: ${regData.paper} (${regData.year})`);
    console.log(`  Subject: ${regData.subject}`);
    console.log(`  Old ID: ${regData.canonicalPaperId}`);
    console.log(`  New ID: ${newCanonicalPaperId}`);

    // Update registry entry if changed
    if (regData.canonicalPaperId !== newCanonicalPaperId) {
      await doc.ref.update({ canonicalPaperId: newCanonicalPaperId, updatedAt: Date.now() });
      papersUpdated++;
    }

    // Now update all questions associated with this sourceId
    const qSnap = await db.collection('pyq_questions')
      .where('examId', '==', 'BIHAR_STET')
      .where('sourceId', '==', regData.sourceId)
      .get();

    console.log(`  Found ${qSnap.size} questions for sourceId: ${regData.sourceId}`);

    let batch = db.batch();
    let batchCount = 0;

    for (const qDoc of qSnap.docs) {
      if (qDoc.data().canonicalPaperId !== newCanonicalPaperId) {
        batch.update(qDoc.ref, { canonicalPaperId: newCanonicalPaperId });
        batchCount++;
        totalQuestionsUpdated++;

        if (batchCount === 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  }

  console.log(`\n✅ Migration Complete!`);
  console.log(`Papers updated in registry: ${papersUpdated}`);
  console.log(`Questions updated with distinct canonicalPaperId: ${totalQuestionsUpdated}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
