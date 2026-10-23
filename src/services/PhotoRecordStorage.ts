import type {StorageIO} from './ProtectedStorageCore';

const INDEX = 'safescale-photo-index';
const PREFIX = 'safescale-photo-v1:';
// Each chunk is encrypted separately, comfortably below Android's SQLite row limit.
const CHUNK = 128 * 1024;
const MAX_PHOTO = 14_000_000;
const MAX_TOTAL = 20_000_000;
const referencePattern = /^safescale-photo-v1:([a-f0-9]{64}):([1-9][0-9]{0,2})$/;
class MissingPhotoError extends Error {}

function photoFields(data: any): {row: Record<string, any>; field: string}[] {
  return [[data.state?.loggedItems, 'photoUri'], [data.state?.medicalRecords, 'documentImage']]
    .flatMap(([rows, field]) => Array.isArray(rows) ? rows.map(row => ({row, field: field as string})) : []);
}

/** All IO here must already be encrypted. Commit records before collecting old photo chunks. */
export function createPhotoRecordStorage(io: StorageIO, allocateId: () => Promise<string>, listKeys?: () => Promise<readonly string[]>) {
  let cached = new Map<string, string>();
  const chunkNames = (reference: string): string[] => {
    const match = referencePattern.exec(reference);
    if (!match || Number(match[2]) > Math.ceil(MAX_PHOTO / CHUNK)) throw new MissingPhotoError('Invalid saved photo reference.');
    return Array.from({length:Number(match[2])}, (_, i) => `${PREFIX}${match[1]}:${i}`);
  };
  async function index(): Promise<string[]> {
    const raw = await io.getItem(INDEX);
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || !values.every(v => typeof v === 'string' && referencePattern.test(v))) throw new Error('Invalid photo index.');
    return values;
  }
  return {
    getItem: async (name: string) => {
      const value = await io.getItem(name);
      if (value === null) return null;
      const data = JSON.parse(value);
      let total = 0;
      for (const {row, field} of photoFields(data)) {
        const reference = row[field];
        if (typeof reference !== 'string') continue;
        if (reference.startsWith('data:image/')) {
          if (reference.length > MAX_PHOTO || total + reference.length > MAX_TOTAL) {
            delete row[field]; row.attachmentMissing = true;
          } else total += reference.length;
          continue;
        }
        if (!reference.startsWith(PREFIX)) continue;
        try {
          let uri = '';
          for (const chunk of chunkNames(reference)) {
            const part = await io.getItem(chunk);
            if (part === null || part.length > CHUNK) throw new MissingPhotoError('Missing photo chunk.');
            uri += part;
          }
          total += uri.length;
          if (total > MAX_TOTAL || uri.length > MAX_PHOTO || !/^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,/.test(uri)) throw new MissingPhotoError('Invalid saved photo.');
          row[field] = uri; cached.set(uri, reference);
        } catch (error) {
          // Authentication / transient IO failures must never erase the saved attachment on retry.
          if (!(error instanceof MissingPhotoError)) throw error;
          // A damaged attachment must not lock users out of their remaining health records.
          delete row[field]; row.attachmentMissing = true;
        }
      }
      return JSON.stringify(data);
    },
    setItem: async (name: string, value: string) => {
      const data = JSON.parse(value);
      const active = new Set<string>();
      const nextCache = new Map<string, string>();
      const additions = new Map<string, string>();
      let total = 0;
      for (const {row, field} of photoFields(data)) {
        const uri = row[field];
        if (typeof uri !== 'string') continue;
        // References are internal disk values, never accepted from editable application state.
        if (uri.startsWith(PREFIX)) throw new Error('Re-select this photo before saving.');
        if (!uri.startsWith('data:image/')) continue;
        total += uri.length;
        if (uri.length > MAX_PHOTO || total > MAX_TOTAL) throw new Error('Photo storage is full. Remove an attachment or choose smaller images.');
        let reference = cached.get(uri) ?? nextCache.get(uri);
        if (!reference) {
          const id = await allocateId();
          if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Photo identifier creation failed.');
          reference = `${PREFIX}${id}:${Math.ceil(uri.length / CHUNK)}`;
          additions.set(reference, uri);
        }
        active.add(reference); nextCache.set(uri, reference); row[field] = reference;
      }
      const record = JSON.stringify(data);
      if (new TextEncoder().encode(record).byteLength > 768 * 1024) {
        throw new Error('Record storage is full. Export older entries, then remove entries you no longer need.');
      }
      const previous = await index();
      // Journal allocations first so interrupted saves remain discoverable for deletion.
      const allocated = [...new Set([...previous, ...active])];
      if (allocated.length) await io.setItem(INDEX, JSON.stringify(allocated));
      for (const [reference, uri] of additions) {
        const names = chunkNames(reference);
        for (let i = 0; i < names.length; i++) await io.setItem(names[i], uri.slice(i * CHUNK, (i + 1) * CHUNK));
      }
      await io.setItem(name, record);
      cached = nextCache;
      for (const reference of previous) {
        if (!active.has(reference)) for (const chunk of chunkNames(reference)) await io.removeItem(chunk);
      }
      if (allocated.length) await io.setItem(INDEX, JSON.stringify([...active]));
    },
    clear: async (name: string) => {
      if (listKeys) {
        // Explicit deletion also works when a damaged vault cannot decrypt its photo index.
        const keys = await listKeys();
        for (const key of keys) if (/^safescale-photo-v1:[a-f0-9]{64}:[0-9]+$/.test(key) || key === INDEX) await io.removeItem(key);
        await io.removeItem(name); cached.clear(); return;
      }
      const references = await index();
      for (const reference of references) for (const chunk of chunkNames(reference)) await io.removeItem(chunk);
      await io.removeItem(INDEX);
      await io.removeItem(name);
      cached.clear();
    },
  };
}
