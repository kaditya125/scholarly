import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf, walkSyllabusNodes } from '../../src/types/exam.types';
(async () => {
  const snap = await db.collection('exam_syllabi').where('status','==','CURRENT').get();
  console.log(`live syllabi: ${snap.size}\n`);
  let totalTopics = 0, withMarks = 0, withQuestions = 0, withDuration = 0, withSourceRef = 0, subtopics = 0;
  const perExam: any[] = [];
  snap.forEach((d) => {
    const s: any = d.data();
    let t = 0, sub = 0, m = 0;
    walkSyllabusNodes(syllabusNodesOf(s), (n: any) => {
      if (n.type === 'TOPIC') { t++; totalTopics++;
        if (n.marks != null) { withMarks++; m++; }
        if (n.questionCount != null) withQuestions++;
        if (n.durationMinutes != null) withDuration++;
        if (n.officialSourceRef) withSourceRef++; }
      if (n.type === 'SUBTOPIC') { sub++; subtopics++; }
    });
    perExam.push({ exam: s.examId, topics: t, subtopics: sub, topicsWithMarks: m });
  });
  perExam.sort((a,b)=>b.topics-a.topics).forEach(r =>
    console.log(`  ${r.exam.padEnd(16)} topics=${String(r.topics).padStart(4)} subtopics=${String(r.subtopics).padStart(4)} marksOnTopics=${r.topicsWithMarks}`));
  console.log(`\nTOTAL topics=${totalTopics} subtopics=${subtopics}`);
  console.log(`  topics carrying marks:        ${withMarks}`);
  console.log(`  topics carrying questionCount:${withQuestions}`);
  console.log(`  topics carrying duration:     ${withDuration}`);
  console.log(`  topics carrying officialSourceRef: ${withSourceRef}`);

  const g = await db.collection('exam_syllabi_graphs').get();
  console.log(`\ngraph manifests: ${g.size}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
