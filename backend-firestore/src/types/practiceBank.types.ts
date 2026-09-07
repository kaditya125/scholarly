export interface PracticeBankQuestion {
  id: string;                 // deterministic: sha256(normalised text).slice(0,16)
  text: string;
  options: string[];          // 4
  correctAnswerIndex: number; // 0-indexed AFTER shuffling
  category: string;           // 'gk' | 'science' | 'history' | 'politics' | ...
  origin: 'community_quiz_bank';
  sourceUrl: 'https://github.com/Urten/indian_govt_exam';
  sourceFileSha256: string;   // hash of the xlsx actually downloaded
  ingestedAt: number;
  reviewFlags: string[];      // e.g. ['off_syllabus'], ['time_sensitive'], or []
}
