import request from 'supertest';
import express from 'express';
import { requireAuth } from '../../src/middlewares/auth';

const app = express();
app.use(express.json());
// For raw binary simulation, normally we'd use multer middleware in the route.
// Here we mock the behavior of multer rejecting massive files.

const mockMulterLimits = (req: any, res: any, next: any) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 25 * 1024 * 1024) {
    return res.status(400).json({ error: 'File size exceeds 25MB limit' });
  }
  next();
};

app.post('/api/notebooks/:id/sources', requireAuth, mockMulterLimits, (req, res) => {
  res.status(200).json({ success: true });
});

describe('Upload Validation Gates', () => {
  it('should reject payloads exceeding 25MB', async () => {
    const res = await request(app)
      .post('/api/notebooks/nb_123/sources')
      .set('Authorization', 'Bearer valid_mock_token')
      .set('Content-Length', (30 * 1024 * 1024).toString()) // 30 MB
      .send('a'.repeat(100)); // Dummy payload, content-length header triggers logic
    expect(res.status).toBe(400);
  });
});
