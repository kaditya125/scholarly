import { canonicalPyqRetrievalService } from '../../../src/services/pyq/canonicalPyqRetrieval.service';

async function main() {
  console.log('=== TESTING CANONICAL RETRIEVAL FOR MULTI-SHIFT PAPERS ===');

  console.log('\nQuery: SSC CHSL 2024 Tier 1 Shift 1');
  const res2024 = await canonicalPyqRetrievalService.retrieve({
    examId: 'SSC_CHSL',
    year: 2024,
    session: 'tier-1',
    shift: 1,
  });
  console.log('Status:                   ', res2024.status);
  console.log('Candidate Papers Resolved:', res2024.papers.length);
  console.log('Questions Retrieved:      ', res2024.retrievedCount);
  if (res2024.papers.length > 0) {
    const p = res2024.papers[0];
    console.log('Top Paper ID:             ', p.canonicalPaperId);
    console.log('Questions in Group:       ', p.questionCount);
    console.log('Shift:                    ', p.shift);
    console.log('Year:                     ', p.year);
  }
  if (res2024.questions.length > 0) {
    const q1 = res2024.questions[0];
    console.log('Sample Q1 Text:           ', q1.questionText?.slice(0, 80));
    console.log('Sample Q1 Options:        ', q1.options);
    console.log('Sample Q1 Answer:         ', q1.correctAnswer);
  }

  console.log('\nQuery: SSC CHSL 2023 Tier 1 Shift 4');
  const res2023 = await canonicalPyqRetrievalService.retrieve({
    examId: 'SSC_CHSL',
    year: 2023,
    session: 'tier-1',
    shift: 4,
  });
  console.log('Status:                   ', res2023.status);
  console.log('Candidate Papers Resolved:', res2023.papers.length);
  console.log('Questions Retrieved:      ', res2023.retrievedCount);
  if (res2023.papers.length > 0) {
    const p = res2023.papers[0];
    console.log('Top Paper ID:             ', p.canonicalPaperId);
    console.log('Questions in Group:       ', p.questionCount);
    console.log('Shift:                    ', p.shift);
    console.log('Year:                     ', p.year);
  }
  if (res2023.questions.length > 0) {
    const q1 = res2023.questions[0];
    console.log('Sample Q1 Text:           ', q1.questionText?.slice(0, 80));
    console.log('Sample Q1 Options:        ', q1.options);
    console.log('Sample Q1 Answer:         ', q1.correctAnswer);
  }

  console.log('\nQuery: SSC CHSL 2021 Tier 1 Shift 2');
  const res2021 = await canonicalPyqRetrievalService.retrieve({
    examId: 'SSC_CHSL',
    year: 2021,
    session: 'tier-1',
    shift: 2,
  });
  console.log('Status:                   ', res2021.status);
  console.log('Candidate Papers Resolved:', res2021.papers.length);
  console.log('Questions Retrieved:      ', res2021.retrievedCount);
  if (res2021.papers.length > 0) {
    const p = res2021.papers[0];
    console.log('Top Paper ID:             ', p.canonicalPaperId);
    console.log('Questions in Group:       ', p.questionCount);
    console.log('Shift:                    ', p.shift);
    console.log('Year:                     ', p.year);
  }

  console.log('\nQuery: SSC CHSL 2019 Tier 1 Shift 3');
  const res2019 = await canonicalPyqRetrievalService.retrieve({
    examId: 'SSC_CHSL',
    year: 2019,
    session: 'tier-1',
    shift: 3,
  });
  console.log('Status:                   ', res2019.status);
  console.log('Candidate Papers Resolved:', res2019.papers.length);
  console.log('Questions Retrieved:      ', res2019.retrievedCount);
  if (res2019.papers.length > 0) {
    const p = res2019.papers[0];
    console.log('Top Paper ID:             ', p.canonicalPaperId);
    console.log('Questions in Group:       ', p.questionCount);
    console.log('Shift:                    ', p.shift);
    console.log('Year:                     ', p.year);
  }

  console.log('\n✅ RETRIEVAL TESTS COMPLETED!');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
