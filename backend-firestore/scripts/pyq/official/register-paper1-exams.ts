/**
 * Register Paper-I Non-Technical Examinations in Exam Master & Source Registries
 * Exams:
 *  - SSC_IMD_PAPER1: Staff Selection Commission — Scientific Assistant (IMD) Paper-I (GI & GA)
 *  - SSC_JE_PAPER1: Staff Selection Commission — Junior Engineer Paper-I (GI & GA)
 */

import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { ExamMaster } from '../../../src/types/exam.types';
import { PYQSourceEntry } from '../../../src/types/pyq.types';

const now = Date.now();

const PAPER1_EXAMS: ExamMaster[] = [
  {
    examId: 'SSC_IMD_PAPER1',
    name: 'SSC Scientific Assistant in IMD — Paper-I (General Intelligence, Reasoning & General Awareness)',
    shortName: 'SSC IMD Paper-I',
    conductingAuthority: 'Staff Selection Commission',
    category: 'SSC',
    country: 'IN',
    aliases: ['SSC IMD Paper-1', 'SSC IMD Non-Tech', 'IMD Paper 1', 'SSC Scientific Assistant Paper 1'],
    officialDomains: ['ssc.gov.in', 'ssc.nic.in', 'imd.gov.in'],
    currentCycle: '2022',
    verifiedOfficialUrls: {
      authorityHome: 'https://ssc.gov.in',
      examPortal: 'https://ssc.gov.in/notices',
    },
    status: 'ACTIVE',
    description: 'Official Paper-I examination for Scientific Assistant in the India Meteorological Department comprising General Intelligence & Reasoning (50 marks) and General Awareness with scientific orientation (50 marks).',
    createdAt: now,
    updatedAt: now,
  },
  {
    examId: 'SSC_JE_PAPER1',
    name: 'SSC Junior Engineer — Paper-I (General Intelligence & Reasoning, General Awareness)',
    shortName: 'SSC JE Paper-I',
    conductingAuthority: 'Staff Selection Commission',
    category: 'SSC',
    country: 'IN',
    aliases: ['SSC JE Paper 1', 'SSC JE Non-Tech', 'SSC JE Tier-1'],
    officialDomains: ['ssc.gov.in', 'ssc.nic.in'],
    currentCycle: '2024',
    verifiedOfficialUrls: {
      authorityHome: 'https://ssc.gov.in',
      examPortal: 'https://ssc.gov.in/notices',
    },
    status: 'ACTIVE',
    description: 'Official Paper-I examination for SSC Junior Engineer recruitment testing General Intelligence & Reasoning (50 marks) and General Awareness (50 marks).',
    createdAt: now,
    updatedAt: now,
  },
];

const PAPER1_SOURCES: Record<string, Array<{ year: number; shift: string; sourceUrl: string; name: string }>> = {
  SSC_IMD_PAPER1: [
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022_paper1_shift1.pdf',
      name: 'SSC IMD 2022 Official Paper-I (14 Dec Shift 1)',
    },
    {
      year: 2022,
      shift: '14 Dec 2022 Shift 2',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022_paper1_shift2.pdf',
      name: 'SSC IMD 2022 Official Paper-I (14 Dec Shift 2)',
    },
    {
      year: 2022,
      shift: '15 Dec 2022 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022_paper1_shift3.pdf',
      name: 'SSC IMD 2022 Official Paper-I (15 Dec Shift 1)',
    },
    {
      year: 2017,
      shift: '20 Nov 2017 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2017_paper1_shift1.pdf',
      name: 'SSC IMD 2017 Official Paper-I (20 Nov Shift 1)',
    },
    {
      year: 2017,
      shift: '21 Nov 2017 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2017_paper1_shift2.pdf',
      name: 'SSC IMD 2017 Official Paper-I (21 Nov Shift 1)',
    },
  ],
  SSC_JE_PAPER1: [
    {
      year: 2024,
      shift: '05 June 2024 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/je_2024_paper1_shift1.pdf',
      name: 'SSC JE 2024 Official Paper-I (05 June Shift 1)',
    },
    {
      year: 2023,
      shift: '09 Oct 2023 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/je_2023_paper1_shift1.pdf',
      name: 'SSC JE 2023 Official Paper-I (09 Oct Shift 1)',
    },
    {
      year: 2022,
      shift: '14 Nov 2022 Shift 1',
      sourceUrl: 'https://ssc.gov.in/notices/je_2022_paper1_shift1.pdf',
      name: 'SSC JE 2022 Official Paper-I (14 Nov Shift 1)',
    },
  ],
};

async function main() {
  console.log('🚀 Registering Paper-I Non-Technical Exams in Exam Master and Source Registries...');

  for (const exam of PAPER1_EXAMS) {
    const examRef = db.collection('exams').doc(exam.examId);
    await examRef.set(exam, { merge: true });
    console.log(`✅ ExamMaster registered: ${exam.examId} (${exam.name})`);

    const sources = PAPER1_SOURCES[exam.examId] || [];
    for (const src of sources) {
      const sourceId = `src_${exam.examId.toLowerCase()}_${src.year}_${src.shift.replace(/[\s-]+/g, '_').toLowerCase()}`;
      const sourceEntry: PYQSourceEntry = {
        sourceId,
        examId: exam.examId,
        examName: exam.name,
        year: src.year,
        session: 'Annual',
        shift: src.shift,
        paper: `${exam.shortName} ${src.year}`,
        sourceTier: 'TIER_A_OFFICIAL',
        sourceName: src.name,
        sourceUrl: src.sourceUrl,
        documentType: 'COMBINED_PAPER_KEY',
        hasAnswerKey: true,
        hasSolutions: true,
        language: 'en',
        rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
        officialAuthority: 'Staff Selection Commission (SSC)',
        discoveredAt: now,
        verifiedAt: now,
        isVerified: true,
        sourceWeight: 1.0,
      };

      await db.collection('pyq_source_registry').doc(sourceId).set(sourceEntry, { merge: true });
      console.log(`   📄 Source Registered: ${sourceId}`);
    }
  }

  console.log('✨ All Paper-I exams and sources successfully registered in Firestore.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Registration failed:', err);
  process.exit(1);
});
