import { db } from './src/config/firebase';
import { isReadyStatus } from './src/types';

async function fix() {
  const ids = ['ncert-c9-physics', 'ncert-c7-science'];
  for (const id of ids) {
    console.log(`Processing ${id}...`);
    const sources = await db.collection('notebooks').doc(id).collection('sources').get();
    const chapterCount = sources.size;
    const readyChapterCount = sources.docs.filter(s => isReadyStatus((s.data() as any).status)).length;
    const estimatedStudyHours = Math.round(
      sources.docs.reduce((sum, s) => sum + ((s.data() as any).metadata?.estimatedStudyTimeMinutes || 0), 0) / 60
    );
    await db.collection('notebooks').doc(id).update({ chapterCount, readyChapterCount, estimatedStudyHours });
    console.log(`${id} updated -> chapters=${chapterCount} ready=${readyChapterCount}`);
  }
  process.exit(0);
}

fix().catch(e => {
  console.error(e);
  process.exit(1);
});
