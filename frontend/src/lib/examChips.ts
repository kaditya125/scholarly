export interface ExamChip {
  slug: string;
  name: string;
}

export const EXAM_CHIPS: ExamChip[] = [
  { slug: 'neet', name: 'NEET' },
  { slug: 'jee-main', name: 'JEE Main' },
  { slug: 'jee-advanced', name: 'JEE Advanced' },
  { slug: 'upsc-cse', name: 'UPSC CSE' },
  { slug: 'ssc-cgl', name: 'SSC CGL' },
  { slug: 'ssc-chsl', name: 'SSC CHSL' },
  { slug: 'bpsc', name: 'BPSC' },
  { slug: 'bihar-tre', name: 'Bihar TRE' },
  { slug: 'ctet-stet', name: 'CTET & STET' },
  { slug: 'cuet', name: 'CUET' },
  { slug: 'ibps-po', name: 'IBPS PO' },
  { slug: 'sbi-po', name: 'SBI PO' },
  { slug: 'rbi-grade-b', name: 'RBI Grade B' },
  { slug: 'rrb-ntpc', name: 'RRB NTPC' },
  { slug: 'ugc-net', name: 'UGC NET' },
  { slug: 'state-pscs', name: 'State PSCs' },
  { slug: 'cbse-icse', name: 'CBSE & ICSE' },
];
