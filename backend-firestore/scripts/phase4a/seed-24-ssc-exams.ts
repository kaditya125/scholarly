/**
 * Registry rows for the other examinations SSC conducts.
 *
 * Sources come from the Commission's own notice board API, filtered to the NOTICE OF EXAMINATION
 * for each exam — the advertisement that carries the syllabus in its annexures. Administrative
 * notices (city of examination, option-cum-preference, addenda) match the same headlines and were
 * excluded deliberately: a corrigendum amends a notice, it is not one, and it contains no syllabus.
 *
 * Registry rows only. No syllabi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { examRepository } from '../../src/repositories/exam.repository';
import type { ExamMaster } from '../../src/types/exam.types';

const DOMAINS = ['ssc.gov.in', 'ssc.nic.in'];
const NOW = Date.now();
const SHORT: Record<string, string> = {
  SSC_CHSL: 'SSC CHSL', SSC_MTS: 'SSC MTS', SSC_CPO: 'SSC CPO', SSC_GD: 'SSC GD Constable',
};

interface Row { examId: string; name: string; url: string; title: string }

(async () => {
  const plan: Row[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'ssc-sources.json'), 'utf8'));
  let created = 0, existing = 0;
  for (const row of plan) {
    if (await examRepository.getExamById(row.examId).catch(() => null)) {
      existing++; console.log(`  exists  ${row.examId}`); continue;
    }
    await examRepository.createExam({
      examId: row.examId,
      name: `Staff Selection Commission — ${row.name}`,
      shortName: SHORT[row.examId] || row.examId,
      conductingAuthority: 'Staff Selection Commission',
      category: 'CENTRAL_GOVT',
      country: 'IN',
      aliases: [SHORT[row.examId] || row.examId, row.name],
      officialDomains: DOMAINS,
      currentCycle: '2026',
      verifiedOfficialUrls: {
        authorityHome: 'https://ssc.gov.in',
        applicationPortal: 'https://ssc.gov.in',
        notificationPage: 'https://ssc.gov.in/home/notice-board',
      },
      status: 'ACTIVE',
      description: `${row.name}, conducted by the Staff Selection Commission.`,
      createdAt: NOW,
      updatedAt: NOW,
    } as ExamMaster);
    created++; console.log(`  created ${row.examId.padEnd(10)} ${SHORT[row.examId]}`);
  }
  console.log(`\ncreated=${created} existing=${existing}`);
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
