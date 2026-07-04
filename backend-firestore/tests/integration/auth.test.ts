import request from 'supertest';
import express from 'express';
// We assume there's a way to mount the app, for now let's just mock a minimal router or test the middleware directly
// Since we are mocking firebase admin, let's write a pseudo-test demonstrating the auth gate logic
import { requireAuth } from '../../src/middlewares/auth';
import { MockFirebaseAdmin } from '../mocks/MockFirebaseAdmin';

const app = express();
app.use(express.json());

// Replace the real firebase auth with our mock for testing
jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: MockFirebaseAdmin.verifyIdToken
  })
}));

app.get('/api/protected', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

describe('Authorization Gates', () => {
  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('should return 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer invalid_token');
    expect(res.status).toBe(401);
  });

  it('should return 200 and attach user when valid token is provided', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer valid_mock_token');
    expect(res.status).toBe(200);
    expect(res.body.user.uid).toBe('mock_user_1');
  });
});
