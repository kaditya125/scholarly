/**
 * Does the extracted UPSC CSE tree actually cover the exam?
 *
 * Validation only says the tree is well-formed. A well-formed tree that is missing half the
 * optional subjects would still publish clean and then tell a Geography-optional candidate that
 * Sadhya has nothing for them — which is worse than saying the syllabus is not loaded yet.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf, walkSyllabusNodes } from '../../src/types/exam.types';

/** The 25 optional subjects UPSC lists, plus the compulsory structure. */
const OPTIONALS = ['Agriculture', 'Animal Husbandry', 'Anthropology', 'Botany', 'Chemistry',
  'Civil Engineering', 'Commerce', 'Economics', 'Electrical Engineering', 'Geography', 'Geology',
  'History', 'Law', 'Management', 'Mathematics', 'Mechanical Engineering', 'Medical Science',
  'Philosophy', 'Physics', 'Political Science', 'Psychology', 'Public Administration',
  'Sociology', 'Statistics', 'Zoology'];
const STRUCTURE = ['Preliminary', 'General Studies', 'Essay', 'Interview', 'Personality',
  'Indian Language', 'English', 'Aptitude'];

(async () => {
  const snap = await db.collection('exam_syllabi').doc('syl_upsc_cse_2026_2026_v1').get();
  const nodes = syllabusNodesOf(snap.data() as any);
  const names: string[] = [];
  walkSyllabusNodes(nodes, (n: any) => names.push(String(n.name || '')));
  const hay = names.join(' | ').toLowerCase().replace(/\s+/g, ' ');
  const has = (t: string) => hay.includes(t.toLowerCase());

  const missOpt = OPTIONALS.filter((o) => !has(o));
  const missStruct = STRUCTURE.filter((o) => !has(o));

  console.log(`nodes: ${names.length}\n`);
  console.log(`OPTIONAL SUBJECTS present: ${OPTIONALS.length - missOpt.length}/${OPTIONALS.length}`);
  if (missOpt.length) console.log('  MISSING:', missOpt.join(', '));
  console.log(`\nCORE STRUCTURE present: ${STRUCTURE.length - missStruct.length}/${STRUCTURE.length}`);
  if (missStruct.length) console.log('  MISSING:', missStruct.join(', '));

  console.log('\n── STAGE nodes ──');
  walkSyllabusNodes(nodes, (n: any) => { if (n.type === 'STAGE') console.log('  ', n.name); });

  // Text-layer damage shows up as words fused together.
  const fused = names.filter((n) => /[a-z][A-Z]{2,}|[A-Z]{3,}[a-z]{3,}[A-Z]/.test(n)).slice(0, 8);
  console.log('\n── suspected text-layer damage ──');
  console.log(fused.length ? fused.map((f) => '   ' + f.slice(0, 80)).join('\n') : '   none');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
