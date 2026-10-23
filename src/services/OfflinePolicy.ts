/** This build never contacts external app services, even with old saved cloud settings. */
export const LOCAL_ONLY = true;
export const OFFLINE_MESSAGE = 'External services are disabled. Health records and photos are processed on this device.';

export function blockExternalService(): never {
  throw new Error(OFFLINE_MESSAGE);
}

/** Deliberately does not call global fetch. Keep legacy adapters fail-closed. */
export const offlineFetch: typeof fetch = async (..._args) => blockExternalService();

/** Remote images can make network requests without using fetch. */
export function localImageUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  if (/^(file:\/\/|content:\/\/|blob:)/i.test(uri)) return uri;
  if (/^data:image\/(png|jpeg|jpg|webp|heic|heif);base64,/i.test(uri)) return uri;
  return undefined;
}
