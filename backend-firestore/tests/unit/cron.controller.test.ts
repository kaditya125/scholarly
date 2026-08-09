import request from 'supertest';
import express, { Express } from 'express';
import cronRoutes from '../../src/routes/cron.routes';
import { backupService } from '../../src/services/admin/backup.service';
import { env } from '../../src/config/env';

jest.mock('../../src/services/admin/backup.service', () => ({
  backupService: {
    triggerBackup: jest.fn()
  }
}));

describe('Cron Controller', () => {
  let app: Express;
  let originalCronSecret: string | undefined;

  beforeAll(() => {
    originalCronSecret = env.CRON_SECRET;
    // Set a known CRON_SECRET for testing
    env.CRON_SECRET = 'test-cron-secret';

    app = express();
    app.use(express.json());
    app.use('/cron', cronRoutes);
  });

  afterAll(() => {
    env.CRON_SECRET = originalCronSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests without a valid X-Cron-Secret header', async () => {
    const res = await request(app).post('/cron/backup');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should trigger backup and return 202 when authenticated', async () => {
    const mockResult = {
      operationName: 'projects/mock-project/databases/(default)/operations/12345',
      outputUriPrefix: 'gs://mock-bucket/firestore_export_time'
    };
    
    (backupService.triggerBackup as jest.Mock).mockResolvedValue(mockResult);

    const res = await request(app)
      .post('/cron/backup')
      .set('x-cron-secret', 'test-cron-secret');

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Backup operation successfully initiated');
    expect(res.body.operationName).toBe(mockResult.operationName);
    expect(res.body.outputUriPrefix).toBe(mockResult.outputUriPrefix);
    
    expect(backupService.triggerBackup).toHaveBeenCalledTimes(1);
  });

  it('should return 500 if backupService throws an error', async () => {
    (backupService.triggerBackup as jest.Mock).mockRejectedValue(new Error('Bucket not found'));

    const res = await request(app)
      .post('/cron/backup')
      .set('x-cron-secret', 'test-cron-secret');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Bucket not found');
  });
});
