import { db } from '../config/firebase';
import { UserCryptoPublicKey } from '../types/userCryptoKey.types';

export class UserCryptoKeyRepository {
  private collection = db.collection('userCryptoKeys');

  async setKey(uid: string, publicKeyJwk: string): Promise<UserCryptoPublicKey> {
    const now = Date.now();
    const entry: UserCryptoPublicKey = {
      uid,
      publicKeyJwk,
      algorithm: 'ECDH-P256',
      updatedAt: now,
    };
    await this.collection.doc(uid).set(entry, { merge: true });
    return entry;
  }

  async getKey(uid: string): Promise<UserCryptoPublicKey | null> {
    const doc = await this.collection.doc(uid).get();
    if (!doc.exists) return null;
    return doc.data() as UserCryptoPublicKey;
  }
}

export const userCryptoKeyRepository = new UserCryptoKeyRepository();
