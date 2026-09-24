/**
 * End-to-End Encryption Service for 1:1 Direct Messages.
 * Uses browser-native Web Crypto API:
 * - Asymmetric Key Exchange: ECDH (Curve P-256)
 * - Symmetric Message Encryption: AES-256-GCM (12-byte IV)
 */

import { e2eeVault } from './e2eeVault';

const E2EE_PREFIX = 'e2ee:v1:';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const e2eeService = {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.crypto &&
      !!window.crypto.subtle
    );
  },

  isEncrypted(text?: string): boolean {
    return Boolean(text && text.startsWith(E2EE_PREFIX));
  },

  /**
   * Loads existing local ECDH keypair from IndexedDB or generates a new one.
   * Returns the public key as a JSON Web Key (JWK) string ready to register with the server.
   */
  async getOrCreateIdentityKey(uid: string): Promise<{ publicKeyJwk: string }> {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API is not supported in this environment');
    }

    const existing = await e2eeVault.getIdentityKey(uid);
    if (existing) {
      return { publicKeyJwk: JSON.stringify(existing.publicKeyJwk) };
    }

    // Generate fresh ECDH keypair on Curve P-256
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false, // privateKey is non-extractable from memory
      ['deriveKey', 'deriveBits']
    );

    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    await e2eeVault.saveIdentityKey(uid, keyPair.privateKey, publicKeyJwk);

    return { publicKeyJwk: JSON.stringify(publicKeyJwk) };
  },

  /**
   * Derives a shared symmetric AES-256-GCM key using the caller's private key and peer's public key.
   */
  async getSharedKey(
    uid: string,
    otherUid: string,
    peerPublicKeyJwkStr: string
  ): Promise<CryptoKey> {
    const pairId = [uid, otherUid].sort().join('__');
    const cached = await e2eeVault.getSharedKey(pairId);
    if (cached) return cached;

    let ownIdentity = await e2eeVault.getIdentityKey(uid);
    if (!ownIdentity) {
      await this.getOrCreateIdentityKey(uid);
      ownIdentity = await e2eeVault.getIdentityKey(uid);
    }
    if (!ownIdentity) {
      throw new Error('Failed to retrieve or generate user identity key');
    }

    const peerJwk = typeof peerPublicKeyJwkStr === 'string'
      ? JSON.parse(peerPublicKeyJwkStr)
      : peerPublicKeyJwkStr;

    const importedPeerKey = await window.crypto.subtle.importKey(
      'jwk',
      peerJwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false,
      []
    );

    const sharedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: importedPeerKey,
      },
      ownIdentity.privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );

    await e2eeVault.saveSharedKey(pairId, sharedKey);
    return sharedKey;
  },

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Returns serialized envelope: `e2ee:v1:<base64-iv>:<base64-ciphertext>`
   */
  async encrypt(
    uid: string,
    otherUid: string,
    peerPublicKeyJwkStr: string,
    plaintext: string
  ): Promise<string> {
    if (!plaintext) return '';
    if (!this.isSupported()) return plaintext;

    const sharedKey = await this.getSharedKey(uid, otherUid, peerPublicKeyJwkStr);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit random IV for AES-GCM
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      sharedKey,
      encoded
    );

    const ivBase64 = bytesToBase64(iv);
    const cipherBase64 = bytesToBase64(new Uint8Array(ciphertextBuffer));

    return `${E2EE_PREFIX}${ivBase64}:${cipherBase64}`;
  },

  /**
   * Decrypts ciphertext. If the message is not encrypted (legacy message), returns it directly.
   */
  async decrypt(
    uid: string,
    otherUid: string,
    peerPublicKeyJwkStr: string,
    messageText: string
  ): Promise<string> {
    if (!messageText || !this.isEncrypted(messageText)) {
      return messageText || '';
    }

    try {
      const parts = messageText.slice(E2EE_PREFIX.length).split(':');
      if (parts.length !== 2) return messageText;

      const [ivBase64, cipherBase64] = parts;
      const iv = base64ToBytes(ivBase64);
      const ciphertext = base64ToBytes(cipherBase64);

      const sharedKey = await this.getSharedKey(uid, otherUid, peerPublicKeyJwkStr);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        sharedKey,
        ciphertext
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.warn('e2eeService: Decryption failed for message payload:', err);
      return '🔒 Encrypted message (Unable to decrypt on this device)';
    }
  },
};
