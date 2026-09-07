import { db } from '../../../src/config/firebase';

async function main() {
  console.log('Updating 2025 BPSC documents in Firestore to 71st Integrated CCE Prelims...');

  // Query documents where year == 2024 and session == '70th Integrated CCE Prelims' and paperCode == '70th_CCE_PT_2024'
  const snap = await db.collection('pyq_questions')
    .where('examId', '==', 'BPSC_CCE')
    .where('session', '==', '70th Integrated CCE Prelims')
    .get();

  console.log(`Found ${snap.size} documents to update.`);

  let batch = db.batch();
  let count = 0;
  let totalUpdated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    // Only update the 2025 paper (identifiable by paperCode or question starting with Microscope or id)
    if (data.paperCode === '70th_CCE_PT_2024' || doc.id.includes(':70th_prelims:')) {
      const newRef = doc.ref;
      batch.update(newRef, {
        year: 2025,
        session: '71st Integrated CCE Prelims',
        paperCode: 'Series E (11/GA/CC/PT-2025)',
        sourceId: 'src_bpsc_71st_prelims_official',
        topic: `${data.subject || 'General Studies'} (BPSC 71st Official Series E)`,
        solution: data.correctAnswer === 'CANCELLED'
          ? 'Question cancelled/withdrawn by BPSC in the official final answer key.'
          : `Official BPSC Answer Key: (${data.correctAnswer}).\nExamination: 71st Integrated Combined (Preliminary) Competitive Examination (11/GA/CC/PT-2025).`,
        explanation: data.correctAnswer === 'CANCELLED'
          ? 'Question cancelled/withdrawn by BPSC in the official final answer key.'
          : `Official BPSC Answer Key: (${data.correctAnswer}).\nExamination: 71st Integrated Combined (Preliminary) Competitive Examination (11/GA/CC/PT-2025).`,
      });

      count++;
      totalUpdated++;

      if (count === 100) {
        await batch.commit();
        console.log(`   Committed batch of ${count} updates.`);
        batch = db.batch();
        count = 0;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
    console.log(`   Committed final batch of ${count} updates.`);
  }

  console.log(`\n✅ Successfully updated ${totalUpdated} questions to 71st Integrated CCE Prelims (2025)!`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
