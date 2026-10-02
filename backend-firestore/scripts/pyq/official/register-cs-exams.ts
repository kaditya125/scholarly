/**
 * Register Technical CS Examinations in Exam Master & Source Registries
 * Exams:
 *  - GATE_CS: Graduate Aptitude Test in Engineering — Computer Science & IT
 *  - SSC_IMD_CS: Staff Selection Commission — Scientific Assistant (IMD) CS & IT
 *  - ISRO_CS: Indian Space Research Organisation — Scientist/Engineer 'SC' (CS)
 *  - NIC_NIELIT_CS: National Informatics Centre / NIELIT — Scientist-B & Scientific Assistant (CS)
 *  - DRDO_CEPTAM_CS: Defence Research and Development Organisation — CEPTAM STA-B (CS)
 */

import 'dotenv/config';
import { db } from '../../../src/config/firebase';
import { ExamMaster } from '../../../src/types/exam.types';
import { PYQSourceEntry } from '../../../src/types/pyq.types';

const now = Date.now();

const CS_EXAMS: ExamMaster[] = [
  {
    examId: 'GATE_CS',
    name: 'Graduate Aptitude Test in Engineering — Computer Science and Information Technology',
    shortName: 'GATE CS',
    conductingAuthority: 'Indian Institutes of Technology & Indian Institute of Science',
    category: 'ENGINEERING',
    country: 'IN',
    aliases: ['GATE CS', 'GATE CSE', 'GATE CS & IT', 'GATE Computer Science'],
    officialDomains: ['gate2026.iitg.ac.in', 'gate2024.iisc.ac.in', 'gate.iitk.ac.in', 'gate.iitb.ac.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://gate2026.iitg.ac.in',
      examPortal: 'https://gate2026.iitg.ac.in',
      syllabusPage: 'https://gate2026.iitg.ac.in/doc/GATE2026_Syllabus/CS_2026_Syllabus.pdf',
    },
    status: 'ACTIVE',
    description: 'National benchmark examination for admission to postgraduate programs and PSU scientific recruitments in Computer Science & IT.',
    createdAt: now,
    updatedAt: now,
  },
  {
    examId: 'SSC_IMD_CS',
    name: 'SSC Scientific Assistant in Indian Meteorological Department (IMD) — Computer Science & IT',
    shortName: 'SSC IMD CS',
    conductingAuthority: 'Staff Selection Commission / India Meteorological Department',
    category: 'SSC',
    country: 'IN',
    aliases: ['SSC IMD CS', 'SSC Scientific Assistant CS', 'IMD Scientific Assistant', 'SSC IMD Part-D'],
    officialDomains: ['ssc.gov.in', 'ssc.nic.in', 'imd.gov.in'],
    currentCycle: '2022',
    verifiedOfficialUrls: {
      authorityHome: 'https://ssc.gov.in',
      examPortal: 'https://ssc.gov.in/notices',
    },
    status: 'ACTIVE',
    description: 'Central government recruitment examination for Scientific Assistant in the India Meteorological Department under Syllabus 14.3.4 Part-D.',
    createdAt: now,
    updatedAt: now,
  },
  {
    examId: 'ISRO_CS',
    name: "ISRO Centralised Recruitment Board — Scientist/Engineer 'SC' (Computer Science)",
    shortName: 'ISRO CS',
    conductingAuthority: 'Indian Space Research Organisation (ISRO) / ICRB',
    category: 'ENGINEERING',
    country: 'IN',
    aliases: ['ISRO CS', 'ISRO Scientist B CS', 'ISRO ICRB CS', 'ISRO Scientist SC CSE'],
    officialDomains: ['isro.gov.in', 'www.isro.gov.in'],
    currentCycle: '2024',
    verifiedOfficialUrls: {
      authorityHome: 'https://www.isro.gov.in',
      examPortal: 'https://www.isro.gov.in/Careers.html',
    },
    status: 'ACTIVE',
    description: 'Premier national recruitment examination for Scientist/Engineer \'SC\' positions in ISRO centers across India.',
    createdAt: now,
    updatedAt: now,
  },
  {
    examId: 'NIC_NIELIT_CS',
    name: 'NIC / NIELIT Scientist-B & Scientific/Technical Assistant (Computer Science & IT)',
    shortName: 'NIC NIELIT CS',
    conductingAuthority: 'National Informatics Centre / NIELIT',
    category: 'ENGINEERING',
    country: 'IN',
    aliases: ['NIC Scientist B', 'NIELIT Scientist B', 'NIC STA-A', 'NIELIT CS'],
    officialDomains: ['nielit.gov.in', 'www.nielit.gov.in', 'nic.in'],
    currentCycle: '2023',
    verifiedOfficialUrls: {
      authorityHome: 'https://www.nielit.gov.in',
      examPortal: 'https://www.nielit.gov.in/recruitments',
    },
    status: 'ACTIVE',
    description: 'Government of India central scientific recruitment examination for technological positions in the National Informatics Centre.',
    createdAt: now,
    updatedAt: now,
  },
  {
    examId: 'DRDO_CEPTAM_CS',
    name: "DRDO CEPTAM Senior Technical Assistant 'B' (STA-B) — Computer Science & IT",
    shortName: 'DRDO CEPTAM CS',
    conductingAuthority: 'Defence Research and Development Organisation (DRDO) / CEPTAM',
    category: 'DEFENCE',
    country: 'IN',
    aliases: ['DRDO CEPTAM CS', 'DRDO STA-B CS', 'CEPTAM 10 CS', 'DRDO Senior Technical Assistant CS'],
    officialDomains: ['drdo.gov.in', 'www.drdo.gov.in'],
    currentCycle: '2022',
    verifiedOfficialUrls: {
      authorityHome: 'https://www.drdo.gov.in',
      examPortal: 'https://www.drdo.gov.in/careers',
    },
    status: 'ACTIVE',
    description: 'Technical CBT examination for Senior Technical Assistant posts across DRDO defense research laboratories.',
    createdAt: now,
    updatedAt: now,
  },
];

async function main() {
  console.log('--- Registering Exam Master records in Firestore [exams] ---');
  for (const exam of CS_EXAMS) {
    await db.collection('exams').doc(exam.examId).set(exam, { merge: true });
    console.log(`✅ Registered ExamMaster: ${exam.examId} (${exam.name})`);
  }

  console.log('\n--- Registering Primary Sources in [pyq_source_registry] ---');
  const sources: PYQSourceEntry[] = [
    {
      sourceId: 'src_gate_cs_official_archive',
      examId: 'GATE_CS',
      examName: 'Graduate Aptitude Test in Engineering — Computer Science & IT',
      year: 2024,
      session: 'Annual',
      subject: 'Computer Science & IT',
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: 'GATE National Organizing Committee Official Papers & Keys Archive',
      sourceUrl: 'https://gate2026.iitg.ac.in/archive.html',
      sourceDomain: 'gate2026.iitg.ac.in',
      documentType: 'COMBINED_PAPER_KEY',
      rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
      hasAnswerKey: true,
      hasSolutions: true,
      discoveredAt: now,
      lastCheckedAt: now,
    },
    {
      sourceId: 'src_ssc_imd_cs_2022_official',
      examId: 'SSC_IMD_CS',
      examName: 'SSC Scientific Assistant (IMD) — Computer Science & IT',
      year: 2022,
      session: 'December 2022',
      shift: 'All CBT Shifts',
      subject: 'Part-II Computer Science & IT',
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: 'Staff Selection Commission Official CBT Master Key Archive',
      sourceUrl: 'https://ssc.gov.in/notices/scientific_assistant_imd_2022.pdf',
      sourceDomain: 'ssc.gov.in',
      documentType: 'COMBINED_PAPER_KEY',
      rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
      hasAnswerKey: true,
      hasSolutions: true,
      discoveredAt: now,
      lastCheckedAt: now,
    },
    {
      sourceId: 'src_isro_cs_official_archive',
      examId: 'ISRO_CS',
      examName: "ISRO Scientist/Engineer 'SC' — Computer Science",
      year: 2024,
      session: 'Annual',
      subject: 'Computer Science',
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: 'ISRO ICRB Official Recruitment Question Papers Archive',
      sourceUrl: 'https://www.isro.gov.in/Careers.html',
      sourceDomain: 'isro.gov.in',
      documentType: 'COMBINED_PAPER_KEY',
      rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
      hasAnswerKey: true,
      hasSolutions: true,
      discoveredAt: now,
      lastCheckedAt: now,
    },
    {
      sourceId: 'src_nic_nielit_cs_official_archive',
      examId: 'NIC_NIELIT_CS',
      examName: 'NIC / NIELIT Scientist-B & Scientific Assistant (CS & IT)',
      year: 2023,
      session: 'Annual',
      subject: 'Computer Science & IT',
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: 'NIELIT Central Government Recruitment Portal',
      sourceUrl: 'https://www.nielit.gov.in/recruitments',
      sourceDomain: 'nielit.gov.in',
      documentType: 'COMBINED_PAPER_KEY',
      rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
      hasAnswerKey: true,
      hasSolutions: true,
      discoveredAt: now,
      lastCheckedAt: now,
    },
    {
      sourceId: 'src_drdo_ceptam_cs_official_archive',
      examId: 'DRDO_CEPTAM_CS',
      examName: 'DRDO CEPTAM STA-B — Computer Science & IT',
      year: 2022,
      session: 'Annual',
      subject: 'Computer Science & IT',
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: 'DRDO CEPTAM Official Recruitment Archive',
      sourceUrl: 'https://www.drdo.gov.in/careers',
      sourceDomain: 'drdo.gov.in',
      documentType: 'COMBINED_PAPER_KEY',
      rightsStatus: 'PUBLIC_DOMAIN_OR_CLEAR',
      hasAnswerKey: true,
      hasSolutions: true,
      discoveredAt: now,
      lastCheckedAt: now,
    },
  ];

  for (const src of sources) {
    await db.collection('pyq_source_registry').doc(src.sourceId).set(src, { merge: true });
    console.log(`✅ Registered Source: ${src.sourceId} (${src.examId})`);
  }

  console.log('\n🎉 Successfully registered all 5 CS technical exam master tracks and source entries.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Registration failed:', err);
  process.exit(1);
});
