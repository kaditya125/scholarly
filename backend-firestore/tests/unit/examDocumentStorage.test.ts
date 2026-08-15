import { examDocumentStorageService } from '../../src/services/exam/examDocumentStorage.service';

// Mock Firebase Storage
const mockSave = jest.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = jest.fn().mockResolvedValue(['https://storage.googleapis.com/test-bucket/exam_documents/SSC_CGL/2026/notice.pdf']);
const mockDownload = jest.fn().mockResolvedValue([Buffer.from('%PDF-1.4 official test document content')]);

jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        save: mockSave,
        getSignedUrl: mockGetSignedUrl,
        download: mockDownload,
      }),
    }),
  }),
}));

describe('ExamDocumentStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes correct SHA-256 hash for binary buffer', () => {
    const buffer = Buffer.from('Official SSC CGL 2026 Syllabus Text');
    const hash = examDocumentStorageService.computeHash(buffer);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });

  it('uploads document buffer to Firebase Storage under structured path', async () => {
    const buffer = Buffer.from('%PDF-1.4 sample notice');
    const result = await examDocumentStorageService.uploadDocumentBuffer({
      examId: 'SSC_CGL',
      cycleId: '2026',
      docType: 'notification',
      buffer,
      fileName: 'official_notice.pdf',
    });

    expect(result.storagePath).toMatch(/^exam_documents\/SSC_CGL\/2026\/notification_/);
    expect(result.downloadUrl).toBeDefined();
    expect(result.hash).toBeDefined();
    expect(result.fileSizeBytes).toBe(buffer.length);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('downloads document buffer from Firebase Storage', async () => {
    const buffer = await examDocumentStorageService.downloadDocumentBuffer('exam_documents/SSC_CGL/2026/notice.pdf');
    expect(buffer).toBeDefined();
    expect(buffer.toString()).toContain('%PDF-1.4');
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});
