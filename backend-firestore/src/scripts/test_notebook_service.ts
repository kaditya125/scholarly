import * as assert from 'node:assert';
import { notebookService } from '../services/notebook.service';
import { notebookRepository } from '../repositories/notebook.repository';
import { Notebook } from '../types';

// Mock the repository
const mockNotebooks: Record<string, Notebook> = {};

notebookRepository.createNotebook = async (notebook: Notebook) => {
  mockNotebooks[notebook.id] = notebook;
};
notebookRepository.getNotebook = async (id: string) => {
  return mockNotebooks[id] || null;
};
notebookRepository.updateNotebook = async (id: string, updates: Partial<Notebook>) => {
  if (mockNotebooks[id]) {
    mockNotebooks[id] = { ...mockNotebooks[id], ...updates, updatedAt: Date.now() };
  }
};
notebookRepository.deleteNotebook = async (id: string) => {
  delete mockNotebooks[id];
};
notebookRepository.addTimelineEvent = async () => {};

async function runTests() {
  console.log('--- Running Notebook Service Unit Tests ---');
  const userId = 'user-123';
  const otherUserId = 'user-456';

  // 1. Create Notebook
  const notebook = await notebookService.createNotebook(userId, 'Test Notebook', 'bg-red-500');
  assert.strictEqual(notebook.title, 'Test Notebook');
  assert.strictEqual(notebook.userId, userId);
  assert.strictEqual(notebook.isPinned, false);
  console.log('✅ createNotebook passes');

  // 2. Get Notebook (Authorized)
  const fetched = await notebookService.getNotebookById(notebook.id, userId);
  assert.ok(fetched);
  assert.strictEqual(fetched.id, notebook.id);
  console.log('✅ getNotebookById (Authorized) passes');

  // 3. Get Notebook (Unauthorized)
  try {
    await notebookService.getNotebookById(notebook.id, otherUserId);
    assert.fail('Should have thrown Forbidden error');
  } catch (error: any) {
    assert.strictEqual(error.message, 'Forbidden');
  }
  console.log('✅ getNotebookById (Unauthorized) passes');

  // 4. Update Notebook
  await notebookService.updateNotebook(notebook.id, userId, { isPinned: true });
  const updated = await notebookService.getNotebookById(notebook.id, userId);
  assert.strictEqual(updated?.isPinned, true);
  console.log('✅ updateNotebook passes');

  // 5. Update Notebook (Unauthorized)
  try {
    await notebookService.updateNotebook(notebook.id, otherUserId, { isPinned: false });
    assert.fail('Should have thrown Forbidden error');
  } catch (error: any) {
    assert.strictEqual(error.message, 'Forbidden');
  }
  console.log('✅ updateNotebook (Unauthorized) passes');

  // 6. Delete Notebook
  await notebookService.deleteNotebook(notebook.id, userId);
  const deleted = await notebookService.getNotebookById(notebook.id, userId);
  assert.strictEqual(deleted, null);
  console.log('✅ deleteNotebook passes');

  console.log('🎉 All Unit Tests Passed!');
}

runTests().catch((e) => {
  console.error('❌ Tests Failed:', e);
  process.exit(1);
});
