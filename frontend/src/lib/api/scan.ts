const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

/** URL that streams a curriculum chapter's PDF bytes (fetched with the auth token, then handed to pdf.js). */
export function chapterPdfUrl(notebookId: string, sourceId: string): string {
  return `${baseURL}/documents/books/${encodeURIComponent(notebookId)}/chapters/${encodeURIComponent(sourceId)}/pdf`;
}

export const scanBaseURL = baseURL;
