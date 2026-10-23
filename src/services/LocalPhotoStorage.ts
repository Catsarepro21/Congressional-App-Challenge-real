import * as FileSystem from 'expo-file-system/legacy';
import {localImageUri} from './OfflinePolicy';

function isCacheCopy(uri: string): boolean {
  if (!FileSystem.cacheDirectory) return false;
  try {
    // React Native's built-in URL parser does not reliably implement file: pathnames.
    const localPath = (value: string): string => {
      const match = /^file:\/\/(\/[^?#]*)$/i.exec(value);
      if (!match) throw new Error('Not a local file URL.');
      const path = decodeURIComponent(match[1]).replace(/^\/private(?=\/var\/)/, '');
      if (path.startsWith('//') || path.includes('\\') || /%[a-f0-9]{2}/i.test(path) || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid local file path.');
      return path;
    };
    const filePath = localPath(uri); const cachePath = localPath(FileSystem.cacheDirectory);
    return filePath.startsWith(cachePath.endsWith('/') ? cachePath : cachePath + '/');
  } catch {return false;}
}

/** Keep image bytes inside the encrypted record vault, rather than persisting a cache path. */
export async function inlineLocalPhoto(uri: string): Promise<{uri: string; temporaryFile?: string}> {
  if (!localImageUri(uri)) throw new Error('Only a local image can be saved.');
  if (uri.startsWith('data:image/')) {
    if (uri.length > 14_000_000) throw new Error('Choose an image smaller than 10 MB.');
    return {uri};
  }
  if (!uri.startsWith('file://')) throw new Error('Re-select this photo from your library to save it securely.');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('The selected photo is no longer available. Re-select it or remove the attachment.');
  if (info.isDirectory || info.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const bytes = await FileSystem.readAsStringAsync(uri, {encoding:FileSystem.EncodingType.Base64});
  const extension = /\.(png|webp|heic|heif)(?:$|\?)/i.exec(uri)?.[1].toLowerCase();
  const mime = extension ? `image/${extension}` : 'image/jpeg';
  return {uri:`data:${mime};base64,${bytes}`, temporaryFile:isCacheCopy(uri) ? uri : undefined};
}

/** Never delete the user's original library/file. Only remove picker copies under app cache. */
export async function removePhotoCacheCopy(uri?: string): Promise<void> {
  if (uri && isCacheCopy(uri)) {
    await FileSystem.deleteAsync(uri, {idempotent:true});
  }
}

export async function inlineSavedPhotos(value: string): Promise<{value: string; temporaryFiles: string[]}> {
  const data = JSON.parse(value);
  const temporaryFiles: string[] = [];
  for (const [rows, field] of [[data.state?.loggedItems, 'photoUri'], [data.state?.medicalRecords, 'documentImage']] as const) {
    for (const row of rows || []) {
      const uri = row[field];
      if (!uri) continue;
      if (!localImageUri(uri)) {delete row[field]; continue;} // Never request a legacy remote image.
      if (uri.startsWith('file://')) {
        try {
          if (!(await FileSystem.getInfoAsync(uri)).exists) {
            delete row[field]; row.attachmentMissing = true; continue;
          }
          const photo = await inlineLocalPhoto(uri); row[field] = photo.uri;
          if (photo.temporaryFile) temporaryFiles.push(photo.temporaryFile);
        } catch {
          delete row[field]; row.attachmentMissing = true;
          if (isCacheCopy(uri)) temporaryFiles.push(uri);
        }
      }
    }
  }
  return {value:JSON.stringify(data), temporaryFiles};
}
