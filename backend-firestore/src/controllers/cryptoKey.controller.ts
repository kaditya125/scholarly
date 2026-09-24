import { Request, Response, NextFunction } from 'express';
import { userCryptoKeyRepository } from '../repositories/userCryptoKey.repository';

export class CryptoKeyController {
  public publishKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const { publicKeyJwk } = req.body || {};
      if (!publicKeyJwk || typeof publicKeyJwk !== 'string') {
        return res.status(400).json({ error: 'publicKeyJwk string is required' });
      }

      if (publicKeyJwk.length > 2048) {
        return res.status(400).json({ error: 'publicKeyJwk is too large' });
      }

      // Basic sanity parse to ensure valid JSON
      try {
        const parsed = JSON.parse(publicKeyJwk);
        if (parsed.kty !== 'EC' || parsed.crv !== 'P-256') {
          return res.status(400).json({ error: 'Invalid key type; expected ECDH P-256' });
        }
      } catch {
        return res.status(400).json({ error: 'publicKeyJwk must be valid JSON' });
      }

      const saved = await userCryptoKeyRepository.setKey(uid, publicKeyJwk);
      res.json({ success: true, key: saved });
    } catch (error) {
      next(error);
    }
  };

  public getKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });

      const targetUid = req.params.otherId;
      if (!targetUid) {
        return res.status(400).json({ error: 'otherId is required' });
      }

      const key = await userCryptoKeyRepository.getKey(targetUid);
      res.json({ key });
    } catch (error) {
      next(error);
    }
  };
}

export const cryptoKeyController = new CryptoKeyController();
