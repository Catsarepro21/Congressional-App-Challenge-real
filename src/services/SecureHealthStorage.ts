import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from 'expo-crypto';
import { create } from 'zustand';
import { createProtectedStorage } from './ProtectedStorageCore';
import { createWebVault } from './WebVaultCore';
import {inlineSavedPhotos, removePhotoCacheCopy} from './LocalPhotoStorage';
import {getRandomBytesAsync} from 'expo-crypto';
import {createPhotoRecordStorage} from './PhotoRecordStorage';

const KEY_NAME = 'safescale.health.encryption.v1';
const options = {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
let keyPromise: Promise<AESEncryptionKey> | undefined;
async function key(createIfMissing: boolean): Promise<AESEncryptionKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      if (!await SecureStore.isAvailableAsync()) throw new Error('Secure storage is unavailable in this build.');
      const stored = await SecureStore.getItemAsync(KEY_NAME, options);
      if (stored) return AESEncryptionKey.import(stored, 'base64');
      if (!createIfMissing) throw new Error('The key for these saved records is unavailable.');
      const generated = await AESEncryptionKey.generate();
      await SecureStore.setItemAsync(KEY_NAME, await generated.encoded('base64'), options);
      return generated;
    })().catch(error => {keyPromise = undefined; throw error;});
  }
  return keyPromise;
}
const nativeStorage = createProtectedStorage(AsyncStorage, {
  encrypt: async value => {
    const sealed = await aesEncryptAsync(new TextEncoder().encode(value), await key(true));
    return sealed.combined('base64');
  },
  decrypt: async value => new TextDecoder().decode(await aesDecryptAsync(AESSealedData.fromCombined(value), await key(false))),
}, stripWebCredentials, false);

/** Web preview has no device keychain. Never persist its API/OAuth credentials. */
export function stripWebCredentials(value: string): string {
  const data = JSON.parse(value);
  if (data.state?.aiPreference === 'cloud') data.state.aiPreference = 'on-device';
  if (data.state?.profile) {
    delete data.state.profile.geminiApiKey;
    for (const [source, connection] of Object.entries(data.state.profile.healthConnections || {}) as [string, Record<string, unknown>][]) {
      const permittedGoogle = source === 'google-health' && Platform.OS === 'ios' && connection.consentVersion === 1;
      if (!permittedGoogle) {delete connection.accessToken; delete connection.refreshToken;}
      if (source === 'google-health' && !permittedGoogle) delete data.state.profile.healthConnections[source];
    }
    delete data.state.profile.healthConnections?.['google-fit'];
    delete data.state.profile.googleAccessToken; delete data.state.profile.googleRefreshToken;
    if (data.state.profile.lastHealthSource?.startsWith('google-') && !data.state.profile.healthConnections?.[data.state.profile.lastHealthSource]) delete data.state.profile.lastHealthSource;
  }
  return JSON.stringify(data);
}
export const useStorageStatus = create<{error: string | null; readFailed: boolean}>(() => ({error:null, readFailed:false}));
export const useWebVaultStatus = create<{locked: boolean; creating: boolean}>(() => ({locked:Platform.OS === 'web', creating:false}));
let deleting = false;
let writeQueue: Promise<unknown> = Promise.resolve();
let pendingWrite: {name: string; value: string} | undefined;
let webQueue: Promise<unknown> = Promise.resolve();
function orderedWeb<T>(action: () => Promise<T>): Promise<T> {
  const next = webQueue.then(action); webQueue = next.catch(() => {}); return next;
}
const webVault = Platform.OS === 'web' ? createWebVault(AsyncStorage, globalThis.crypto, creating => useWebVaultStatus.setState({locked:true, creating}), stripWebCredentials, false) : undefined;
export async function unlockWebVault(passphrase: string): Promise<void> {
  if (!webVault) return;
  await webVault.unlock(passphrase);
  useWebVaultStatus.setState({locked:false});
}
const backend = Platform.OS === 'web' ? {
  ...AsyncStorage,
  getItem: (name: string) => orderedWeb(() => webVault!.getItem(name)),
  removeItem: (name: string) => orderedWeb(() => webVault!.removeItem(name)),
  setItem: (name: string, value: string) => orderedWeb(() => webVault!.setItem(name, value)),
} : nativeStorage;
const photoStorage = createPhotoRecordStorage(backend, async () =>
  Array.from(await getRandomBytesAsync(32), byte => byte.toString(16).padStart(2, '0')).join(''), AsyncStorage.getAllKeys?.bind(AsyncStorage));

export const SecureHealthStorage = {
  getItem: (name: string): Promise<string | null> => {
    const task = writeQueue.then(async () => {
    try {
      const value = await photoStorage.getItem(name);
      const photos = value !== null && Platform.OS !== 'web' ? await inlineSavedPhotos(value) : undefined;
      const clean = value === null ? null : stripWebCredentials(photos?.value ?? value);
      try {
        if (clean !== null) await photoStorage.setItem(name, clean);
        // Remove temporary plaintext copies only after the encrypted write succeeds.
        for (const file of photos?.temporaryFiles || []) {try {await removePhotoCacheCopy(file);} catch { /* The OS may retain its temporary cache copy. */ }}
        useStorageStatus.setState({error:null, readFailed:false});
      } catch {
        if (clean !== null && !pendingWrite) pendingWrite = {name, value:clean};
        useStorageStatus.setState({error:'Records were opened, but storage updates are not saved yet. Free device storage and retry before closing the app.', readFailed:false});
      }
      return clean;
    } catch (error) {
      useStorageStatus.setState({error:'Saved data could not be opened. Unlock the device and retry. Your saved data has not been replaced.', readFailed:true});
      throw error;
    }
    });
    writeQueue = task.catch(() => {}); return task;
  },
  setItem: (name: string, value: string): Promise<void> => {
    if (deleting || useStorageStatus.getState().readFailed) return Promise.resolve();
    const write = {name, value}; pendingWrite = write;
    const task = writeQueue.then(async () => {
      if (deleting || useStorageStatus.getState().readFailed) return;
      try {
        const photos = Platform.OS !== 'web' ? await inlineSavedPhotos(value) : undefined;
        await photoStorage.setItem(name, stripWebCredentials(photos?.value ?? value));
        for (const file of photos?.temporaryFiles || []) {try {await removePhotoCacheCopy(file);} catch { /* Retry cleanup on a later read when possible. */ }}
        if (pendingWrite === write) {pendingWrite = undefined; useStorageStatus.setState({error:null});}
      } catch (error) {
        const detail = error instanceof Error && /^(Photo storage is full|Record storage is full|Choose an image)/.test(error.message)
          ? error.message : 'Unlock the device and retry before closing the app.';
        useStorageStatus.setState({error:`Changes are not saved yet. ${detail}`});
      }
    });
    writeQueue = task.catch(() => {}); return task;
  },
  removeItem: (name: string) => backend.removeItem(name),
  clearSavedData: async (resetState?: () => void) => {
    deleting = true;
    try {
      // Release a pending unlock before waiting for reads/writes, including recovery-screen resets.
      webVault?.reset();
      await writeQueue;
      // Removal follows every queued encrypted write. No failed write may be retried afterward.
      await photoStorage.clear('safescale-storage');
      pendingWrite = undefined;
      if (Platform.OS !== 'web') {
        // The records are already removed; key deletion failure must not restore them.
        try { await SecureStore.deleteItemAsync(KEY_NAME, options); } catch { /* An unused key can remain if the OS denies deletion. */ }
        keyPromise = undefined;
      }
      // Reset application state while persistence is suppressed; deletion must not recreate a vault.
      resetState?.();
      if (webVault) {
        webVault.reset();
        useWebVaultStatus.setState({locked:true, creating:true});
        void webVault.getItem('safescale-storage').catch(() => {});
      }
      useStorageStatus.setState({error:null, readFailed:false});
    } finally { deleting = false; }
  },
  retryWrite: async () => {if (pendingWrite) await SecureHealthStorage.setItem(pendingWrite.name, pendingWrite.value);},
};

