import { Request, Response } from 'express';
import { adminSecretsService } from '../services/adminSecrets.service';
import { logger } from '../../utils/logger';

/**
 * Admin-rotatable third-party API keys. Gated with requireSuperAdmin at the route (see
 * admin.routes.ts) — one step stricter than the requireElevatedAdmin used for
 * Revenue/Payments/Subscriptions/Audit, because writing here changes what credential the
 * running server authenticates to an external provider with. GET never returns plaintext;
 * see runtimeSecrets.service.ts's SecretStatus.
 */
export class SecretsController {
  list = async (_req: Request, res: Response) => {
    try {
      res.json({ secrets: await adminSecretsService.list() });
    } catch (error) {
      logger.error('admin.secrets.list failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to load API keys' });
    }
  };

  set = async (req: Request, res: Response) => {
    const { key } = req.params;
    const value = typeof req.body?.value === 'string' ? req.body.value : '';
    if (!value.trim()) {
      return res.status(400).json({ error: 'value is required' });
    }
    const user = req.user as { uid?: string; email?: string } | undefined;
    if (!user?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      await adminSecretsService.set(key, value, { uid: user.uid, email: user.email || null });
      res.json({ key, updated: true });
    } catch (error: any) {
      if (error?.code === 'UNKNOWN_KEY') {
        return res.status(404).json({ error: error.message });
      }
      logger.error('admin.secrets.set failed', { key, error: error?.message });
      res.status(500).json({ error: 'Failed to save the API key' });
    }
  };

  clear = async (req: Request, res: Response) => {
    const { key } = req.params;
    try {
      await adminSecretsService.clear(key);
      res.json({ key, cleared: true });
    } catch (error: any) {
      if (error?.code === 'UNKNOWN_KEY') {
        return res.status(404).json({ error: error.message });
      }
      logger.error('admin.secrets.clear failed', { key, error: error?.message });
      res.status(500).json({ error: 'Failed to clear the API key' });
    }
  };
}

export const secretsController = new SecretsController();
