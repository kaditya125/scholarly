import { API_BASE_URL } from './client';

/** URL that streams a curriculum chapter's PDF bytes (fetched with the auth token, then handed to pdf.js). */
export function chapterPdfUrl(notebookId: string, sourceId: string): string {
  return `${API_BASE_URL}/documents/books/${encodeURIComponent(notebookId)}/chapters/${encodeURIComponent(sourceId)}/pdf`;
}

export const scanBaseURL = API_BASE_URL;
