/**
 * Registry rows for the other exams BPSC conducts.
 *
 * A syllabus cannot be ingested for an exam that does not exist: the orchestrator looks the exam
 * up to find out which domains count as official for it, and refuses if there is none. Only
 * BPSC_CCE was registered, so the other nine syllabi the Commission publishes had nowhere to go.
 *
 * Registry rows only — no syllabi. The document for each is in bpsc-sources.ts, discovered from
 * the Commission's own syllabus-viewer endpoint.
 *
 * The Simultala Awasiya Vidyalaya teacher exam is deliberately excluded: 24 subject-wise papers
 * for one residential-school recruitment is a larger embedding spend than every other BPSC exam
 * combined, and that was judged not worth it.
 */
import 'dotenv/config';
import { examRepository } from '../../src/repositories/exam.repository';
import type { ExamMaster } from '../../src/types/exam.types';

const DOMAINS = ['bpsc.bihar.gov.in', 'bpsc.bih.nic.in', 'onlinebpsc.bihar.gov.in'];
const NOW = Date.now();

const base = (examId: string, name: string, shortName: string, aliases: string[], description: string): ExamMaster => ({
  examId, name, shortName,
  conductingAuthority: 'Bihar Public Service Commission',
  category: 'STATE_PSC',
  country: 'IN',
  aliases,
  officialDomains: DOMAINS,
  currentCycle: '2026',
  verifiedOfficialUrls: {
    authorityHome: 'https://bpsc.bihar.gov.in',
    applicationPortal: 'https://bpsconline.bihar.gov.in',
    notificationPage: 'https://bpsc.bihar.gov.in/syllabus/',
  },
  status: 'ACTIVE',
  description,
  createdAt: NOW,
  updatedAt: NOW,
} as ExamMaster);

const EXAMS: ExamMaster[] = [
  base('BPSC_JUDICIAL', 'Bihar Judicial Services Competitive Examination', 'BPSC Judicial',
    ['Bihar Judiciary', 'BPSC Judicial', 'Bihar Civil Judge'], 'Recruitment to the Bihar judicial service.'),
  base('BPSC_LDC', 'BPSC Lower Divisional Clerk (Mains) Competitive Examination', 'BPSC LDC',
    ['BPSC LDC', 'Lower Divisional Clerk'], 'Clerical cadre recruitment conducted by the Commission.'),
  base('BPSC_ACF', 'Assistant Conservator of Forests Competitive Examination', 'BPSC ACF',
    ['BPSC ACF', 'Assistant Conservator of Forests'], 'Forest service recruitment for the environment and forest department.'),
  base('BPSC_ASST_PROF', 'Assistant Professor (GEC) and Lecturer (GP/GWP) Examination', 'BPSC Asst Prof',
    ['BPSC Assistant Professor', 'GEC Lecturer'], 'Teaching posts in government engineering and polytechnic institutions.'),
  base('BPSC_DPRO', 'Assistant Director-cum-District Public Relations Officer Examination', 'BPSC DPRO',
    ['BPSC DPRO', 'District Public Relations Officer'], 'Public relations cadre recruitment.'),
  base('BPSC_CDPO_HS', 'Child Development Project Officer (Home Science) Examination', 'BPSC CDPO',
    ['BPSC CDPO', 'Home Science CDPO'], 'Child development project officer recruitment, Home Science paper.'),
  base('BPSC_DSP_WT', 'DSP Wireless (Technical) Competitive Examination', 'BPSC DSP Wireless Tech',
    ['DSP Wireless Technical'], 'Police wireless technical cadre recruitment.'),
  base('BPSC_DSP_WO', 'DSP Wireless (Operational) Competitive Examination', 'BPSC DSP Wireless Ops',
    ['DSP Wireless Operational'], 'Police wireless operational cadre recruitment.'),
  base('BPSC_OSH', 'Occupational Safety, Health and Working Conditions Code Examination', 'BPSC OSH',
    ['BPSC OSH', 'Occupational Safety Health'], 'Recruitment under the Occupational Safety, Health and Working Conditions Code, 2020.'),
];

(async () => {
  let created = 0, existing = 0;
  for (const exam of EXAMS) {
    const found = await examRepository.getExamById(exam.examId).catch(() => null);
    if (found) { existing++; console.log(`  exists  ${exam.examId}`); continue; }
    await examRepository.createExam(exam);
    created++; console.log(`  created ${exam.examId.padEnd(15)} ${exam.shortName}`);
  }
  console.log(`\ncreated=${created} existing=${existing}`);
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
