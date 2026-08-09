const mockNotebookSvc = {
  getNotebooksByUser: jest.fn(), getNotebookById: jest.fn(), createNotebook: jest.fn(),
  updateNotebook: jest.fn(), deleteNotebook: jest.fn(), getSources: jest.fn(),
  getTimeline: jest.fn(), getLearningAssets: jest.fn(), getKnowledgeGraph: jest.fn(),
};
const mockSourceSvc = { processUpload: jest.fn(), deleteSource: jest.fn() };
const mockSharing = { shareWithUser: jest.fn(), generateSecureShareLink: jest.fn() };

jest.mock('../../src/services/notebook.service', () => ({ notebookService: mockNotebookSvc }));
jest.mock('../../src/services/source.service', () => ({ sourceService: mockSourceSvc }));
jest.mock('../../src/services/notebookSharing.service', () => ({ NotebookSharingService: jest.fn(() => mockSharing) }));

import { NotebookController } from '../../src/controllers/notebook.controller';
import { SourceController } from '../../src/controllers/source.controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const nb = new NotebookController();
const src = new SourceController();
beforeEach(() => jest.clearAllMocks());

describe('NotebookController', () => {
  it('getNotebooks: 401, success, 500', async () => {
    const r1 = mockRes();
    await nb.getNotebooks({ user: undefined } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(401);

    const r2 = mockRes();
    mockNotebookSvc.getNotebooksByUser.mockResolvedValueOnce([{ id: 'n1' }]);
    await nb.getNotebooks({ user: { uid: 'u1' } } as any, r2);
    expect(r2.json).toHaveBeenCalledWith([{ id: 'n1' }]);

    const r3 = mockRes();
    mockNotebookSvc.getNotebooksByUser.mockRejectedValueOnce(new Error('db'));
    await nb.getNotebooks({ user: { uid: 'u1' } } as any, r3);
    expect(r3.status).toHaveBeenCalledWith(500);
  });

  it('getNotebook: 404 when missing, 403 on Forbidden, success', async () => {
    const r1 = mockRes();
    mockNotebookSvc.getNotebookById.mockResolvedValueOnce(null);
    await nb.getNotebook({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(404);

    const r2 = mockRes();
    mockNotebookSvc.getNotebookById.mockRejectedValueOnce(new Error('Forbidden'));
    await nb.getNotebook({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, r2);
    expect(r2.status).toHaveBeenCalledWith(403);

    const r3 = mockRes();
    mockNotebookSvc.getNotebookById.mockResolvedValueOnce({ id: 'n1' });
    await nb.getNotebook({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, r3);
    expect(r3.json).toHaveBeenCalledWith({ id: 'n1' });
  });

  it('createNotebook: 400 without title, 201 on success', async () => {
    const r1 = mockRes();
    await nb.createNotebook({ user: { uid: 'u1' }, body: {} } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(400);

    const r2 = mockRes();
    mockNotebookSvc.createNotebook.mockResolvedValueOnce({ id: 'n2' });
    await nb.createNotebook({ user: { uid: 'u1' }, body: { title: 'T', color: 'red' } } as any, r2);
    expect(r2.status).toHaveBeenCalledWith(201);
  });

  it('updateNotebook: 403 on Unauthorized-message, success', async () => {
    const r1 = mockRes();
    mockNotebookSvc.updateNotebook.mockRejectedValueOnce(new Error('Unauthorized access'));
    await nb.updateNotebook({ user: { uid: 'u1' }, params: { id: 'n1' }, body: {} } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(403);

    const r2 = mockRes();
    mockNotebookSvc.updateNotebook.mockResolvedValueOnce(undefined);
    await nb.updateNotebook({ user: { uid: 'u1' }, params: { id: 'n1' }, body: { title: 'x' } } as any, r2);
    expect(r2.json).toHaveBeenCalledWith({ success: true });
  });

  it('deleteNotebook: 403 Forbidden, success', async () => {
    const r1 = mockRes();
    mockNotebookSvc.deleteNotebook.mockRejectedValueOnce(new Error('Forbidden'));
    await nb.deleteNotebook({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(403);

    const r2 = mockRes();
    mockNotebookSvc.deleteNotebook.mockResolvedValueOnce(undefined);
    await nb.deleteNotebook({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, r2);
    expect(r2.json).toHaveBeenCalledWith({ success: true });
  });

  it('getSources / getTimeline / getAssets / getKnowledgeGraph return service data', async () => {
    mockNotebookSvc.getSources.mockResolvedValueOnce([{ id: 's' }]);
    mockNotebookSvc.getTimeline.mockResolvedValueOnce([{ e: 1 }]);
    mockNotebookSvc.getLearningAssets.mockResolvedValueOnce([{ a: 1 }]);
    mockNotebookSvc.getKnowledgeGraph.mockResolvedValueOnce({ nodes: [] });

    const rs = mockRes(); await nb.getSources({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, rs);
    expect(rs.json).toHaveBeenCalledWith([{ id: 's' }]);
    const rt = mockRes(); await nb.getTimeline({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, rt);
    expect(rt.json).toHaveBeenCalledWith([{ e: 1 }]);
    const ra = mockRes(); await nb.getAssets({ user: { uid: 'u1' }, params: { id: 'n1' }, query: { type: 'quiz' } } as any, ra);
    expect(ra.json).toHaveBeenCalledWith([{ a: 1 }]);
    const rg = mockRes(); await nb.getKnowledgeGraph({ user: { uid: 'u1' }, params: { id: 'n1' } } as any, rg);
    expect(rg.json).toHaveBeenCalledWith({ nodes: [] });
  });

  it('shareNotebook + generateShareLink use the sharing service', async () => {
    mockSharing.shareWithUser.mockResolvedValueOnce({ id: 'n1', shared: true });
    const r1 = mockRes();
    await nb.shareNotebook({ user: { uid: 'u1' }, params: { id: 'n1' }, body: { targetEmailOrId: 'x@y.com', role: 'viewer' } } as any, r1);
    expect(r1.json).toHaveBeenCalledWith({ id: 'n1', shared: true });

    mockSharing.generateSecureShareLink.mockResolvedValueOnce('https://share/abc');
    const r2 = mockRes();
    await nb.generateShareLink({ user: { uid: 'u1' }, params: { id: 'n1' }, body: { role: 'viewer', expiresInHours: 24 } } as any, r2);
    expect(r2.json).toHaveBeenCalledWith({ link: 'https://share/abc' });
  });
});

describe('SourceController', () => {
  it('uploadSource: 401, 400 without file, 201 success', async () => {
    const r1 = mockRes();
    await src.uploadSource({ user: undefined, params: { id: 'n1' } } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(401);

    const r2 = mockRes();
    await src.uploadSource({ user: { uid: 'u1' }, params: { id: 'n1' }, file: undefined } as any, r2);
    expect(r2.status).toHaveBeenCalledWith(400);

    const r3 = mockRes();
    mockSourceSvc.processUpload.mockResolvedValueOnce({ id: 'src1' });
    await src.uploadSource({ user: { uid: 'u1' }, params: { id: 'n1' }, file: { originalname: 'a.pdf' } } as any, r3);
    expect(r3.status).toHaveBeenCalledWith(201);
  });

  it('deleteSource: 403 Forbidden, success', async () => {
    const r1 = mockRes();
    mockSourceSvc.deleteSource.mockRejectedValueOnce(new Error('Forbidden'));
    await src.deleteSource({ user: { uid: 'u1' }, params: { id: 'n1', sourceId: 's1' } } as any, r1);
    expect(r1.status).toHaveBeenCalledWith(403);

    const r2 = mockRes();
    mockSourceSvc.deleteSource.mockResolvedValueOnce(undefined);
    await src.deleteSource({ user: { uid: 'u1' }, params: { id: 'n1', sourceId: 's1' } } as any, r2);
    expect(r2.json).toHaveBeenCalledWith({ success: true });
  });
});
