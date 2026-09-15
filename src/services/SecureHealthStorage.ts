import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AESEncryptionKey, AESSealedData, aesEncryptAsync, aesDecryptAsync } from 'expo-crypto';
import { create } from 'zustand';
import { createProtectedStorage } from './ProtectedStorageCore';

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
});

/** Web preview has no device keychain. Never persist its API/OAuth credentials. */
export function stripWebCredentials(value: string): string {
  const data = JSON.parse(value);
  if (data.state?.profile) {
    delete data.state.profile.geminiApiKey;
    for (const connection of Object.values(data.state.profile.healthConnections || {}) as Record<string, unknown>[]) {
      delete connection.accessToken; delete connection.refreshToken;
    }
  }
  return JSON.stringify(data);
}
export const useStorageStatus = create<{error: string | null; readFailed: boolean}>(() => ({error:null, readFailed:false}));
let deleting = false;
let pendingWrite: {name: string; value: string} | undefined;
let webQueue: Promise<unknown> = Promise.resolve();
function orderedWeb<T>(action: () => Promise<T>): Promise<T> {
  const next = webQueue.then(action); webQueue = next.catch(() => {}); return next;
}
const backend = Platform.OS === 'web' ? {
  ...AsyncStorage,
  getItem: (name: string) => orderedWeb(async () => {
    const value = await AsyncStorage.getItem(name);
    if (value === null) return null;
    const clean = stripWebCredentials(value);
    if (clean !== value) await AsyncStorage.setItem(name, clean);
    return clean;
  }),
  removeItem: (name: string) => orderedWeb(() => AsyncStorage.removeItem(name)),
  setItem: (name: string, value: string) => orderedWeb(() => AsyncStorage.setItem(name, stripWebCredentials(value))),
} : nativeStorage;

export const SecureHealthStorage = {
  getItem: async (name: string) => {
    try {
      const value = await backend.getItem(name);
      useStorageStatus.setState({error:null, readFailed:false}); return value;
    } catch (error) {
      useStorageStatus.setState({error:'Saved data could not be opened. Unlock the device and retry. Your saved data has not been replaced.', readFailed:true});
      throw error;
    }
  },
  setItem: async (name: string, value: string) => {
    if (deleting || useStorageStatus.getState().readFailed) return; // Never replace unreadable data.
    const write = {name, value}; pendingWrite = write;
    try {
      await backend.setItem(name, value);
      if (pendingWrite === write) {pendingWrite = undefined; useStorageStatus.setState({error:null});}
    } catch {
      useStorageStatus.setState({error:'Changes are not saved yet. Unlock the device and retry before closing the app.'});
    }
  },
  removeItem: (name: string) => backend.removeItem(name),
  clearSavedData: async () => {
    deleting = true;
    try {
      // Removal follows every queued encrypted write. No failed write may be retried afterward.
      await backend.removeItem('safescale-storage');
      pendingWrite = undefined;
      if (Platform.OS !== 'web') {
        // The records are already removed; key deletion failure must not restore them.
        try { await SecureStore.deleteItemAsync(KEY_NAME, options); } catch { /* An unused key can remain if the OS denies deletion. */ }
        keyPromise = undefined;
      }
      useStorageStatus.setState({error:null, readFailed:false});
    } finally { deleting = false; }
  },
  retryWrite: async () => {if (pendingWrite) await SecureHealthStorage.setItem(pendingWrite.name, pendingWrite.value);},
};
