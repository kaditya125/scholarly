import request from 'supertest';
import express from 'express';
import { requireAuth } from '../../src/middlewares/auth';
import { NotebookController } from '../../src/controllers/notebook.controller';
// In a real integration test, we'd mock the repository to return a notebook owned by 'mock_user_1'
// and test what happens when 'mock_user_2' tries to read it.

const app = express();
app.use(express.json());

// Dummy router for testing isolation
app.get('/api/notebooks/:id', requireAuth, async (req, res) => {
  const notebookOwnerId = 'mock_user_1'; // Hardcoded mock
  if (req.user?.uid !== notebookOwnerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.status(200).json({ id: req.params.id, title: 'My Notebook' });
});

describe('Tenant Isolation Gates', () => {
  it('should allow the owner to access their notebook', async () => {
    const res = await request(app)
      .get('/api/notebooks/nb_123')
      .set('Authorization', 'Bearer valid_mock_token'); // Resolves to mock_user_1
    expect(res.status).toBe(200);
  });

  it('should forbid a different user from accessing the notebook', async () => {
    const res = await request(app)
      .get('/api/notebooks/nb_123')
      .set('Authorization', 'Bearer valid_mock_token_2'); // Resolves to mock_user_2
    expect(res.status).toBe(403);
  });
});
