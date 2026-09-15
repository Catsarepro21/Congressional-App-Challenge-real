/** Serializes writes and migrates legacy JSON only after encryption succeeds. */
export interface StorageIO {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}
export interface StorageCipher {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}
export function createProtectedStorage(io: StorageIO, cipher: StorageCipher) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action); queue = next.catch(() => {}); return next;
  };
  const prefix = 'safescale-aes-v1:';
  return {
    getItem: (name: string) => serialize(async () => {
      const raw = await io.getItem(name);
      if (raw === null) return null;
      if (raw.startsWith(prefix)) return cipher.decrypt(raw.slice(prefix.length));
      JSON.parse(raw); // Reject corrupt legacy state; never overwrite it with defaults.
      const sealed = await cipher.encrypt(raw);
      await io.setItem(name, prefix + sealed);
      return raw;
    }),
    setItem: (name: string, value: string) => serialize(async () => {
      const sealed = await cipher.encrypt(value);
      await io.setItem(name, prefix + sealed);
    }),
    removeItem: (name: string) => serialize(() => io.removeItem(name)),
  };
}
