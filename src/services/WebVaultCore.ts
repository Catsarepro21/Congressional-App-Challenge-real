import type { StorageIO } from './ProtectedStorageCore';
import { createProtectedStorage } from './ProtectedStorageCore';

const PREFIX = 'safescale-aes-v1:';
const ITERATIONS = 600000;
type Envelope = { version: 1; salt: number[]; iv: number[]; data: number[] };

/** Passphrase-derived AES-GCM; the key and passphrase are never written to disk. */
export function createWebVault(io: StorageIO, crypto: Crypto, onLocked: (creating: boolean) => void, transformLegacy?: (value: string) => string, migrateLegacy = true) {
  const AAD = new TextEncoder().encode('SafeScale browser vault v1');
  let key: CryptoKey | undefined;
  let salt: Uint8Array | undefined;
  let pending: { raw: string | null; resolve: () => void; reject: (error: Error) => void } | undefined;
  let unlocking: Promise<void> | undefined;

  function envelope(raw: string): Envelope {
    const value = JSON.parse(raw) as Envelope;
    if (value.version !== 1 || !Array.isArray(value.salt) || value.salt.length !== 16 ||
        !Array.isArray(value.iv) || value.iv.length !== 12 || !Array.isArray(value.data) || value.data.length < 16 ||
        ![...value.salt, ...value.iv, ...value.data].every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new Error('The browser vault is damaged or uses an unsupported format.');
    }
    return value;
  }
  async function decrypt(raw: string, candidate: CryptoKey): Promise<string> {
    const value = envelope(raw);
    const clear = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(value.iv), additionalData:AAD, tagLength:128}, candidate, new Uint8Array(value.data));
    return new TextDecoder().decode(clear);
  }
  async function ensureKey(raw: string | null): Promise<void> {
    if (key) return;
    if (!crypto?.subtle) throw new Error('A secure browser with Web Crypto is required.');
    // Reject corrupt records immediately instead of stranding hydration behind an unlock promise.
    if (raw !== null) {
      if (raw.startsWith(PREFIX)) envelope(raw.slice(PREFIX.length));
      else JSON.parse(raw);
    }
    if (!unlocking) {
      unlocking = new Promise<void>((resolve, reject) => {pending = {raw, resolve, reject};});
      onLocked(!raw?.startsWith(PREFIX));
    }
    await unlocking;
  }
  const protectedIO = createProtectedStorage(io, {
    encrypt: async clear => {
      await ensureKey(null);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:AAD, tagLength:128}, key!, new TextEncoder().encode(clear));
      return JSON.stringify({version:1, salt:Array.from(salt!), iv:Array.from(iv), data:Array.from(new Uint8Array(encrypted))});
    },
    decrypt: async raw => {await ensureKey(PREFIX + raw); return decrypt(raw, key!);},
  }, transformLegacy, migrateLegacy);
  return {
    getItem: async (name: string) => {
      // Unlock before null is returned: onboarding writes must also be encrypted.
      await ensureKey(await io.getItem(name));
      return protectedIO.getItem(name);
    },
    setItem: protectedIO.setItem,
    removeItem: protectedIO.removeItem,
    reset: () => {
      pending?.reject(new Error('The browser vault was reset.'));
      key = undefined; salt = undefined; pending = undefined; unlocking = undefined;
    },
    unlock: async (passphrase: string) => {
      if (!pending) throw new Error('The vault is not waiting to be unlocked.');
      const request = pending;
      const saved = request.raw;
      const creating = !saved?.startsWith(PREFIX);
      if (creating && passphrase.length < 12) throw new Error('Choose a passphrase with at least 12 characters.');
      const nextSalt = saved?.startsWith(PREFIX) ? new Uint8Array(envelope(saved.slice(PREFIX.length)).salt) : crypto.getRandomValues(new Uint8Array(16));
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const candidate = await crypto.subtle.deriveKey({name:'PBKDF2', salt:nextSalt, iterations:ITERATIONS, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
      // Authentication must succeed before hydration can resume or writes can happen.
      if (saved?.startsWith(PREFIX)) {
        try {JSON.parse(await decrypt(saved.slice(PREFIX.length), candidate));}
        catch {throw new Error('Incorrect passphrase or damaged vault. Saved records have not been changed.');}
      } else if (saved !== null) {
        JSON.parse(saved); // Legacy data is migrated only after successful encryption.
      }
      if (pending !== request) throw new Error('The vault changed while unlocking. Please retry.');
      key = candidate; salt = nextSalt;
      pending = undefined; request.resolve();
    },
  };
}
