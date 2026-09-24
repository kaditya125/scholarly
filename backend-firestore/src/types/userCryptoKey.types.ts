export interface UserCryptoPublicKey {
  uid: string;
  publicKeyJwk: string; // JSON-serialized JWK
  algorithm: 'ECDH-P256';
  updatedAt: number;
}
