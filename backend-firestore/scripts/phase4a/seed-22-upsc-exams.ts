/**
 * Registry rows for the other examinations UPSC conducts.
 *
 * Discovered by walking the Commission's own Active Examinations list and reading each exam's
 * page for its notification — the document that carries that exam's syllabus in its appendices.
 * Nothing is guessed; upsc-sources.json holds exactly what those pages linked.
 *
 * The list is consolidated to exam FAMILIES rather than listings. UPSC lists Prelims and Mains,
 * and successive cycles, as separate entries, but they are one syllabus: CS(P) and CS(M) are both
 * the Civil Services Examination. Ingesting each listing separately would index the same syllabus
 * several times under different ids.
 *
 * Registry rows only. No syllabi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { examRepository } from '../../src/repositories/exam.repository';
import type { ExamMaster } from '../../src/types/exam.types';

const DOMAINS = ['upsc.gov.in', 'upsconline.nic.in'];
const NOW = Date.now();

interface PlanRow { examId: string; name: string; source: string; url: string }
const PLAN: PlanRow[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'upsc-sources.json'), 'utf8'));

const SHORT: Record<string, string> = {
  UPSC_CSE: 'UPSC CSE', UPSC_IFOS: 'UPSC IFoS', UPSC_ESE: 'UPSC ESE', UPSC_GEO: 'UPSC Geo-Scientist',
  UPSC_CMS: 'UPSC CMS', UPSC_CAPF: 'UPSC CAPF', UPSC_IES_ISS: 'UPSC IES/ISS', UPSC_CDS: 'UPSC CDS',
  UPSC_NDA: 'UPSC NDA', UPSC_CISF_AC: 'UPSC CISF AC', UPSC_SO_STENO: 'UPSC SO/Steno',
};

(async () => {
  let created = 0, existing = 0;
  for (const row of PLAN) {
    const found = await examRepository.getExamById(row.examId).catch(() => null);
    if (found) { existing++; console.log(`  exists  ${row.examId}`); continue; }
    const exam = {
      examId: row.examId,
      name: `Union Public Service Commission — ${row.name}`,
      shortName: SHORT[row.examId] || row.examId,
      conductingAuthority: 'Union Public Service Commission',
      category: 'CENTRAL_GOVT',
      country: 'IN',
      aliases: [SHORT[row.examId] || row.examId, row.name],
      officialDomains: DOMAINS,
      currentCycle: '2026',
      verifiedOfficialUrls: {
        authorityHome: 'https://www.upsc.gov.in',
        applicationPortal: 'https://upsconline.nic.in',
        notificationPage: 'https://www.upsc.gov.in/examinations/active-exams',
      },
      status: 'ACTIVE',
      description: `${row.name}, conducted by the Union Public Service Commission.`,
      createdAt: NOW,
      updatedAt: NOW,
    } as ExamMaster;
    await examRepository.createExam(exam);
    created++; console.log(`  created ${row.examId.padEnd(14)} ${exam.shortName}`);
  }
  console.log(`\ncreated=${created} existing=${existing}`);
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
