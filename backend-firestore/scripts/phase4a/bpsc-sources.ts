/**
 * BPSC official syllabus documents, as published by the Commission itself.
 *
 * Discovered from https://bpsc.bihar.gov.in/syllabus/ — a WordPress "syllabus-viewer" plugin whose
 * dropdown loads each exam's PDFs over admin-ajax.php (action `get_syllabus_pdfs`, param item_id).
 * Nothing here is guessed: every URL came back from that endpoint, keyed by the item id the
 * Commission's own dropdown uses.
 *
 * Note the host. The registry had bpsc.bih.nic.in, which does not resolve; the Commission serves
 * from bpsc.bihar.gov.in. That single wrong hostname is why BPSC was previously written off as
 * unreachable — the same mistake made for UPSC (apex vs www) and JEE (.ac.in vs .nic.in).
 */
export interface BpscSource {
  itemId: string;
  exam: string;
  title: string;
  url: string;
}

export const BPSC_SYLLABUS_PAGE = 'https://bpsc.bihar.gov.in/syllabus/';

/** One document per exam. The Simultala teacher exam is subject-wise and kept separate below. */
export const BPSC_SOURCES: BpscSource[] = [
  { itemId: '3',  exam: 'Combined Competitive Exam (Preliminary & Mains)', title: 'Syllabus-CC-Exam-Updated', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-CC-Exam-Updated_20250410_092923_d897d7c5.pdf' },
  { itemId: '4',  exam: 'Judicial Examination', title: 'Syllabus-Judicial-Examination', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-Judicial-Examination_20250410_093016_0d8c1ccf.pdf' },
  { itemId: '27', exam: 'Lower Divisional Clerk Mains', title: 'Ldc Syllabus', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Ldc%20Syllabus_20250807_112642_d0c2af4a.pdf' },
  { itemId: '32', exam: 'Assistant Conservator of Forests', title: 'SY-ACF-05-2019', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/SY-ACF-05-2019_20250829_050424_92dd72b2.pdf' },
  { itemId: '5',  exam: 'Asstt. Prof in GEC and Lecturers in GP/GWP', title: 'Syllabus-AP', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-AP_20250410_093116_f73339d5.pdf' },
  { itemId: '8',  exam: 'Asstt. Director-cum-DPRO', title: 'Syllabus-DPRO-022021', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-DPRO-022021_20250410_093811_a9e30f7d.pdf' },
  { itemId: '6',  exam: 'Home Science for CDPO Exam', title: 'Syllabus-HS-CDPO-Exam', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-HS-CDPO-Exam_20250410_093410_e171797c.pdf' },
  { itemId: '1',  exam: 'DSP Wireless Technical', title: 'Syllabus-DSP-W-Technical', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-DSP-W-Technical_20250410_092432_6508f081.pdf' },
  { itemId: '2',  exam: 'DSP Wireless (Operational)', title: 'Syllabus-DSP-W-Operational', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-DSP-W-Operational_20250410_092625_a33d660e.pdf' },
  { itemId: '7',  exam: 'Occupational Safety, Health and Working Conditions Code, 2020', title: 'Syllabus-052020-MDO', url: 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/Syllabus/Syllabus-052020-MDO_20250410_093621_f12cfe24.pdf' },
];

/**
 * Simultala Awasiya Vidyalaya teacher exam — 24 subject-wise PDFs under one item id.
 * Listed but not ingested: 24 documents is a large embedding spend for one recruitment exam, and
 * that is a budget decision rather than a technical one.
 */
export const BPSC_SIMULTALA_ITEM_ID = '33';
