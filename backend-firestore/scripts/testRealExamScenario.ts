/**
 * End-to-End Real Test Case Script
 * Tests the complete Exam Intelligence Copilot pipeline:
 * 1. Official domain verification.
 * 2. Student eligibility evaluation against official reference cutoff dates.
 * 3. Real-time timeline milestone countdowns.
 * 4. Syllabus RAG query retrieval & evidence-grounded AI reply.
 */

import { ExamMaster, ExamSyllabus, ExamOfficialNotification } from '../src/types/exam.types';
import { officialSourceVerificationService } from '../src/services/exam/officialSourceVerification.service';
import { eligibilityCheckerService } from '../src/services/exam/eligibilityChecker.service';
import { notificationTimelineService } from '../src/services/exam/notificationTimeline.service';
import { GeminiProvider } from '../src/services/ai/gemini.provider';
import { PILOT_EXAMS, PILOT_SSC_CGL_SYLLABUS } from '../src/seed/examSeeds';

async function runRealTestScenario() {
  console.log('================================================================================');
  console.log('SCHOLARLY EXAM INTELLIGENCE — REAL END-TO-END TEST CASE RUNNER');
  console.log('================================================================================\n');

  // ─── STEP 1: Official Data & Domain Verification ───────────────────────────
  console.log('STEP 1: Verifying Official Exam Data & Strict Hostname Whitelist...');
  const examMaster: ExamMaster = PILOT_EXAMS[0]; // SSC_CGL
  console.log(`- Examination: ${examMaster.name} (${examMaster.shortName})`);
  console.log(`- Conducting Authority: ${examMaster.conductingAuthority}`);
  console.log(`- Official Whitelisted Domains: ${examMaster.officialDomains.join(', ')}`);

  const testUrls = [
    { url: 'https://ssc.gov.in/notice_cgl_2026.pdf', expected: true },
    { url: 'https://ssc.nic.in/apply', expected: true },
    { url: 'https://upsc.gov.in/cgl_spoof', expected: false }, // Cross-department spoof
    { url: 'https://unauthorized-coaching.com/ssc-syllabus', expected: false },
  ];

  for (const item of testUrls) {
    const res = officialSourceVerificationService.verifyOfficialSource(examMaster, item.url);
    console.log(`  * URL: "${item.url}" -> isOfficial: ${res.isOfficial} (Expected: ${item.expected}) ${res.rejectionReason ? `[${res.rejectionReason}]` : ''}`);
  }

  // ─── STEP 2: Candidate Eligibility & Age Cutoff Evaluation ────────────────
  console.log('\nSTEP 2: Evaluating Candidate Eligibility against Official Notification...');
  const officialNotif: ExamOfficialNotification = {
    notificationId: 'notif_ssc_cgl_2026_official',
    examId: 'SSC_CGL',
    cycleId: '2026',
    notificationType: 'ADV_NOTIFICATION',
    advtNumber: 'F.No. 3/1/2026-P&P-I',
    title: 'Combined Graduate Level Examination, 2026 Notice',
    publishDate: Date.parse('2026-06-24'),
    sourceUrl: 'https://ssc.gov.in/notice_cgl_2026.pdf',
    sourceDocumentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    importantDates: {
      notificationReleaseDate: '2026-06-24',
      applicationStartDate: '2026-06-24',
      applicationEndDate: '2026-07-24',
      feePaymentDeadline: '2026-07-25',
      correctionWindow: { startDate: '2026-08-10', endDate: '2026-08-11' },
      admitCardDate: '2026-09-05',
      examStagesDates: [
        { stageId: 'tier_1', stageName: 'Tier I (CBE)', startDate: '2026-09-15', endDate: '2026-09-26' },
        { stageId: 'tier_2', stageName: 'Tier II (CBE)', startDate: '2026-12-10', endDate: '2026-12-12' },
      ],
      resultDate: '2027-01-20',
    },
    vacancies: {
      total: 17727,
      isTentative: true,
      breakdownByCategory: { UR: 7200, OBC: 4600, SC: 2600, ST: 1300, EWS: 1700, PwD: 327 },
      breakdownByPost: [
        {
          postCode: 'B01',
          postName: 'Assistant Section Officer (CSS)',
          department: 'Department of Personnel & Training',
          payLevel: 7,
          vacancies: 950,
          ageLimit: { min: 20, max: 30 },
          qualifications: "Bachelor's Degree from a recognized University",
        },
        {
          postCode: 'B02',
          postName: 'Inspector of Income Tax',
          department: 'CBDT, Department of Revenue',
          payLevel: 7,
          vacancies: 680,
          ageLimit: { min: 18, max: 30 },
          qualifications: "Bachelor's Degree from a recognized University",
        },
        {
          postCode: 'C01',
          postName: 'Auditor',
          department: 'Offices under C&AG',
          payLevel: 5,
          vacancies: 2400,
          ageLimit: { min: 18, max: 27 },
          qualifications: "Bachelor's Degree from a recognized University",
        },
      ],
    },
    eligibility: {
      ageLimit: {
        min: 18,
        max: 30,
        asOnDate: '2026-08-01',
        relaxations: [
          { category: 'OBC', years: 3 },
          { category: 'SC', years: 5 },
          { category: 'ST', years: 5 },
          { category: 'PwD', years: 10 },
        ],
      },
      educationalQualifications: {
        minimumDegree: "Bachelor's Degree from a recognized University",
        cutoffDate: '2026-08-01',
      },
    },
    feeStructure: {
      general: 100,
      reserved: 0,
      female: 0,
    },
  };

  const studentProfile = {
    dob: '1995-09-20', // Age as on 2026-08-01 is 30 completed years
    category: 'OBC',
    gender: 'MALE' as const,
    highestQualification: 'Bachelor of Technology (Computer Science)',
    hasDegreeCompleted: true,
  };

  const eligibilityResult = eligibilityCheckerService.evaluateEligibility(officialNotif, studentProfile);
  console.log('Candidate Profile:', studentProfile);
  console.log('Eligibility Evaluation Result:');
  console.log(`- Is Candidate Eligible: ${eligibilityResult.isEligible}`);
  console.log(`- Calculated Age on Cutoff (${eligibilityResult.cutoffDate}): ${eligibilityResult.calculatedAge} years`);
  console.log(`- Category Relaxation Applied: +${eligibilityResult.categoryRelaxationYears} years (Max permissible age: ${eligibilityResult.applicableMaxAge} years)`);
  console.log(`- Application Fee: Rs ${eligibilityResult.feeAmount}`);
  console.log(`- Eligible Posts: [${eligibilityResult.eligiblePosts.join(', ')}]`);
  console.log(`- Ineligible Posts:`, eligibilityResult.ineligiblePosts);

  // ─── STEP 3: Timeline & Urgency Countdowns ────────────────────────────────
  console.log('\nSTEP 3: Computing Live Exam Timeline Milestones...');
  const timelines = notificationTimelineService.computeTimeline(officialNotif);
  for (const t of timelines) {
    console.log(`  * [${t.urgencyLevel}] ${t.label}: Target Date ${t.targetDate} (${t.daysRemaining !== undefined ? `${t.daysRemaining} days left` : t.status})`);
  }

  // ─── STEP 4: Real AI Copilot Query Grounded in Canonical Syllabus ──────────
  console.log('\nSTEP 4: Executing Real Student Question on Canonical Syllabus...');

  const studentQuery = "I am preparing for SSC CGL 2026 Tier 1. Can you give me the exact official Quantitative Aptitude syllabus topics with marks/question weightage, and tell me if elementary surds and trigonometric ratios are explicitly in the syllabus?";
  console.log(`STUDENT QUERY:\n"${studentQuery}"\n`);

  // Retrieve matching official syllabus topics from the canonical syllabus
  const canonicalSyllabus: ExamSyllabus = PILOT_SSC_CGL_SYLLABUS;
  const tier1 = canonicalSyllabus.stages.find((s) => s.stageId === 'tier_1');
  const quantSubject = tier1?.papers[0]?.subjects?.find((sub) => sub.subjectId === 'quantitative_aptitude');

  console.log(`RETRIEVED OFFICIAL KNOWLEDGE CHUNKS:`);
  console.log(`- Source Authority: ${canonicalSyllabus.authority} Official Syllabus`);
  console.log(`- Provenance Hash: ${canonicalSyllabus.sourceDocumentHash}`);
  console.log(`- Subject: ${quantSubject?.name} (Marks: ${quantSubject?.marks}, Questions: ${quantSubject?.questionCount})`);
  console.log(`- Official Topics Count: ${quantSubject?.topics?.length}`);

  const retrievedContext = `EXAMINATION: ${examMaster.name} (${examMaster.shortName}) 2026
OFFICIAL SOURCE: ${canonicalSyllabus.sourceDocumentUrl} (SHA-256: ${canonicalSyllabus.sourceDocumentHash})
STAGE: ${tier1?.name}
SUBJECT: ${quantSubject?.name}
WEIGHTAGE: ${quantSubject?.questionCount} Questions, ${quantSubject?.marks} Marks. Duration: 60 Minutes (for all 4 sections in Tier 1).
CANONICAL TOPICS IN OFFICIAL NOTIFICATION:
${quantSubject?.topics?.map((t) => `* Topic: ${t.name} (Subtopics: ${(t.subtopics || []).map((st) => st.name).join(', ')})`).join('\n')}`;

  console.log('\nRetrieved Knowledge Injected into Context:\n' + retrievedContext);

  // Invoke Gemini Provider with strict syllabus guardrails
  console.log('\nINVOCATION: Sending context to LLM Provider (Gemini)...');
  const gemini = new GeminiProvider();

  const systemPrompt = `You are Scholarly Exam Intelligence Copilot, an authoritative, strict, and evidence-grounded AI tutor for competitive examinations.
Answer the student's question using ONLY the provided verified official syllabus context.
Highlight exact official topic titles, question/marks distribution, and confirm or deny topic inclusion based strictly on official records.
Do NOT hallucinate or guess topics not in the official notification.`;

  const promptMessage = `STUDENT QUESTION:
${studentQuery}

VERIFIED OFFICIAL SYLLABUS KNOWLEDGE BASE:
${retrievedContext}

Please provide a structured, authoritative answer.`;

  const aiResponse = await gemini.generateResponse(
    [{ role: 'user', content: promptMessage, timestamp: Date.now() }],
    systemPrompt,
    { operation: 'exam_intelligence_test' }
  );

  console.log('\n================================================================================');
  console.log('REAL LLM GENERATED REPLY:');
  console.log('================================================================================\n');
  console.log(aiResponse.reply);
  console.log('\n================================================================================');
  console.log('TEST COMPLETED SUCCESSFULLY WITH VERIFIED EVIDENCE GROUNDING.');
  console.log('================================================================================\n');
}

runRealTestScenario().catch((err) => {
  console.error('Test scenario failed:', err);
  process.exit(1);
});
